import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from urllib import error, parse, request

from app.core.config import settings
from app.services.nearby_hospital_service import NearbyHospital


EMERGENCY_REALTIME_API_URL = "http://apis.data.go.kr/B552657/ErmctInfoInqireService/getEmrrmRltmUsefulSckbdInfoInqire"
KAKAO_COORD_TO_REGION_URL = "https://dapi.kakao.com/v2/local/geo/coord2regioncode.json"
KAKAO_KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
EMERGENCY_SEARCH_RADIUS_METERS = 20000
MAX_RESULTS = 3


class EmergencyRoomServiceError(RuntimeError):
    pass


@dataclass(frozen=True)
class EmergencyRoomRealtimeItem:
    name: str
    address: str | None
    phone: str | None
    emergency_phone: str | None
    available_beds: int | None


def get_realtime_emergency_room_result(
    latitude: float | None,
    longitude: float | None,
) -> tuple[str, list[NearbyHospital]]:
    if latitude is None or longitude is None:
        return "주변 응급실을 찾으려면 현재 위치가 필요해요. 위치 권한을 허용한 뒤 다시 말씀해 주세요.", []

    rooms = get_realtime_emergency_rooms(latitude, longitude)
    if not rooms:
        return "가까운 응급실을 찾지 못했어요. 많이 급하시면 119에 바로 연락해 주세요.", []

    parts: list[str] = []
    for index, room in enumerate(rooms, start=1):
        bed_fragment = ""
        if room.distance_meters >= 0:
            distance_fragment = f"{room.distance_meters}m"
        else:
            distance_fragment = "거리 확인 필요"
        if room.address:
            address_fragment = f" · {room.address}"
        else:
            address_fragment = ""
        if getattr(room, "available_beds", None) is not None:
            bed_fragment = f" · 응급실 가능 {getattr(room, 'available_beds')}개"
        parts.append(f"{index}. {room.name} {distance_fragment}{bed_fragment}{address_fragment}")

    return f"지금 확인된 가까운 응급실은 {', '.join(parts)}예요. 필요하시면 바로 전화해 보세요.", rooms


def get_realtime_emergency_rooms(latitude: float, longitude: float) -> list[NearbyHospital]:
    if not settings.public_data_api_key:
        raise EmergencyRoomServiceError("PUBLIC_DATA_API_KEY is not configured.")
    if not settings.map_api_key:
        raise EmergencyRoomServiceError("MAP_API_KEY is required for emergency room region lookup.")

    stage1, stage2 = _reverse_geocode_region(latitude, longitude)
    realtime_items = _fetch_realtime_emergency_items(stage1, stage2)

    hospitals: list[NearbyHospital] = []
    seen_names: set[str] = set()

    for item in realtime_items:
        if item.name in seen_names:
            continue

        enriched = _enrich_emergency_room_with_kakao(item, latitude, longitude)
        if not enriched:
            continue

        seen_names.add(item.name)
        hospitals.append(enriched)

    hospitals.sort(key=lambda hospital: hospital.distance_meters)
    return hospitals[:MAX_RESULTS]


def _reverse_geocode_region(latitude: float, longitude: float) -> tuple[str, str]:
    query = parse.urlencode({"x": longitude, "y": latitude})
    req = request.Request(
        f"{KAKAO_COORD_TO_REGION_URL}?{query}",
        headers={"Authorization": f"KakaoAK {settings.map_api_key}"},
        method="GET",
    )

    try:
        with request.urlopen(req, timeout=8) as response:
            body = response.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise EmergencyRoomServiceError(f"Kakao coord2region failed with status {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise EmergencyRoomServiceError(f"Kakao coord2region failed: {exc.reason}") from exc

    import json

    documents = json.loads(body).get("documents", [])
    selected = next((item for item in documents if item.get("region_type") == "H"), None) or (documents[0] if documents else None)
    if not selected:
        raise EmergencyRoomServiceError("Could not resolve region from coordinates.")

    stage1 = str(selected.get("region_1depth_name") or "").strip()
    stage2 = str(selected.get("region_2depth_name") or "").strip() or str(selected.get("region_3depth_name") or "").strip()
    if not stage1 or not stage2:
        raise EmergencyRoomServiceError("Resolved region is incomplete.")

    return stage1, stage2


def _fetch_realtime_emergency_items(stage1: str, stage2: str) -> list[EmergencyRoomRealtimeItem]:
    query = _build_public_data_query(
        {
            "STAGE1": stage1,
            "STAGE2": stage2,
            "pageNo": 1,
            "numOfRows": 30,
        }
    )
    req = request.Request(f"{EMERGENCY_REALTIME_API_URL}?{query}", method="GET")

    try:
        with request.urlopen(req, timeout=10) as response:
            xml_text = response.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise EmergencyRoomServiceError(f"Public emergency API failed with status {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise EmergencyRoomServiceError(f"Public emergency API failed: {exc.reason}") from exc

    root = ET.fromstring(xml_text)
    result_code = root.findtext(".//resultCode")
    if result_code and result_code != "00":
        result_msg = root.findtext(".//resultMsg") or "unknown error"
        raise EmergencyRoomServiceError(f"Public emergency API returned {result_code}: {result_msg}")

    items: list[EmergencyRoomRealtimeItem] = []
    for item in root.findall(".//item"):
        available_beds = _parse_int(item.findtext("hvec"))
        if available_beds is not None and available_beds <= 0:
            continue

        name = (item.findtext("dutyName") or "").strip()
        if not name:
            continue

        items.append(
            EmergencyRoomRealtimeItem(
                name=name,
                address=_optional_text(item.findtext("dutyAddr")),
                phone=_optional_text(item.findtext("dutyTel1")),
                emergency_phone=_optional_text(item.findtext("dutyTel3")),
                available_beds=available_beds,
            )
        )

    return items


def _enrich_emergency_room_with_kakao(
    room: EmergencyRoomRealtimeItem,
    latitude: float,
    longitude: float,
) -> NearbyHospital | None:
    query = parse.urlencode(
        {
            "query": room.name,
            "x": longitude,
            "y": latitude,
            "radius": EMERGENCY_SEARCH_RADIUS_METERS,
            "sort": "distance",
            "page": 1,
            "size": 5,
        }
    )
    req = request.Request(
        f"{KAKAO_KEYWORD_SEARCH_URL}?{query}",
        headers={"Authorization": f"KakaoAK {settings.map_api_key}"},
        method="GET",
    )

    try:
        with request.urlopen(req, timeout=8) as response:
            body = response.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise EmergencyRoomServiceError(f"Kakao emergency enrichment failed with status {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise EmergencyRoomServiceError(f"Kakao emergency enrichment failed: {exc.reason}") from exc

    import json

    documents = json.loads(body).get("documents", [])
    if not documents:
        return None

    selected = documents[0]
    item_latitude = float(selected.get("y") or latitude)
    item_longitude = float(selected.get("x") or longitude)
    distance = _parse_int(selected.get("distance"))
    if distance is None:
        distance = _calculate_distance_meters(latitude, longitude, item_latitude, item_longitude)

    hospital = NearbyHospital(
        name=room.name,
        distance_meters=distance,
        latitude=item_latitude,
        longitude=item_longitude,
        address=room.address or _optional_text(selected.get("road_address_name")) or _optional_text(selected.get("address_name")),
        phone=room.emergency_phone or room.phone or _optional_text(selected.get("phone")),
        place_url=_optional_text(selected.get("place_url")),
        available_beds=room.available_beds,
    )
    return hospital


def _build_public_data_query(params: dict[str, object]) -> str:
    service_key = settings.public_data_api_key
    encoded_params = parse.urlencode({key: value for key, value in params.items() if value is not None})
    if "%" in service_key:
        return f"serviceKey={service_key}&{encoded_params}"
    encoded_key = parse.quote_plus(service_key)
    return f"serviceKey={encoded_key}&{encoded_params}"


def _optional_text(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def _parse_int(value: object) -> int | None:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _calculate_distance_meters(start_latitude: float, start_longitude: float, end_latitude: float, end_longitude: float) -> int:
    radius = 6371000
    latitude_delta = math.radians(end_latitude - start_latitude)
    longitude_delta = math.radians(end_longitude - start_longitude)
    start_latitude_radians = math.radians(start_latitude)
    end_latitude_radians = math.radians(end_latitude)

    a = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(start_latitude_radians) * math.cos(end_latitude_radians) * math.sin(longitude_delta / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(radius * c)

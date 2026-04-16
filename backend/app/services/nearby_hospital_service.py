import json
import math
from dataclasses import dataclass
from urllib import error, parse, request

from app.core.config import settings


KAKAO_CATEGORY_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/category.json"
KAKAO_KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
KAKAO_HOSPITAL_CATEGORY_GROUP_CODE = "HP8"
OVERPASS_API_URL = "https://overpass-api.de/api/interpreter"
SEARCH_RADIUS_METERS = 3000
MAX_RESULTS = 3
EXCLUDED_PLACE_KEYWORDS = (
    "동물",
    "야생",
    "수의",
    "구조센터",
    "보호센터",
    "동물병원",
    "가축",
)


class NearbyHospitalServiceError(RuntimeError):
    pass


@dataclass(frozen=True)
class NearbyHospital:
    name: str
    distance_meters: int
    latitude: float
    longitude: float
    address: str | None = None
    phone: str | None = None
    place_url: str | None = None
    available_beds: int | None = None


def find_nearby_hospitals(latitude: float, longitude: float, emergency_only: bool = False) -> list[NearbyHospital]:
    if settings.map_api_key:
        try:
            return _find_nearby_hospitals_with_kakao(latitude, longitude, emergency_only=emergency_only)
        except NearbyHospitalServiceError:
            # Fall back so the feature still works when Kakao credentials or responses fail.
            pass

    return _find_nearby_hospitals_with_overpass(latitude, longitude, emergency_only=emergency_only)


def _find_nearby_hospitals_with_kakao(
    latitude: float,
    longitude: float,
    emergency_only: bool = False,
) -> list[NearbyHospital]:
    query_params = {
        "x": longitude,
        "y": latitude,
        "radius": SEARCH_RADIUS_METERS,
        "sort": "distance",
        "page": 1,
        "size": 15,
    }
    if emergency_only:
        query_params["query"] = "응급실"
        endpoint_url = KAKAO_KEYWORD_SEARCH_URL
    else:
        query_params["category_group_code"] = KAKAO_HOSPITAL_CATEGORY_GROUP_CODE
        endpoint_url = KAKAO_CATEGORY_SEARCH_URL

    query = parse.urlencode(query_params)
    req = request.Request(
        f"{endpoint_url}?{query}",
        headers={
            "Authorization": f"KakaoAK {settings.map_api_key}",
            "User-Agent": "CareMate/1.0 nearby-hospital-search",
        },
        method="GET",
    )

    try:
        with request.urlopen(req, timeout=8) as response:
            body = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise NearbyHospitalServiceError(f"Kakao nearby hospital search failed with status {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise NearbyHospitalServiceError(f"Kakao nearby hospital search failed: {exc.reason}") from exc

    hospitals: list[NearbyHospital] = []
    seen_names: set[str] = set()

    for item in body.get("documents", []):
        if not _is_human_medical_place(item):
            continue

        name = str(item.get("place_name") or "").strip()
        if not name or name in seen_names:
            continue

        if emergency_only and "응급" not in _stringify_place_fields(item):
            continue

        seen_names.add(name)
        hospitals.append(
            NearbyHospital(
                name=name,
                distance_meters=_parse_distance(item.get("distance")),
                latitude=float(item.get("y") or latitude),
                longitude=float(item.get("x") or longitude),
                address=_pick_kakao_address(item),
                phone=_normalize_phone(item.get("phone")),
                place_url=_normalize_url(item.get("place_url")),
            )
        )

    hospitals.sort(key=lambda hospital: hospital.distance_meters)
    return hospitals[:MAX_RESULTS]


def _find_nearby_hospitals_with_overpass(
    latitude: float,
    longitude: float,
    emergency_only: bool = False,
) -> list[NearbyHospital]:
    if emergency_only:
        query = f"""
        [out:json][timeout:12];
        (
          node["amenity"="hospital"]["emergency"="yes"](around:{SEARCH_RADIUS_METERS},{latitude},{longitude});
          way["amenity"="hospital"]["emergency"="yes"](around:{SEARCH_RADIUS_METERS},{latitude},{longitude});
          relation["amenity"="hospital"]["emergency"="yes"](around:{SEARCH_RADIUS_METERS},{latitude},{longitude});
        );
        out center tags;
        """
    else:
        query = f"""
        [out:json][timeout:12];
        (
          node["amenity"~"hospital|clinic|doctors"](around:{SEARCH_RADIUS_METERS},{latitude},{longitude});
          way["amenity"~"hospital|clinic|doctors"](around:{SEARCH_RADIUS_METERS},{latitude},{longitude});
          relation["amenity"~"hospital|clinic|doctors"](around:{SEARCH_RADIUS_METERS},{latitude},{longitude});
        );
        out center tags;
        """

    req = request.Request(
        OVERPASS_API_URL,
        data=parse.urlencode({"data": query}).encode("utf-8"),
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "CareMate/1.0 nearby-hospital-search",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=10) as response:
            body = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise NearbyHospitalServiceError(f"Overpass nearby hospital search failed with status {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise NearbyHospitalServiceError(f"Overpass nearby hospital search failed: {exc.reason}") from exc

    hospitals: list[NearbyHospital] = []
    seen_names: set[tuple[str, int]] = set()

    for item in body.get("elements", []):
        tags = item.get("tags") or {}
        name = str(tags.get("name") or "").strip()
        if not name:
            continue

        if not _is_human_medical_name(name):
            continue

        if emergency_only and "응급" not in _stringify_place_fields(tags):
            continue

        item_latitude = item.get("lat") or (item.get("center") or {}).get("lat")
        item_longitude = item.get("lon") or (item.get("center") or {}).get("lon")

        if item_latitude is None or item_longitude is None:
            continue

        distance = _calculate_distance_meters(latitude, longitude, float(item_latitude), float(item_longitude))
        dedupe_key = (name, distance // 100)
        if dedupe_key in seen_names:
            continue
        seen_names.add(dedupe_key)

        hospitals.append(
            NearbyHospital(
                name=name,
                distance_meters=distance,
                latitude=float(item_latitude),
                longitude=float(item_longitude),
                address=_build_overpass_address(tags),
                phone=_normalize_phone(tags.get("phone") or tags.get("contact:phone")),
            )
        )

    hospitals.sort(key=lambda hospital: hospital.distance_meters)
    return hospitals[:MAX_RESULTS]


def format_nearby_hospital_answer(latitude: float | None, longitude: float | None) -> str:
    if latitude is None or longitude is None:
        return "주변 병원을 찾으려면 현재 위치가 필요해요. 위치 권한을 허용한 뒤 다시 말씀해 주세요."

    hospitals = find_nearby_hospitals(latitude, longitude)
    if not hospitals:
        return "가까운 병원을 찾지 못했어요. 많이 불편하시면 119나 보호자에게 바로 도움을 요청해 주세요."

    parts = [f"{index}. {hospital.name} {hospital.distance_meters}m" for index, hospital in enumerate(hospitals, start=1)]
    return f"가까운 병원은 {', '.join(parts)}예요."


def format_nearby_emergency_room_answer(latitude: float | None, longitude: float | None) -> str:
    if latitude is None or longitude is None:
        return "주변 응급실을 찾으려면 현재 위치가 필요해요. 위치 권한을 허용한 뒤 다시 말씀해 주세요."

    hospitals = find_nearby_hospitals(latitude, longitude, emergency_only=True)
    if not hospitals:
        return "가까운 응급실을 찾지 못했어요. 많이 급하시면 119에 바로 연락해 주세요."

    parts = [f"{index}. {hospital.name} {hospital.distance_meters}m" for index, hospital in enumerate(hospitals, start=1)]
    return f"가까운 응급실은 {', '.join(parts)}예요."


def get_nearby_hospital_result(
    latitude: float | None,
    longitude: float | None,
    emergency_only: bool = False,
) -> tuple[str, list[NearbyHospital]]:
    if latitude is None or longitude is None:
        if emergency_only:
            return "주변 응급실을 찾으려면 현재 위치가 필요해요. 위치 권한을 허용한 뒤 다시 말씀해 주세요.", []
        return "주변 병원을 찾으려면 현재 위치가 필요해요. 위치 권한을 허용한 뒤 다시 말씀해 주세요.", []

    hospitals = find_nearby_hospitals(latitude, longitude, emergency_only=emergency_only)
    if not hospitals:
        if emergency_only:
            return "가까운 응급실을 찾지 못했어요. 많이 급하시면 119에 바로 연락해 주세요.", []
        return "가까운 병원을 찾지 못했어요. 많이 불편하시면 119나 보호자에게 바로 도움을 요청해 주세요.", []

    parts = [f"{index}. {hospital.name} {hospital.distance_meters}m" for index, hospital in enumerate(hospitals, start=1)]
    if emergency_only:
        return f"가까운 응급실은 {', '.join(parts)}예요. 필요하시면 바로 전화해 보세요.", hospitals
    return f"가까운 병원은 {', '.join(parts)}예요. 필요하시면 바로 전화해 보세요.", hospitals


def _pick_kakao_address(item: dict[str, object]) -> str | None:
    road_address = str(item.get("road_address_name") or "").strip()
    address = str(item.get("address_name") or "").strip()
    return road_address or address or None


def _is_human_medical_place(item: dict[str, object]) -> bool:
    text = _stringify_place_fields(item)
    return _is_human_medical_name(text)


def _is_human_medical_name(value: str) -> bool:
    normalized = value.replace(" ", "")
    return not any(keyword in normalized for keyword in EXCLUDED_PLACE_KEYWORDS)


def _stringify_place_fields(item: dict[str, object]) -> str:
    values = [str(value) for value in item.values() if value is not None]
    return " ".join(values)


def _normalize_phone(value: object) -> str | None:
    phone = str(value or "").strip()
    return phone or None


def _normalize_url(value: object) -> str | None:
    url = str(value or "").strip()
    return url or None


def _build_overpass_address(tags: dict[str, object]) -> str | None:
    if tags.get("addr:full"):
        return str(tags["addr:full"])

    street = str(tags.get("addr:street") or "").strip()
    house_number = str(tags.get("addr:housenumber") or "").strip()
    address = " ".join(part for part in (street, house_number) if part)
    return address or None


def _parse_distance(value: object) -> int:
    try:
        return int(float(str(value)))
    except (TypeError, ValueError):
        return 0


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

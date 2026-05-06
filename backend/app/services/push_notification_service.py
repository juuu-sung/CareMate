from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Iterable

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.guardian_link import GuardianLink
from app.models.user import User
from app.schemas.push import (
    PushTokenDisableRequest,
    PushTokenRegisterRequest,
    PushTokenRegisterResponse,
)


EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send"
LOCATION_REQUEST_ALERT_TYPES = {"location_request"}


def register_push_token(
    db: Session,
    payload: PushTokenRegisterRequest,
) -> PushTokenRegisterResponse:
    expo_push_token = payload.expo_push_token.strip()
    device_id = payload.device_id.strip()
    elder_user_id = payload.elder_user_id.strip()
    link_code = payload.link_code.strip().upper()
    user_id = (payload.user_id or "").strip() or None

    if not expo_push_token:
        raise ValueError("푸시 토큰이 비어 있습니다.")
    if not device_id:
        raise ValueError("기기 식별자가 비어 있습니다.")
    if not elder_user_id or not link_code:
        raise ValueError("연동 정보가 부족합니다.")

    link = (
        db.query(GuardianLink)
        .filter(
            GuardianLink.elder_user_id == elder_user_id,
            GuardianLink.link_code == link_code,
        )
        .first()
    )

    if not link:
        raise ValueError("푸시 토큰을 등록할 연동 정보를 찾지 못했습니다.")

    if payload.user_role == "elder":
        if user_id and user_id != elder_user_id:
            raise ValueError("부모님 사용자 정보가 올바르지 않습니다.")
        user_id = elder_user_id
    elif user_id and link.guardian_user_id and user_id != link.guardian_user_id:
        raise ValueError("보호자 사용자 정보가 올바르지 않습니다.")

    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError("푸시 토큰을 등록할 사용자를 찾지 못했습니다.")

    db.execute(
        text(
            """
            INSERT INTO push_tokens (
                user_id,
                user_role,
                elder_user_id,
                link_code,
                expo_push_token,
                device_id,
                platform,
                enabled,
                last_registered_at,
                updated_at
            )
            VALUES (
                :user_id,
                :user_role,
                :elder_user_id,
                :link_code,
                :expo_push_token,
                :device_id,
                :platform,
                TRUE,
                NOW(),
                NOW()
            )
            ON CONFLICT (expo_push_token) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                user_role = EXCLUDED.user_role,
                elder_user_id = EXCLUDED.elder_user_id,
                link_code = EXCLUDED.link_code,
                device_id = EXCLUDED.device_id,
                platform = EXCLUDED.platform,
                enabled = TRUE,
                last_registered_at = NOW(),
                updated_at = NOW()
            """
        ),
        {
            "user_id": user_id,
            "user_role": payload.user_role,
            "elder_user_id": elder_user_id,
            "link_code": link_code,
            "expo_push_token": expo_push_token,
            "device_id": device_id,
            "platform": payload.platform or "unknown",
        },
    )
    db.commit()

    return PushTokenRegisterResponse(
        registered=True,
        user_role=payload.user_role,
        elder_user_id=elder_user_id,
    )


def disable_push_token(
    db: Session,
    payload: PushTokenDisableRequest,
) -> int:
    expo_push_token = (payload.expo_push_token or "").strip()
    device_id = (payload.device_id or "").strip()

    if not expo_push_token and not device_id:
        raise ValueError("비활성화할 푸시 토큰 또는 기기 식별자가 필요합니다.")

    result = db.execute(
        text(
            """
            UPDATE push_tokens
            SET enabled = FALSE,
                updated_at = NOW()
            WHERE (:expo_push_token = '' OR expo_push_token = :expo_push_token)
              AND (:device_id = '' OR device_id = :device_id)
              AND enabled = TRUE
            """
        ),
        {
            "expo_push_token": expo_push_token,
            "device_id": device_id,
        },
    )
    db.commit()
    return int(result.rowcount or 0)


def dispatch_alert_push(
    db: Session,
    *,
    elder_user_id: str,
    alert_type: str,
    message: str,
    severity: str,
) -> int:
    target_role = "elder" if alert_type in LOCATION_REQUEST_ALERT_TYPES else "guardian"
    tokens = _list_enabled_tokens(db, elder_user_id=elder_user_id, user_role=target_role)

    if not tokens:
        return 0

    title = _build_alert_title(alert_type=alert_type, target_role=target_role)
    data = {
        "kind": "caremate-alert",
        "targetRole": target_role,
        "elderUserId": elder_user_id,
        "alertType": alert_type,
        "severity": severity,
    }

    return send_expo_push_notifications(
        {
            "to": token,
            "title": title,
            "body": message,
            "sound": "default",
            "data": data,
        }
        for token in tokens
    )


def send_expo_push_notifications(messages: Iterable[dict[str, Any]]) -> int:
    payload = list(messages)
    if not payload:
        return 0

    request = urllib.request.Request(
        EXPO_PUSH_ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            response.read()
        return len(payload)
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        print("[PushNotification] Expo push send failed:", error)
        return 0


def _list_enabled_tokens(
    db: Session,
    *,
    elder_user_id: str,
    user_role: str,
) -> list[str]:
    rows = db.execute(
        text(
            """
            SELECT expo_push_token
            FROM push_tokens
            WHERE elder_user_id = :elder_user_id
              AND user_role = :user_role
              AND enabled = TRUE
            ORDER BY last_registered_at DESC
            """
        ),
        {
            "elder_user_id": elder_user_id,
            "user_role": user_role,
        },
    ).mappings().all()

    return [row["expo_push_token"] for row in rows if row["expo_push_token"]]


def _build_alert_title(*, alert_type: str, target_role: str) -> str:
    if target_role == "elder" and alert_type == "location_request":
        return "위치 확인 요청"
    if alert_type == "medication_missed":
        return "복약 확인 필요"
    if alert_type == "location_stale":
        return "위치 확인 필요"
    if alert_type in {"check_in_pending", "check_in_missed"}:
        return "안부 확인 필요"
    if alert_type == "schedule_created":
        return "새 일정 등록"
    return "CareMate 알림"

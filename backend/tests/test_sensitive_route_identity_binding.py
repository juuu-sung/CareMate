import unittest
from unittest.mock import Mock, patch

from app.api.deps import CarePrincipal
from app.api.routers.alerts import post_event_alert
from app.api.routers.location import create_location
from app.api.routers.modes import current_mode, patch_mode
from app.api.routers.push import disable_device_push_token, register_device_push_token
from app.schemas.alerts import AlertEventCreateRequest
from app.schemas.location import LocationSyncRequest
from app.schemas.modes import CareModeUpdateRequest
from app.schemas.push import PushTokenDisableRequest, PushTokenRegisterRequest
from app.services.elder_auth_service import ElderPrincipal


class SensitiveRouteIdentityBindingTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = Mock()
        self.elder = ElderPrincipal(session_id="session-1", elder_user_id="elder-1")
        self.care_elder = CarePrincipal(
            role="elder",
            session_id="session-1",
            actor_user_id="elder-1",
            elder_user_id="elder-1",
        )

    @patch("app.api.routers.location.record_location")
    def test_location_uses_authenticated_elder_id(self, record_location: Mock) -> None:
        record_location.return_value = {
            "elder_user_id": "elder-1",
            "latitude": 37.5,
            "longitude": 127.0,
            "source": "mobile",
            "captured_at": "2026-01-01T00:00:00Z",
            "message": "위치가 저장되었습니다.",
        }
        payload = LocationSyncRequest(latitude=37.5, longitude=127.0)

        create_location(payload, self.elder, self.db)

        record_location.assert_called_once_with(
            self.db,
            payload,
            elder_user_id="elder-1",
        )

    @patch("app.api.routers.push.register_push_token")
    def test_push_registration_overwrites_client_identity(self, register_push_token: Mock) -> None:
        register_push_token.return_value = {
            "registered": True,
            "user_role": "elder",
            "elder_user_id": "elder-1",
        }
        payload = PushTokenRegisterRequest(
            user_role="elder",
            expo_push_token="ExponentPushToken[test]",
            device_id="device-1",
        )

        register_device_push_token(payload, self.care_elder, self.db)

        register_push_token.assert_called_once_with(
            self.db,
            payload,
            user_id="elder-1",
            elder_user_id="elder-1",
            link_code=None,
        )

    @patch("app.api.routers.modes.get_current_mode")
    def test_mode_read_uses_authenticated_elder_id(self, get_current_mode: Mock) -> None:
        current_mode(self.care_elder, self.db)

        get_current_mode.assert_called_once_with(
            self.db,
            elder_user_id="elder-1",
        )

    @patch("app.api.routers.modes.update_mode")
    def test_mode_update_uses_authenticated_elder_id(self, update_mode: Mock) -> None:
        payload = CareModeUpdateRequest(
            mode="basic",
            options={
                "check_in_interval_minutes": 180,
                "alert_repeat_count": 3,
                "always_on_location_enabled": True,
            },
        )

        patch_mode(payload, self.care_elder, self.db)

        update_mode.assert_called_once_with(
            self.db,
            payload,
            elder_user_id="elder-1",
        )

    @patch("app.api.routers.push.disable_push_token", return_value=1)
    def test_push_disable_is_scoped_to_authenticated_user(self, disable_push_token: Mock) -> None:
        payload = PushTokenDisableRequest(device_id="device-1")

        disable_device_push_token(payload, self.care_elder, self.db)

        disable_push_token.assert_called_once_with(
            self.db,
            payload,
            user_id="elder-1",
        )

    @patch("app.api.routers.alerts.create_event_alert")
    def test_event_alert_uses_authenticated_elder_id(self, create_event_alert: Mock) -> None:
        create_event_alert.return_value = {
            "elder_user_id": "elder-1",
            "type": "emergency_call",
            "message": "긴급 연락",
            "created": True,
        }
        payload = AlertEventCreateRequest(
            type="emergency_call",
            message="긴급 연락",
            severity="high",
        )

        post_event_alert(payload, self.elder, self.db)

        create_event_alert.assert_called_once_with(
            self.db,
            payload,
            elder_user_id="elder-1",
        )


if __name__ == "__main__":
    unittest.main()

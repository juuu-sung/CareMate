import unittest
from unittest.mock import Mock

from app.schemas.push import PushTokenRegisterRequest
from app.services.push_notification_service import register_push_token


class PushNotificationAuthorizationTest(unittest.TestCase):
    def test_cannot_reassign_another_users_push_token(self) -> None:
        db = Mock()
        db.query.return_value.filter.return_value.first.return_value = Mock(role="elder")
        db.execute.return_value.mappings.return_value.first.return_value = {
            "user_id": "elder-2"
        }
        payload = PushTokenRegisterRequest(
            user_role="elder",
            expo_push_token="ExponentPushToken[existing]",
            device_id="device-1",
            platform="ios",
        )

        with self.assertRaisesRegex(ValueError, "다른 사용자"):
            register_push_token(
                db,
                payload,
                user_id="elder-1",
                elder_user_id="elder-1",
                link_code=None,
            )


if __name__ == "__main__":
    unittest.main()

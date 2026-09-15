import unittest

from fastapi.testclient import TestClient

from app.main import app


class SensitiveRoutesRequireAuthTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)

    def test_medication_routes_require_bearer_session(self) -> None:
        responses = [
            self.client.get("/api/v1/medications"),
            self.client.get("/api/v1/medications/analytics"),
            self.client.post(
                "/api/v1/medications/record",
                json={"medication_name": "혈압약", "status": "taken"},
            ),
        ]

        self.assertTrue(all(response.status_code == 401 for response in responses))

    def test_schedule_route_requires_bearer_session(self) -> None:
        response = self.client.get("/api/v1/schedules")

        self.assertEqual(response.status_code, 401)

    def test_elder_profile_routes_require_bearer_session(self) -> None:
        read_response = self.client.get(
            "/api/v1/elder-profile/agent",
            params={"elder_user_id": "elder-1"},
        )
        update_response = self.client.patch(
            "/api/v1/elder-profile/agent",
            json={"elder_user_id": "elder-1", "agent_name": "케어"},
        )

        self.assertEqual(read_response.status_code, 401)
        self.assertEqual(update_response.status_code, 401)

    def test_parent_care_info_requires_bearer_session(self) -> None:
        response = self.client.put(
            "/api/v1/parents/elder-1/care-info",
            json={},
        )

        self.assertEqual(response.status_code, 401)

    def test_chat_routes_require_bearer_session(self) -> None:
        message_response = self.client.post(
            "/api/v1/chat/message",
            json={"text": "오늘 약을 먹었나요?"},
        )
        history_response = self.client.get("/api/v1/chat/history")

        self.assertEqual(message_response.status_code, 401)
        self.assertEqual(history_response.status_code, 401)

    def test_location_routes_require_bearer_session(self) -> None:
        responses = [
            self.client.post(
                "/api/v1/locations",
                json={"latitude": 37.5, "longitude": 127.0, "source": "test"},
            ),
            self.client.post("/api/v1/locations/request", json={}),
            self.client.get("/api/v1/locations/request"),
        ]

        self.assertTrue(all(response.status_code == 401 for response in responses))

    def test_mode_routes_require_bearer_session(self) -> None:
        responses = [
            self.client.get("/api/v1/modes/current"),
            self.client.patch(
                "/api/v1/modes/current",
                json={
                    "mode": "basic",
                    "options": {
                        "check_in_interval_minutes": 180,
                        "alert_repeat_count": 3,
                        "always_on_location_enabled": True,
                    },
                },
            ),
        ]

        self.assertTrue(all(response.status_code == 401 for response in responses))

    def test_push_routes_require_bearer_session(self) -> None:
        responses = [
            self.client.post(
                "/api/v1/push-tokens/register",
                json={
                    "user_role": "elder",
                    "expo_push_token": "ExponentPushToken[test]",
                    "device_id": "device-1",
                    "platform": "ios",
                },
            ),
            self.client.post(
                "/api/v1/push-tokens/disable",
                json={"device_id": "device-1"},
            ),
        ]

        self.assertTrue(all(response.status_code == 401 for response in responses))

    def test_letter_and_event_alert_routes_require_bearer_session(self) -> None:
        responses = [
            self.client.get("/api/v1/letters/elder/elder-1"),
            self.client.get("/api/v1/alerts"),
            self.client.post(
                "/api/v1/alerts/event",
                json={
                    "type": "emergency_call",
                    "message": "119 긴급 연락을 시도했어요.",
                    "severity": "high",
                },
            ),
        ]

        self.assertTrue(all(response.status_code == 401 for response in responses))

    def test_cost_bearing_chat_routes_require_bearer_session(self) -> None:
        place_response = self.client.post(
            "/api/v1/chat/place-status",
            json={"place_name": "테스트 병원"},
        )
        tts_response = self.client.post(
            "/api/v1/chat/tts",
            json={"text": "안녕하세요.", "mode": "basic"},
        )

        self.assertEqual(place_response.status_code, 401)
        self.assertEqual(tts_response.status_code, 401)

    def test_alert_sweep_fails_closed_without_server_token(self) -> None:
        response = self.client.post("/api/v1/alerts/sweep")

        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()

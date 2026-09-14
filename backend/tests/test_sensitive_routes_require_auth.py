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


if __name__ == "__main__":
    unittest.main()

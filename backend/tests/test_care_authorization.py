import unittest

from fastapi import HTTPException

from app.api.deps import CarePrincipal, require_elder_access


class CareAuthorizationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.elder_principal = CarePrincipal(
            role="elder",
            session_id="session-1",
            actor_user_id="elder-1",
            elder_user_id="elder-1",
        )
        self.guardian_principal = CarePrincipal(
            role="guardian",
            session_id="session-2",
            actor_user_id="guardian-1",
            elder_user_id="elder-1",
            link_code="PAIRCODE",
        )

    def test_defaults_to_authenticated_elder(self) -> None:
        self.assertEqual(require_elder_access(self.elder_principal, None), "elder-1")

    def test_elder_can_access_own_data(self) -> None:
        self.assertEqual(
            require_elder_access(self.elder_principal, " elder-1 "),
            "elder-1",
        )

    def test_linked_guardian_can_access_elder_data(self) -> None:
        self.assertEqual(
            require_elder_access(self.guardian_principal, "elder-1"),
            "elder-1",
        )

    def test_other_elder_is_forbidden(self) -> None:
        with self.assertRaises(HTTPException) as context:
            require_elder_access(self.guardian_principal, "elder-2")

        self.assertEqual(context.exception.status_code, 403)

    def test_conflicting_query_ids_are_rejected(self) -> None:
        with self.assertRaises(HTTPException) as context:
            require_elder_access(self.elder_principal, "elder-1", "elder-2")

        self.assertEqual(context.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()

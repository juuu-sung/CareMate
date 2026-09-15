import unittest

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_current_care_principal, get_optional_guardian
from app.db.base import Base
from app.models.elder_session import ElderSession
from app.models.guardian_link import GuardianLink
from app.models.guardian_session import GuardianSession
from app.models.user import User
from app.services.elder_auth_service import issue_elder_session
from app.services.guardian_auth_service import issue_guardian_session


class CarePrincipalDependencyTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(
            self.engine,
            tables=[
                User.__table__,
                GuardianLink.__table__,
                ElderSession.__table__,
                GuardianSession.__table__,
            ],
        )
        self.db = sessionmaker(bind=self.engine)()
        self.elder = User(
            id="elder-1",
            phone="01000000001",
            name="어르신",
            role="elder",
        )
        self.guardian = User(
            id="guardian-1",
            phone="01000000002",
            name="보호자",
            role="guardian",
        )
        self.link = GuardianLink(
            id="link-1",
            guardian_user_id=self.guardian.id,
            elder_user_id=self.elder.id,
            link_code="PAIRCODE",
            is_used=True,
        )
        self.db.add_all([self.elder, self.guardian, self.link])
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    @staticmethod
    def _credentials(token: str) -> HTTPAuthorizationCredentials:
        return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    def test_elder_token_resolves_to_elder_principal(self) -> None:
        issued = issue_elder_session(self.db, self.elder)

        principal = get_current_care_principal(
            self._credentials(issued.access_token),
            self.db,
        )

        self.assertEqual(principal.role, "elder")
        self.assertEqual(principal.elder_user_id, "elder-1")
        self.assertEqual(principal.link_code, "PAIRCODE")

    def test_guardian_token_resolves_to_linked_elder(self) -> None:
        issued = issue_guardian_session(self.db, self.link)

        principal = get_current_care_principal(
            self._credentials(issued.access_token),
            self.db,
        )

        self.assertEqual(principal.role, "guardian")
        self.assertEqual(principal.actor_user_id, "guardian-1")
        self.assertEqual(principal.elder_user_id, "elder-1")

    def test_optional_guardian_accepts_valid_elder_token_as_non_guardian(self) -> None:
        issued = issue_elder_session(self.db, self.elder)

        principal = get_optional_guardian(
            self._credentials(issued.access_token),
            self.db,
        )

        self.assertIsNone(principal)

    def test_invalid_token_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as context:
            get_current_care_principal(
                self._credentials("x" * 48),
                self.db,
            )

        self.assertEqual(context.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()

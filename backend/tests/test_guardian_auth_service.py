import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.guardian_link import GuardianLink
from app.models.guardian_session import GuardianSession
from app.models.user import User
from app.services.guardian_auth_service import (
    GuardianAuthenticationError,
    authenticate_guardian_session,
    hash_guardian_password,
    issue_guardian_session,
    revoke_guardian_session,
    verify_guardian_password,
)


class GuardianAuthServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(
            self.engine,
            tables=[User.__table__, GuardianLink.__table__, GuardianSession.__table__],
        )
        self.db = sessionmaker(bind=self.engine)()

        elder = User(id="elder-1", phone="01000000001", name="어르신", role="elder")
        guardian = User(id="guardian-1", phone="01000000002", name="보호자", role="guardian")
        self.link = GuardianLink(
            id="link-1",
            guardian_user_id=guardian.id,
            elder_user_id=elder.id,
            link_code="PAIRCODE",
            is_used=True,
        )
        self.db.add_all([elder, guardian, self.link])
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_issued_token_is_hashed_and_authenticates(self) -> None:
        issued = issue_guardian_session(self.db, self.link)
        stored = self.db.query(GuardianSession).one()

        self.assertNotEqual(stored.token_hash, issued.access_token)
        self.assertEqual(len(stored.token_hash), 64)

        principal = authenticate_guardian_session(self.db, issued.access_token)
        self.assertEqual(principal.guardian_user_id, "guardian-1")
        self.assertEqual(principal.elder_user_id, "elder-1")
        self.assertEqual(principal.guardian_link_id, "link-1")

    def test_revoked_token_is_rejected(self) -> None:
        issued = issue_guardian_session(self.db, self.link)
        revoke_guardian_session(self.db, issued.access_token)

        with self.assertRaises(GuardianAuthenticationError):
            authenticate_guardian_session(self.db, issued.access_token)

    def test_expired_token_is_rejected(self) -> None:
        issued = issue_guardian_session(self.db, self.link)
        stored = self.db.query(GuardianSession).one()
        stored.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        self.db.commit()

        with self.assertRaises(GuardianAuthenticationError):
            authenticate_guardian_session(self.db, issued.access_token)

    def test_password_is_salted_and_verified(self) -> None:
        first_hash = hash_guardian_password("correct horse battery staple")
        second_hash = hash_guardian_password("correct horse battery staple")

        self.assertNotEqual(first_hash, second_hash)
        self.assertTrue(verify_guardian_password("correct horse battery staple", first_hash))
        self.assertFalse(verify_guardian_password("wrong password", first_hash))
        self.assertFalse(verify_guardian_password("anything", "malformed"))


if __name__ == "__main__":
    unittest.main()

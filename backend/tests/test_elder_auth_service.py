import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.elder_session import ElderSession
from app.models.user import User
from app.services.elder_auth_service import (
    ElderAuthenticationError,
    authenticate_elder_session,
    issue_elder_session,
    revoke_elder_session_by_id,
)


class ElderAuthServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(
            self.engine,
            tables=[User.__table__, ElderSession.__table__],
        )
        self.db = sessionmaker(bind=self.engine)()
        self.elder = User(
            id="elder-1",
            phone="01000000001",
            name="어르신",
            role="elder",
        )
        self.db.add(self.elder)
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_issued_token_is_hashed_and_authenticates(self) -> None:
        issued = issue_elder_session(self.db, self.elder)
        stored = self.db.query(ElderSession).one()

        self.assertNotEqual(stored.token_hash, issued.access_token)
        self.assertEqual(len(stored.token_hash), 64)

        principal = authenticate_elder_session(self.db, issued.access_token)
        self.assertEqual(principal.elder_user_id, "elder-1")
        self.assertEqual(principal.session_id, stored.id)

    def test_revoked_token_is_rejected(self) -> None:
        issued = issue_elder_session(self.db, self.elder)
        stored = self.db.query(ElderSession).one()
        revoke_elder_session_by_id(self.db, stored.id)

        with self.assertRaises(ElderAuthenticationError):
            authenticate_elder_session(self.db, issued.access_token)

    def test_expired_token_is_rejected(self) -> None:
        issued = issue_elder_session(self.db, self.elder)
        stored = self.db.query(ElderSession).one()
        stored.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        self.db.commit()

        with self.assertRaises(ElderAuthenticationError):
            authenticate_elder_session(self.db, issued.access_token)

    def test_guardian_cannot_receive_elder_session(self) -> None:
        guardian = User(
            id="guardian-1",
            phone="01000000002",
            name="보호자",
            role="guardian",
        )
        self.db.add(guardian)
        self.db.commit()

        with self.assertRaises(ElderAuthenticationError):
            issue_elder_session(self.db, guardian)


if __name__ == "__main__":
    unittest.main()

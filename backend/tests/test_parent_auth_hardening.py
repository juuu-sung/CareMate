import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.elder_profile import ElderProfile
from app.models.elder_session import ElderSession
from app.models.guardian_link import GuardianLink
from app.models.user import User
from app.schemas.parent import ParentLoginRequest, ParentSignupRequest
from app.services.elder_auth_service import (
    ElderAuthenticationError,
    authenticate_elder_session,
    issue_elder_session,
)
from app.services.parent_service import (
    PARENT_LOGIN_FAILURE_MESSAGE,
    build_parent_login_rate_key,
    create_parent,
    login_parent,
)
from app.services.password_service import hash_password, verify_password


class ParentAuthHardeningTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(
            self.engine,
            tables=[
                User.__table__,
                ElderProfile.__table__,
                GuardianLink.__table__,
                ElderSession.__table__,
            ],
        )
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _add_parent(self, *, password_hash: str | None) -> User:
        parent = User(
            id="elder-1",
            phone="010-1234-5678",
            name="부모님",
            birth="1950-01-02",
            gender="여성",
            role="elder",
            password_hash=password_hash,
        )
        link = GuardianLink(
            id="link-1",
            elder_user_id=parent.id,
            guardian_user_id=None,
            link_code="PAIR1234",
            is_used=False,
        )
        self.db.add_all([parent, link])
        self.db.commit()
        return parent

    def test_signup_hashes_parent_password(self) -> None:
        response = create_parent(
            self.db,
            ParentSignupRequest(
                name="신규 부모님",
                birth="1948-03-04",
                gender="남성",
                address="서울시 중구",
                phone="010-9999-8888",
                password="secure-password",
            ),
        )

        parent = self.db.query(User).filter(User.id == response["parent_id"]).one()
        self.assertNotEqual(parent.password_hash, "secure-password")
        self.assertTrue(verify_password("secure-password", parent.password_hash))

    def test_login_rejects_wrong_password_with_generic_message(self) -> None:
        self._add_parent(password_hash=hash_password("correct-password"))

        with self.assertRaisesRegex(ValueError, f"^{PARENT_LOGIN_FAILURE_MESSAGE}$"):
            login_parent(
                self.db,
                ParentLoginRequest(
                    phone="01012345678",
                    birth="19500102",
                    password="wrong-password",
                ),
            )

        self.assertEqual(self.db.query(ElderSession).count(), 0)

    def test_legacy_parent_sets_password_once_with_link_code(self) -> None:
        parent = self._add_parent(password_hash=None)

        response = login_parent(
            self.db,
            ParentLoginRequest(
                phone="01012345678",
                birth="19500102",
                password="new-password",
                link_code="pair1234",
            ),
        )

        self.db.refresh(parent)
        self.assertTrue(verify_password("new-password", parent.password_hash))
        principal = authenticate_elder_session(self.db, response["access_token"])
        self.assertEqual(principal.elder_user_id, parent.id)

    def test_legacy_parent_rejects_wrong_link_code(self) -> None:
        parent = self._add_parent(password_hash=None)

        with self.assertRaisesRegex(ValueError, f"^{PARENT_LOGIN_FAILURE_MESSAGE}$"):
            login_parent(
                self.db,
                ParentLoginRequest(
                    phone="01012345678",
                    birth="19500102",
                    password="new-password",
                    link_code="WRONG123",
                ),
            )

        self.db.refresh(parent)
        self.assertIsNone(parent.password_hash)
        self.assertEqual(self.db.query(ElderSession).count(), 0)

    def test_successful_login_revokes_previous_parent_sessions(self) -> None:
        parent = self._add_parent(password_hash=hash_password("correct-password"))
        old_session = issue_elder_session(self.db, parent)

        response = login_parent(
            self.db,
            ParentLoginRequest(
                phone="01012345678",
                birth="19500102",
                password="correct-password",
            ),
        )

        with self.assertRaises(ElderAuthenticationError):
            authenticate_elder_session(self.db, old_session.access_token)
        authenticate_elder_session(self.db, response["access_token"])

    def test_login_rate_key_does_not_expose_or_depend_on_phone_format(self) -> None:
        formatted = build_parent_login_rate_key("010-1234-5678")
        compact = build_parent_login_rate_key("01012345678")

        self.assertEqual(formatted, compact)
        self.assertNotIn("01012345678", formatted)


if __name__ == "__main__":
    unittest.main()

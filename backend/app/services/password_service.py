from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import secrets


class PasswordValidationError(ValueError):
    pass


_PASSWORD_SCRYPT_N = 2**14
_PASSWORD_SCRYPT_R = 8
_PASSWORD_SCRYPT_P = 1
_PASSWORD_SCRYPT_DKLEN = 32
_PASSWORD_SCRYPT_MAXMEM = 64 * 1024 * 1024


def hash_password(password: str) -> str:
    if len(password) < 8 or len(password) > 128:
        raise PasswordValidationError("비밀번호는 8자 이상 128자 이하로 입력해 주세요.")

    salt = secrets.token_bytes(16)
    derived_key = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=_PASSWORD_SCRYPT_N,
        r=_PASSWORD_SCRYPT_R,
        p=_PASSWORD_SCRYPT_P,
        dklen=_PASSWORD_SCRYPT_DKLEN,
        maxmem=_PASSWORD_SCRYPT_MAXMEM,
    )
    encoded_salt = base64.urlsafe_b64encode(salt).decode("ascii")
    encoded_key = base64.urlsafe_b64encode(derived_key).decode("ascii")
    return (
        f"scrypt${_PASSWORD_SCRYPT_N}${_PASSWORD_SCRYPT_R}"
        f"${_PASSWORD_SCRYPT_P}${encoded_salt}${encoded_key}"
    )


def verify_password(password: str, encoded_hash: str | None) -> bool:
    if not encoded_hash:
        return False

    try:
        algorithm, n_value, r_value, p_value, encoded_salt, encoded_key = encoded_hash.split("$")
        if algorithm != "scrypt":
            return False
        n = int(n_value)
        r = int(r_value)
        p = int(p_value)
        if (n, r, p) != (_PASSWORD_SCRYPT_N, _PASSWORD_SCRYPT_R, _PASSWORD_SCRYPT_P):
            return False
        salt = base64.urlsafe_b64decode(encoded_salt.encode("ascii"))
        expected_key = base64.urlsafe_b64decode(encoded_key.encode("ascii"))
        actual_key = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=n,
            r=r,
            p=p,
            dklen=len(expected_key),
            maxmem=_PASSWORD_SCRYPT_MAXMEM,
        )
    except (binascii.Error, TypeError, ValueError):
        return False

    return hmac.compare_digest(actual_key, expected_key)

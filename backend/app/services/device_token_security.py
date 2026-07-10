import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _fernet() -> Fernet:
    key = hashlib.sha256(settings.jwt_secret_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def token_hash(token: str | None) -> str | None:
    value = (token or "").strip()
    return hashlib.sha256(value.encode("utf-8")).hexdigest() if value else None


def encrypt_token(token: str | None) -> str | None:
    value = (token or "").strip()
    if not value:
        return None
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_token(ciphertext: str | None, legacy_plaintext: str | None = None) -> str | None:
    value = (ciphertext or "").strip()
    if value:
        try:
            return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
        except (InvalidToken, ValueError):
            return None
    return (legacy_plaintext or "").strip() or None

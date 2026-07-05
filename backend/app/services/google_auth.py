import time
from dataclasses import dataclass

import httpx
from jose import JWTError, jwt

from app.core.config import settings


GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
_jwks_cache: dict[str, object] = {"expires_at": 0.0, "keys": {}}


class GoogleAuthError(Exception):
    pass


class GoogleAuthConfigurationError(Exception):
    pass


class GoogleEmailNotVerifiedError(Exception):
    pass


@dataclass(frozen=True)
class GoogleIdentity:
    google_id: str
    email: str
    name: str
    picture: str | None


def _cache_max_age(value: str) -> int:
    for part in value.split(","):
        key, _, raw_value = part.strip().partition("=")
        if key.lower() == "max-age" and raw_value.isdigit():
            return int(raw_value)
    return 3600


def _load_google_keys(force_refresh: bool = False) -> dict[str, dict]:
    now = time.time()
    if not force_refresh and now < float(_jwks_cache["expires_at"]):
        return _jwks_cache["keys"]  # type: ignore[return-value]

    response = httpx.get(GOOGLE_JWKS_URL, timeout=5.0)
    response.raise_for_status()
    payload = response.json()
    keys = {
        str(item["kid"]): item
        for item in payload.get("keys", [])
        if isinstance(item, dict) and item.get("kid")
    }
    if not keys:
        raise GoogleAuthError("Google signing keys are unavailable.")
    max_age = _cache_max_age(response.headers.get("cache-control", ""))
    _jwks_cache["keys"] = keys
    _jwks_cache["expires_at"] = now + max(60, max_age)
    return keys


def _token_key(id_token: str) -> dict:
    try:
        header = jwt.get_unverified_header(id_token)
    except JWTError as exc:
        raise GoogleAuthError("Invalid Google token.") from exc
    key_id = header.get("kid")
    if not key_id:
        raise GoogleAuthError("Invalid Google token.")
    keys = _load_google_keys()
    key = keys.get(str(key_id))
    if not key:
        keys = _load_google_keys(force_refresh=True)
        key = keys.get(str(key_id))
    if not key:
        raise GoogleAuthError("Invalid Google token.")
    return key


def verify_google_id_token(id_token: str) -> GoogleIdentity:
    client_ids = set(settings.google_client_ids)
    if not client_ids:
        raise GoogleAuthConfigurationError("Google OAuth is not configured.")
    token = id_token.strip()
    if not token or len(token) > 8192:
        raise GoogleAuthError("Invalid Google token.")

    try:
        claims = jwt.decode(
            token,
            _token_key(token),
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
    except JWTError as exc:
        raise GoogleAuthError("Invalid Google token.") from exc

    issuer = str(claims.get("iss") or "")
    if issuer not in GOOGLE_ISSUERS:
        raise GoogleAuthError("Invalid Google token.")

    audience = claims.get("aud")
    audiences = set(audience if isinstance(audience, list) else [audience])
    if not audiences.intersection(client_ids):
        raise GoogleAuthError("Invalid Google token audience.")

    email_verified = claims.get("email_verified")
    if email_verified not in {True, "true", "True", "1", 1}:
        raise GoogleEmailNotVerifiedError("Google email is not verified.")

    google_id = str(claims.get("sub") or "").strip()
    email = str(claims.get("email") or "").strip().lower()
    if not google_id or not email:
        raise GoogleAuthError("Invalid Google token.")

    return GoogleIdentity(
        google_id=google_id,
        email=email,
        name=str(claims.get("name") or email.split("@", 1)[0]).strip()[:120],
        picture=(str(claims.get("picture")).strip() if claims.get("picture") else None),
    )

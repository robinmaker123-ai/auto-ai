import base64
import hashlib
import hmac
import time
from datetime import datetime, timezone

from app.core.config import settings
from app.schemas.call import TurnCredentials

TURN_UNAVAILABLE_MESSAGE = "Calling network relay is temporarily unavailable."


def create_turn_credentials(user_id: str) -> TurnCredentials:
    if not settings.turn_configured:
        if settings.is_production:
            raise RuntimeError(TURN_UNAVAILABLE_MESSAGE)
        return TurnCredentials(
            ice_servers=[{"urls": ["stun:stun.l.google.com:19302"]}],
            relay_configured=False,
            warning=TURN_UNAVAILABLE_MESSAGE,
        )

    expires_at = int(time.time()) + settings.TURN_CREDENTIAL_TTL
    username = f"{expires_at}:{user_id}"
    digest = hmac.new(
        settings.turn_shared_secret.encode("utf-8"), username.encode("utf-8"), hashlib.sha1
    ).digest()
    credential = base64.b64encode(digest).decode("ascii")
    return TurnCredentials(
        ice_servers=[
            {
                "urls": settings.TURN_SERVER_URLS,
                "username": username,
                "credential": credential,
                "credentialType": "password",
            }
        ],
        expires_at=datetime.fromtimestamp(expires_at, tz=timezone.utc),
        relay_configured=True,
    )

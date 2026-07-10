import re
import secrets


def generate_username(display_name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", display_name.strip().lower()).strip("_")[:32]
    return f"{base or 'user'}_{secrets.token_hex(3)}"

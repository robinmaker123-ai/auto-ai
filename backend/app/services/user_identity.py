import re
import secrets


RESERVED_USERNAMES = {"admin", "administrator", "support", "autoai", "system", "api", "null"}
USERNAME_PATTERN = re.compile(r"^[a-z0-9._]{3,30}$")


def normalize_username(username: str) -> str:
    return username.strip().lower()


def username_error(username: str) -> str | None:
    normalized = normalize_username(username)
    if not USERNAME_PATTERN.fullmatch(normalized):
        return "Username must be 3-30 characters using lowercase letters, numbers, underscore or dot."
    if normalized in RESERVED_USERNAMES:
        return "This username is reserved."
    return None


def generate_username(display_name: str) -> str:
    base = re.sub(r"[^a-z0-9._]+", "_", display_name.strip().lower()).strip("._")[:20] or "user"
    if base in RESERVED_USERNAMES or len(base) < 3:
        base = "user"
    return f"{base}_{secrets.token_hex(3)}"[:30]

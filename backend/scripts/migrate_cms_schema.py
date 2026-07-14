"""Create the additive CMS schema and seed source-content fallbacks safely."""

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app import models  # noqa: F401
from app.db.base import Base
from app.db.session import SessionLocal, engine, ensure_runtime_schema
from app.services.cms_service import ensure_cms_defaults


def main() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_runtime_schema()
    with SessionLocal() as db:
        ensure_cms_defaults(db)
    print("CMS schema and defaults are ready.")


if __name__ == "__main__":
    main()

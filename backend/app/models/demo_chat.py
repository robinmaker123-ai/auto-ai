from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class DemoChatSession(Base):
    __tablename__ = "demo_chat_sessions"

    session_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    # This legacy column stores a hash of the anonymous demo-session identifier,
    # never a device, IP address, user agent, or authenticated account identity.
    session_hash: Mapped[str] = mapped_column("client_hash", String(64), index=True, nullable=False)
    messages_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    history: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now_naive, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now_naive, onupdate=utc_now_naive, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)

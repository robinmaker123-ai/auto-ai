import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ChatThread(Base):
    __tablename__ = "chat_threads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    is_group: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_message_id: Mapped[str] = mapped_column(String(36), nullable=True)


class ChatParticipant(Base):
    __tablename__ = "chat_participants"
    __table_args__ = (UniqueConstraint("thread_id", "user_id", name="uq_chat_participants_thread_user"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    thread_id: Mapped[str] = mapped_column(String(36), ForeignKey("chat_threads.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    muted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_read_message_id: Mapped[str] = mapped_column(String(36), ForeignKey("user_chat_messages.id", ondelete="SET NULL"), nullable=True)
    last_read_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)


class ChatMessage(Base):
    __tablename__ = "user_chat_messages"
    __table_args__ = (UniqueConstraint("thread_id", "sender_id", "client_message_id", name="uq_chat_messages_client_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    thread_id: Mapped[str] = mapped_column(String(36), ForeignKey("chat_threads.id", ondelete="CASCADE"), index=True, nullable=False)
    sender_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    client_message_id: Mapped[str] = mapped_column(String(80), nullable=True)
    message_type: Mapped[str] = mapped_column(String(16), default="text", nullable=False)
    text_content: Mapped[str] = mapped_column(Text, nullable=True)
    attachment_url: Mapped[str] = mapped_column(String(700), nullable=True)
    attachment_name: Mapped[str] = mapped_column(String(255), nullable=True)
    attachment_size: Mapped[int] = mapped_column(Integer, nullable=True)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    edited_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    deleted_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    reply_to_message_id: Mapped[str] = mapped_column(String(36), ForeignKey("user_chat_messages.id", ondelete="SET NULL"), nullable=True)


class MessageReceipt(Base):
    __tablename__ = "message_receipts"
    __table_args__ = (UniqueConstraint("message_id", "user_id", name="uq_message_receipts_message_user"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    message_id: Mapped[str] = mapped_column(String(36), ForeignKey("user_chat_messages.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    delivered_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    read_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)


class UserChatSettings(Base):
    __tablename__ = "user_chat_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    read_receipts_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_seen_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    typing_indicator_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_messages_from: Mapped[str] = mapped_column(String(32), default="everyone", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

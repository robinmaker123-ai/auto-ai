import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def new_id() -> str:
    return str(uuid.uuid4())


class ContentPage(Base):
    __tablename__ = "content_pages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    page_key: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=False)
    published_slug: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="draft", index=True, nullable=False)
    hero_heading: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    hero_description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    buttons: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    seo: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    published_snapshot: Mapped[dict] = mapped_column(JSON, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=True)
    published_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    blocks = relationship("ContentBlock", back_populates="page", cascade="all, delete-orphan", order_by="ContentBlock.position")


class ContentBlock(Base):
    __tablename__ = "content_blocks"
    __table_args__ = (Index("ix_content_blocks_page_position", "page_id", "position"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    page_id: Mapped[str] = mapped_column(ForeignKey("content_pages.id", ondelete="CASCADE"), index=True, nullable=False)
    block_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    content: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    deleted_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    page = relationship("ContentPage", back_populates="blocks")


class ContentRevision(Base):
    __tablename__ = "content_revisions"
    __table_args__ = (Index("ix_content_revisions_item", "content_type", "content_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    content_type: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    content_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    change_summary: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)


class GlobalContent(Base):
    __tablename__ = "global_content"
    __table_args__ = (UniqueConstraint("key", "locale", name="uq_global_content_key_locale"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    key: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    group: Mapped[str] = mapped_column(String(48), index=True, nullable=False)
    locale: Mapped[str] = mapped_column(String(12), default="en", nullable=False)
    default_value: Mapped[str] = mapped_column(Text, nullable=False)
    draft_value: Mapped[str] = mapped_column(Text, nullable=False)
    published_value: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="draft", index=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    mandatory: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    published_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class UiTextEntry(Base):
    __tablename__ = "ui_text_entries"
    __table_args__ = (UniqueConstraint("key", "locale", name="uq_ui_text_key_locale"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    key: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    group: Mapped[str] = mapped_column(String(48), index=True, nullable=False)
    locale: Mapped[str] = mapped_column(String(12), default="en", nullable=False)
    default_text: Mapped[str] = mapped_column(Text, nullable=False)
    draft_text: Mapped[str] = mapped_column(Text, nullable=False)
    published_text: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="draft", index=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    mandatory: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    published_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class FaqEntry(Base):
    __tablename__ = "faq_entries"
    __table_args__ = (Index("ix_faq_entries_status_position", "status", "position"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    question: Mapped[str] = mapped_column(String(300), nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(80), default="General", index=True, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="draft", index=True, nullable=False)
    published_snapshot: Mapped[dict] = mapped_column(JSON, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=True)
    published_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Announcement(Base):
    __tablename__ = "announcements"
    __table_args__ = (Index("ix_announcements_public", "status", "start_at", "end_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    action_text: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    target_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=True)
    end_at: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="draft", index=True, nullable=False)
    published_snapshot: Mapped[dict] = mapped_column(JSON, nullable=True)
    targets: Mapped[str] = mapped_column(String(16), default="both", nullable=False)
    audience: Mapped[str] = mapped_column(String(32), default="all", nullable=False)
    dismissible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class MediaAsset(Base):
    __tablename__ = "media_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    public_url: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    alt_text: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    caption: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    uploaded_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ContentAuditLog(Base):
    __tablename__ = "content_audit_logs"
    __table_args__ = (Index("ix_content_audit_item", "content_type", "content_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(48), index=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    content_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    summary: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)

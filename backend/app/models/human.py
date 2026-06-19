import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserInteractionProfile(Base):
    __tablename__ = "user_interaction_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )
    trust_score: Mapped[int] = mapped_column(Integer, default=50)
    rapport_score: Mapped[int] = mapped_column(Integer, default=40)
    respect_score: Mapped[int] = mapped_column(Integer, default=70)
    curiosity_score: Mapped[int] = mapped_column(Integer, default=50)
    confidence_score: Mapped[int] = mapped_column(Integer, default=60)
    frustration_score: Mapped[int] = mapped_column(Integer, default=10)
    humor_score: Mapped[int] = mapped_column(Integer, default=30)
    communication_style: Mapped[dict] = mapped_column(JSON, default=dict)
    personality_blend: Mapped[dict] = mapped_column(JSON, default=dict)
    favorite_topics: Mapped[list] = mapped_column(JSON, default=list)
    current_projects: Mapped[list] = mapped_column(JSON, default=list)
    long_term_objectives: Mapped[list] = mapped_column(JSON, default=list)
    learning_style: Mapped[str] = mapped_column(String(80), nullable=True)
    first_interaction_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_interaction_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    user = relationship("User", back_populates="interaction_profile")


class UserMemory(Base):
    __tablename__ = "user_memories"
    __table_args__ = (
        UniqueConstraint("user_id", "category", "key", name="uq_user_memory_category_key"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    category: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    key: Mapped[str] = mapped_column(String(160), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(80), default="conversation")
    confidence: Mapped[float] = mapped_column(Float, default=0.65)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    user = relationship("User", back_populates="memories")


class ConversationTurnAnalysis(Base):
    __tablename__ = "conversation_turn_analyses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    chat_id: Mapped[str] = mapped_column(
        ForeignKey("chats.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    user_message_id: Mapped[str] = mapped_column(
        ForeignKey("messages.id", ondelete="SET NULL"),
        nullable=True,
    )
    assistant_message_id: Mapped[str] = mapped_column(
        ForeignKey("messages.id", ondelete="SET NULL"),
        nullable=True,
    )
    emotion: Mapped[dict] = mapped_column(JSON, default=dict)
    tone: Mapped[dict] = mapped_column(JSON, default=dict)
    intent: Mapped[str] = mapped_column(String(120), default="conversation")
    language: Mapped[str] = mapped_column(String(40), default="english")
    personality_mode: Mapped[dict] = mapped_column(JSON, default=dict)
    state_delta: Mapped[dict] = mapped_column(JSON, default=dict)
    flags: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="turn_analyses")

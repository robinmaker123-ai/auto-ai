from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.human import UserInteractionProfile


class EmotionalStateManager:
    SCORE_FIELDS = {
        "trust_score",
        "rapport_score",
        "respect_score",
        "curiosity_score",
        "confidence_score",
        "frustration_score",
        "humor_score",
    }

    def get_or_create_profile(self, db: Session, user_id: str) -> UserInteractionProfile:
        profile = db.scalar(select(UserInteractionProfile).where(UserInteractionProfile.user_id == user_id))
        if profile:
            return profile

        profile = UserInteractionProfile(user_id=user_id)
        db.add(profile)
        db.flush()
        return profile

    def compute_delta(
        self,
        *,
        emotion: dict[str, Any],
        tone: dict[str, Any],
        conversation: dict[str, Any],
    ) -> dict[str, int]:
        primary_emotion = emotion.get("primary_emotion", "neutral")
        intensity = float(emotion.get("intensity", 0) or 0)
        flags = conversation.get("flags", {})
        delta = {
            "trust_score": 0,
            "rapport_score": 1,
            "respect_score": 0,
            "curiosity_score": 0,
            "confidence_score": 0,
            "frustration_score": 0,
            "humor_score": 0,
        }

        if primary_emotion in {"happiness", "motivation", "excitement"}:
            delta["trust_score"] += 1
            delta["rapport_score"] += 2
            delta["confidence_score"] += 1
        if primary_emotion == "curiosity":
            delta["curiosity_score"] += 2
            delta["rapport_score"] += 1
        if primary_emotion in {"frustration", "anger"}:
            delta["frustration_score"] += max(1, round(5 * intensity))
            delta["confidence_score"] -= 1
        if primary_emotion in {"stress", "anxiety", "sadness"}:
            delta["trust_score"] += 1
            delta["frustration_score"] += max(1, round(2 * intensity))
        if tone.get("humor_style") != "none":
            delta["humor_score"] += 2
            delta["rapport_score"] += 1
        if flags.get("repeated_user_message") or flags.get("possibly_circular"):
            delta["frustration_score"] += 3
            delta["rapport_score"] -= 1
        if flags.get("contradiction_signal"):
            delta["respect_score"] += 1
            delta["confidence_score"] -= 1
        if tone.get("technical_density", 0) >= 0.08:
            delta["respect_score"] += 1
            delta["confidence_score"] += 1

        return delta

    def apply_delta(
        self,
        profile: UserInteractionProfile,
        *,
        delta: dict[str, int],
        tone: dict[str, Any],
        personality: dict[str, Any],
    ) -> UserInteractionProfile:
        for field in self.SCORE_FIELDS:
            current_value = getattr(profile, field)
            setattr(profile, field, self._clamp(current_value + delta.get(field, 0)))

        profile.communication_style = {
            "language": tone.get("language", "english"),
            "formality": tone.get("formality", "neutral"),
            "energy": tone.get("energy", "steady"),
            "message_length": tone.get("message_length", "medium"),
            "humor_style": tone.get("humor_style", "none"),
            "technical_density": tone.get("technical_density", 0),
        }
        profile.personality_blend = personality
        profile.last_interaction_at = datetime.utcnow()
        profile.updated_at = datetime.utcnow()
        return profile

    @staticmethod
    def _clamp(value: int) -> int:
        return max(0, min(100, int(value)))


emotional_state_manager = EmotionalStateManager()


from difflib import SequenceMatcher
from typing import Any

from app.models.message import Message


class ConversationManager:
    def analyze(self, text: str, history: list[Message]) -> dict[str, Any]:
        lowered = text.lower()
        prior_user_messages = [message.content for message in history if message.role == "user"]
        recent_user_messages = prior_user_messages[-6:]
        repeated_similarity = max(
            (SequenceMatcher(None, lowered, previous.lower()).ratio() for previous in recent_user_messages),
            default=0.0,
        )

        intent = "conversation"
        if any(keyword in lowered for keyword in {"implement", "generate code", "build", "create api", "database schema"}):
            intent = "implementation"
        elif any(keyword in lowered for keyword in {"debug", "bug", "error", "traceback", "fix"}):
            intent = "debugging"
        elif any(keyword in lowered for keyword in {"explain", "why", "how does", "what is"}):
            intent = "explanation"
        elif any(keyword in lowered for keyword in {"plan", "architecture", "design", "strategy"}):
            intent = "planning"
        elif any(keyword in lowered for keyword in {"i feel", "sad", "stressed", "anxious", "worried"}):
            intent = "support"
        elif any(keyword in lowered for keyword in {"idea", "brainstorm", "creative"}):
            intent = "brainstorming"

        flags = {
            "repeated_user_message": repeated_similarity >= 0.88,
            "possibly_circular": repeated_similarity >= 0.78 and len(recent_user_messages) >= 2,
            "identity_probe": any(phrase in lowered for phrase in {"are you human", "real person", "are you ai"}),
            "memory_request": any(phrase in lowered for phrase in {"remember that", "save this", "my preference"}),
            "urgent": any(keyword in lowered for keyword in {"urgent", "asap", "quickly", "jaldi"}),
            "contradiction_signal": any(
                phrase in lowered
                for phrase in {
                    "that's wrong",
                    "that is wrong",
                    "not correct",
                    "you contradicted",
                    "doesn't fit",
                }
            ),
        }

        return {
            "intent": intent,
            "flags": flags,
            "repeated_similarity": round(repeated_similarity, 3),
        }


conversation_manager = ConversationManager()


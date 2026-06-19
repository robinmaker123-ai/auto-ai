import re
from typing import Any

from app.models.human import UserInteractionProfile


class RelationshipEngine:
    TOPIC_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9+#-]{2,}")
    STOPWORDS = {
        "the",
        "and",
        "for",
        "with",
        "that",
        "this",
        "you",
        "are",
        "from",
        "have",
        "has",
        "into",
        "your",
        "they",
        "will",
        "what",
        "when",
        "where",
        "how",
        "why",
        "can",
        "could",
        "should",
        "would",
    }

    def update(
        self,
        profile: UserInteractionProfile,
        *,
        user_message: str,
        memory_candidates: list[dict[str, Any]],
    ) -> UserInteractionProfile:
        profile.favorite_topics = self._merge_unique(
            profile.favorite_topics or [],
            [
                candidate["value"]
                for candidate in memory_candidates
                if candidate.get("category") == "favorite_topic"
            ],
        )
        profile.current_projects = self._merge_unique(
            profile.current_projects or [],
            [
                candidate["value"]
                for candidate in memory_candidates
                if candidate.get("category") == "project"
            ],
        )
        profile.long_term_objectives = self._merge_unique(
            profile.long_term_objectives or [],
            [
                candidate["value"]
                for candidate in memory_candidates
                if candidate.get("category") in {"career_goal", "learning_goal"}
            ],
        )

        learning_style = self._detect_learning_style(user_message)
        if learning_style:
            profile.learning_style = learning_style

        discovered_topics = self._extract_topics(user_message)
        if discovered_topics:
            profile.favorite_topics = self._merge_unique(profile.favorite_topics or [], discovered_topics, limit=20)
        return profile

    def _extract_topics(self, text: str) -> list[str]:
        words = [word.lower() for word in self.TOPIC_RE.findall(text)]
        topics = [
            word
            for word in words
            if word not in self.STOPWORDS and (word in {"fastapi", "react", "groq", "sqlite", "database", "api", "prompt"} or len(word) > 5)
        ]
        return list(dict.fromkeys(topics))[:8]

    @staticmethod
    def _detect_learning_style(text: str) -> str | None:
        lowered = text.lower()
        if any(phrase in lowered for phrase in {"step by step", "explain slowly", "beginner"}):
            return "step_by_step"
        if any(phrase in lowered for phrase in {"just code", "direct code", "no explanation"}):
            return "code_first"
        if any(phrase in lowered for phrase in {"examples", "example driven", "show example"}):
            return "example_driven"
        if any(phrase in lowered for phrase in {"deep dive", "detailed", "thorough"}):
            return "deep_dive"
        return None

    @staticmethod
    def _merge_unique(current: list[str], additions: list[str], *, limit: int = 12) -> list[str]:
        merged = list(current)
        seen = {item.lower() for item in merged}
        for item in additions:
            clean = " ".join(str(item).split())
            if clean and clean.lower() not in seen:
                merged.append(clean)
                seen.add(clean.lower())
        return merged[-limit:]


relationship_engine = RelationshipEngine()


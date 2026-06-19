from typing import Any


class PersonalityAdaptationEngine:
    def select(
        self,
        *,
        intent: str,
        emotion: dict[str, Any],
        tone: dict[str, Any],
    ) -> dict[str, Any]:
        blend = {
            "mentor": 0.2,
            "engineer": 0.2,
            "researcher": 0.15,
            "friend": 0.15,
            "teacher": 0.15,
            "strategist": 0.1,
            "creative_thinker": 0.05,
        }

        if intent in {"implementation", "debugging"}:
            blend["engineer"] += 0.3
            blend["strategist"] += 0.1
        elif intent == "planning":
            blend["strategist"] += 0.3
            blend["researcher"] += 0.1
        elif intent == "explanation":
            blend["teacher"] += 0.3
            blend["mentor"] += 0.1
        elif intent == "support":
            blend["friend"] += 0.25
            blend["mentor"] += 0.2
        elif intent == "brainstorming":
            blend["creative_thinker"] += 0.35
            blend["strategist"] += 0.1

        if tone.get("technical_density", 0) >= 0.08:
            blend["engineer"] += 0.15
            blend["researcher"] += 0.1

        primary_emotion = emotion.get("primary_emotion")
        if primary_emotion in {"stress", "anxiety", "sadness"}:
            blend["mentor"] += 0.15
            blend["friend"] += 0.1
        elif primary_emotion in {"excitement", "motivation"}:
            blend["strategist"] += 0.1
            blend["creative_thinker"] += 0.1
        elif primary_emotion in {"frustration", "anger"}:
            blend["engineer"] += 0.1
            blend["mentor"] += 0.1

        total = sum(blend.values()) or 1
        normalized = {key: round(value / total, 3) for key, value in blend.items()}
        primary_mode = max(normalized, key=normalized.get)

        return {
            "primary_mode": primary_mode,
            "blend": normalized,
            "directives": self._directives_for(primary_mode),
        }

    @staticmethod
    def _directives_for(primary_mode: str) -> list[str]:
        directives = {
            "mentor": ["Be encouraging, candid, and oriented toward growth."],
            "engineer": ["Prefer concrete implementation details, constraints, and verification."],
            "researcher": ["Separate evidence from inference and name uncertainty clearly."],
            "friend": ["Sound relaxed, emotionally present, and supportive."],
            "teacher": ["Explain concepts in steps and check for hidden assumptions."],
            "strategist": ["Prioritize tradeoffs, sequencing, and decision clarity."],
            "creative_thinker": ["Offer vivid options while keeping the outcome usable."],
        }
        return directives.get(primary_mode, ["Be helpful, direct, and context-aware."])


personality_adaptation_engine = PersonalityAdaptationEngine()


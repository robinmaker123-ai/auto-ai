from typing import Any


class HumanizationLayer:
    def build_prompt_context(
        self,
        *,
        emotion: dict[str, Any],
        tone: dict[str, Any],
        state_delta: dict[str, int],
        profile_snapshot: dict[str, Any],
        personality: dict[str, Any],
        style_directives: list[str],
        relevant_memories: list[dict[str, Any]],
        conversation: dict[str, Any],
    ) -> str:
        sections = [
            "Adaptive conversation context:",
            f"- Detected user emotion: {emotion.get('primary_emotion', 'neutral')} "
            f"(intensity {emotion.get('intensity', 0)}).",
            f"- User tone: {tone.get('language', 'english')}, {tone.get('formality', 'neutral')} formality, "
            f"{tone.get('energy', 'steady')} energy, {tone.get('message_length', 'medium')} message.",
            f"- Best personality mode: {personality.get('primary_mode', 'mentor')}.",
            f"- Conversation intent: {conversation.get('intent', 'conversation')}.",
            self._state_line(profile_snapshot, state_delta),
        ]

        if style_directives:
            sections.append("Style directives:")
            sections.extend(f"- {directive}" for directive in style_directives)

        personality_directives = personality.get("directives") or []
        if personality_directives:
            sections.append("Personality directives:")
            sections.extend(f"- {directive}" for directive in personality_directives)

        flags = conversation.get("flags", {})
        active_flags = [key for key, value in flags.items() if value]
        if active_flags:
            sections.append(f"Conversation flags: {', '.join(active_flags)}.")

        if relevant_memories:
            sections.append("Relevant user memory:")
            for memory in relevant_memories[:8]:
                sections.append(
                    f"- {memory['category']} / {memory['key']}: {memory['value']} "
                    f"(confidence {memory['confidence']:.2f})"
                )

        sections.append(
            "Use this context quietly to shape the response. Do not narrate these analyses unless the user asks."
        )
        return "\n".join(sections)

    @staticmethod
    def _state_line(profile_snapshot: dict[str, Any], state_delta: dict[str, int]) -> str:
        scores = {
            "trust": profile_snapshot.get("trust_score", 50),
            "rapport": profile_snapshot.get("rapport_score", 40),
            "confidence": profile_snapshot.get("confidence_score", 60),
            "frustration": profile_snapshot.get("frustration_score", 10),
            "humor": profile_snapshot.get("humor_score", 30),
        }
        changed = {key: value for key, value in state_delta.items() if value}
        return f"- Relationship state snapshot: {scores}; expected score movement this turn: {changed or 'steady'}."


humanization_layer = HumanizationLayer()


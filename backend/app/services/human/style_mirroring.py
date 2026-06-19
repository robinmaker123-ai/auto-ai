from typing import Any


class StyleMirroringEngine:
    def build_directives(self, emotion: dict[str, Any], tone: dict[str, Any]) -> list[str]:
        directives: list[str] = []
        language = tone.get("language", "english")
        formality = tone.get("formality", "neutral")
        energy = tone.get("energy", "steady")
        message_length = tone.get("message_length", "medium")
        humor_style = tone.get("humor_style", "none")
        primary_emotion = emotion.get("primary_emotion", "neutral")

        if language == "hinglish":
            directives.append("Reply in natural Hinglish when it helps, with simple English technical terms.")
        elif language == "mixed_hindi_english":
            directives.append("Respect the user's Hindi/English mix and keep code or API terms in English.")
        elif language == "hindi":
            directives.append("Use natural Hindi when practical, keeping exact technical names unchanged.")
        else:
            directives.append("Reply in clear, natural English.")

        if formality == "professional":
            directives.append("Use a professional, precise tone.")
        elif formality == "casual":
            directives.append("Use a relaxed conversational tone without becoming sloppy.")
        else:
            directives.append("Use a warm but direct tone.")

        if message_length == "short":
            directives.append("Start concise and ask a useful follow-up only if needed.")
        elif message_length == "long":
            directives.append("Handle the full context carefully and organize the answer for scanning.")

        if energy == "high":
            directives.append("Match the user's energy with momentum while staying controlled.")
        elif energy == "low":
            directives.append("Keep the response calm and low-friction.")

        if humor_style == "playful":
            directives.append("Light humor is welcome if it does not distract from the task.")

        if primary_emotion in {"frustration", "anger"}:
            directives.append("Acknowledge friction briefly, then move into concrete next steps.")
        elif primary_emotion in {"stress", "anxiety"}:
            directives.append("Reduce uncertainty with a steady, practical response.")
        elif primary_emotion in {"excitement", "motivation"}:
            directives.append("Preserve the user's momentum and make the path forward feel doable.")
        elif primary_emotion == "sadness":
            directives.append("Be gentle and grounded before giving advice.")

        return directives


style_mirroring_engine = StyleMirroringEngine()


import re
from collections import Counter
from typing import Any


class EmotionDetectionEngine:
    EMOTION_LEXICON: dict[str, set[str]] = {
        "happiness": {
            "happy",
            "great",
            "awesome",
            "nice",
            "love",
            "good",
            "perfect",
            "thanks",
            "thank",
            "appreciate",
            "glad",
            "yay",
        },
        "sadness": {
            "sad",
            "hurt",
            "down",
            "lost",
            "lonely",
            "depressed",
            "upset",
            "cry",
            "hopeless",
        },
        "frustration": {
            "again",
            "stuck",
            "annoying",
            "frustrated",
            "confusing",
            "broken",
            "issue",
            "problem",
            "waste",
            "circle",
            "circles",
        },
        "anger": {
            "angry",
            "mad",
            "furious",
            "hate",
            "ridiculous",
            "nonsense",
            "useless",
            "damn",
            "shit",
            "fuck",
        },
        "stress": {
            "deadline",
            "urgent",
            "pressure",
            "overwhelmed",
            "busy",
            "stress",
            "stressed",
            "tired",
        },
        "anxiety": {
            "worried",
            "nervous",
            "scared",
            "anxious",
            "afraid",
            "panic",
            "uncertain",
        },
        "excitement": {
            "excited",
            "wow",
            "amazing",
            "insane",
            "cool",
            "letsgo",
            "hyped",
        },
        "motivation": {
            "build",
            "ship",
            "finish",
            "improve",
            "learn",
            "goal",
            "focus",
            "start",
            "create",
        },
        "curiosity": {
            "why",
            "how",
            "what",
            "curious",
            "explain",
            "understand",
            "difference",
            "meaning",
        },
        "confidence": {
            "sure",
            "confident",
            "definitely",
            "clearly",
            "obvious",
            "know",
            "certain",
        },
    }

    TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z']+")

    def analyze(self, text: str) -> dict[str, Any]:
        normalized = text.lower()
        tokens = self.TOKEN_RE.findall(normalized)
        token_counts = Counter(tokens)
        scores = {emotion: 0.0 for emotion in self.EMOTION_LEXICON}

        for emotion, words in self.EMOTION_LEXICON.items():
            scores[emotion] = float(sum(token_counts[word] for word in words))

        exclamation_boost = min(text.count("!"), 4) * 0.25
        question_boost = min(text.count("?"), 4) * 0.2
        caps_words = [word for word in re.findall(r"\b[A-Z]{3,}\b", text) if word not in {"API", "URL"}]
        caps_boost = min(len(caps_words), 4) * 0.2

        if exclamation_boost:
            scores["excitement"] += exclamation_boost
            scores["anger"] += exclamation_boost * 0.35
        if question_boost:
            scores["curiosity"] += question_boost
        if caps_boost:
            scores["frustration"] += caps_boost
            scores["anger"] += caps_boost * 0.5

        primary_emotion = max(scores, key=scores.get) if scores else "neutral"
        max_score = scores.get(primary_emotion, 0.0)
        if max_score <= 0:
            primary_emotion = "neutral"

        word_count = max(len(tokens), 1)
        intensity = min(1.0, max_score / max(word_count * 0.08, 1.0))
        if primary_emotion == "neutral":
            intensity = 0.0

        signals = []
        if exclamation_boost:
            signals.append("exclamatory")
        if question_boost:
            signals.append("questioning")
        if caps_boost:
            signals.append("high_caps_emphasis")
        if len(text) > 1200:
            signals.append("long_context")

        return {
            "primary_emotion": primary_emotion,
            "intensity": round(intensity, 3),
            "scores": {key: round(value, 3) for key, value in scores.items()},
            "signals": signals,
        }


emotion_detection_engine = EmotionDetectionEngine()


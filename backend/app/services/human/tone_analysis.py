import re
from typing import Any


class ToneAnalysisEngine:
    DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
    WORD_RE = re.compile(r"[a-zA-Z][a-zA-Z+#.'-]*")
    ROMAN_HINDI_WORDS = {
        "acha",
        "accha",
        "bhai",
        "yaar",
        "haan",
        "nahi",
        "nahin",
        "kya",
        "kaise",
        "hai",
        "ho",
        "kar",
        "karo",
        "matlab",
        "thoda",
        "jaldi",
        "samjha",
        "samjhao",
        "bata",
        "dekho",
        "chahiye",
    }
    CASUAL_MARKERS = {"lol", "haha", "bro", "btw", "idk", "tbh", "yo", "pls", "plz"}
    PROFESSIONAL_MARKERS = {
        "please",
        "kindly",
        "regards",
        "requirement",
        "architecture",
        "production",
        "implementation",
    }
    TECHNICAL_MARKERS = {
        "api",
        "database",
        "schema",
        "backend",
        "frontend",
        "fastapi",
        "react",
        "typescript",
        "sql",
        "sqlite",
        "jwt",
        "docker",
        "prompt",
        "model",
        "service",
        "endpoint",
        "module",
        "code",
        "bug",
        "test",
    }

    def analyze(self, text: str) -> dict[str, Any]:
        words = self.WORD_RE.findall(text)
        lowered = [word.lower().strip(".'-") for word in words]
        word_count = len(lowered)
        roman_hindi_count = sum(1 for word in lowered if word in self.ROMAN_HINDI_WORDS)
        english_count = sum(1 for word in lowered if word.isascii() and word.isalpha())
        has_devanagari = bool(self.DEVANAGARI_RE.search(text))

        if has_devanagari and english_count:
            language = "mixed_hindi_english"
        elif has_devanagari:
            language = "hindi"
        elif roman_hindi_count >= 2 and english_count >= 2:
            language = "hinglish"
        else:
            language = "english"

        casual_hits = sum(1 for word in lowered if word in self.CASUAL_MARKERS)
        professional_hits = sum(1 for word in lowered if word in self.PROFESSIONAL_MARKERS)
        if professional_hits > casual_hits:
            formality = "professional"
        elif casual_hits:
            formality = "casual"
        else:
            formality = "neutral"

        exclamations = text.count("!")
        questions = text.count("?")
        caps_words = len([word for word in re.findall(r"\b[A-Z]{3,}\b", text) if word not in {"API", "URL"}])
        if exclamations >= 2 or caps_words >= 2:
            energy = "high"
        elif word_count <= 8 and not questions:
            energy = "low"
        else:
            energy = "steady"

        if word_count < 25:
            message_length = "short"
        elif word_count < 140:
            message_length = "medium"
        else:
            message_length = "long"

        humor_markers = casual_hits + text.lower().count("haha") + text.lower().count("lol")
        humor_style = "playful" if humor_markers else "none"

        technical_hits = sum(1 for word in lowered if word in self.TECHNICAL_MARKERS)
        technical_density = round(technical_hits / max(word_count, 1), 3)

        return {
            "language": language,
            "formality": formality,
            "energy": energy,
            "message_length": message_length,
            "punctuation": {
                "questions": questions,
                "exclamations": exclamations,
                "caps_words": caps_words,
            },
            "humor_style": humor_style,
            "technical_density": technical_density,
            "roman_hindi_words": roman_hindi_count,
            "word_count": word_count,
        }


tone_analysis_engine = ToneAnalysisEngine()


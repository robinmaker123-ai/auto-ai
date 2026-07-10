import io
import wave

from fastapi import HTTPException, status

from app.core.config import settings
from app.services.groq_service import groq_service


class LiveAudioService:
    def transcribe(self, chunks: list[bytes], audio_format: str) -> str:
        audio = b"".join(chunks)
        if not audio:
            return ""
        max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
        if len(audio) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Live audio turn is too large.",
            )
        if audio_format == "pcm16":
            audio = self._pcm16_to_wav(audio)
            filename = "live-turn.wav"
        else:
            extension = audio_format if audio_format in {"webm", "ogg", "wav", "mp3", "m4a"} else "webm"
            filename = f"live-turn.{extension}"
        return groq_service.transcribe_audio(audio, filename).strip()

    @staticmethod
    def _pcm16_to_wav(audio: bytes) -> bytes:
        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(16000)
            wav.writeframes(audio)
        return output.getvalue()


live_audio_service = LiveAudioService()

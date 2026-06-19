from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.services.groq_service import groq_service


router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/transcribe")
async def transcribe_voice(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    extension = Path(file.filename or "").suffix.lower()
    if extension not in settings.ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Supported audio formats are FLAC, MP3, M4A, MPEG, MPGA, OGG, WAV, and WEBM.",
        )
    data = await file.read()
    text = groq_service.transcribe_audio(data, file.filename or "voice.webm")
    return {"text": text, "model": settings.GROQ_AUDIO_MODEL}


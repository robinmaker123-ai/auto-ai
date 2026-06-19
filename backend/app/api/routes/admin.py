import platform
import shutil

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.core.config import settings
from app.db.session import get_db
from app.models.api_usage import APIUsage
from app.models.chat import Chat
from app.models.document import Document
from app.models.message import Message
from app.models.user import User
from app.schemas.admin import AdminStats, SystemStatus, TokenUsageSummary


router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStats)
def stats(_: User = Depends(get_current_admin), db: Session = Depends(get_db)) -> AdminStats:
    usage = db.execute(
        select(
            func.coalesce(func.sum(APIUsage.prompt_tokens), 0),
            func.coalesce(func.sum(APIUsage.completion_tokens), 0),
            func.coalesce(func.sum(APIUsage.total_tokens), 0),
            func.count(APIUsage.id),
        )
    ).one()
    total, used, free = shutil.disk_usage(settings.UPLOAD_DIR)
    return AdminStats(
        user_count=db.scalar(select(func.count()).select_from(User)) or 0,
        chat_count=db.scalar(select(func.count()).select_from(Chat)) or 0,
        message_count=db.scalar(select(func.count()).select_from(Message)) or 0,
        document_count=db.scalar(select(func.count()).select_from(Document)) or 0,
        api_calls=int(usage[3] or 0),
        token_usage=TokenUsageSummary(
            prompt_tokens=int(usage[0] or 0),
            completion_tokens=int(usage[1] or 0),
            total_tokens=int(usage[2] or 0),
        ),
        system=SystemStatus(
            environment=settings.ENVIRONMENT,
            database_backend=settings.DB_BACKEND,
            python_version=platform.python_version(),
            storage_total_gb=round(total / 1024 / 1024 / 1024, 2),
            storage_free_gb=round(free / 1024 / 1024 / 1024, 2),
        ),
    )


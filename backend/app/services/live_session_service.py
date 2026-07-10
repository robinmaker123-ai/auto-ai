from datetime import datetime

from fastapi import WebSocket
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import ACCESS_TOKEN_COOKIE
from app.core.security import decode_access_token
from app.models.live import LiveSession, VisionFrame
from app.models.user import User
from app.services.live_vision_service import VisualContext


class LiveSessionService:
    def authenticate(self, websocket: WebSocket, db: Session) -> User | None:
        token = websocket.query_params.get("token") or websocket.cookies.get(ACCESS_TOKEN_COOKIE)
        user_id = decode_access_token(token) if token else None
        user = db.get(User, user_id) if user_id else None
        if not user or not user.is_active or (user.subscription_status or "").lower() in {"blocked", "suspended"}:
            return None
        return user

    def start_or_resume(self, db: Session, user: User, session_id: str | None) -> LiveSession:
        session = None
        if session_id:
            session = db.scalar(
                select(LiveSession).where(LiveSession.id == session_id, LiveSession.user_id == user.id)
            )
            if session and session.status != "active":
                session = None
        if session is None:
            session = LiveSession(user_id=user.id, status="active")
            db.add(session)
            db.commit()
            db.refresh(session)
        return session

    def end(self, db: Session, session: LiveSession) -> None:
        if session.status == "ended":
            return
        session.status = "ended"
        session.ended_at = datetime.utcnow()
        db.add(session)
        db.commit()

    def latest_visual_context(self, db: Session, session: LiveSession, user: User) -> VisualContext:
        frame = db.scalar(
            select(VisionFrame)
            .where(VisionFrame.session_id == session.id, VisionFrame.user_id == user.id)
            .order_by(VisionFrame.created_at.desc())
            .limit(1)
        )
        if not frame:
            return VisualContext()
        from datetime import timezone

        return VisualContext(
            frame_id=frame.id,
            timestamp=frame.created_at.replace(tzinfo=timezone.utc),
            summary=frame.analysis_summary,
            confidence=0.8 if frame.analysis_summary else 0.0,
        )


live_session_service = LiveSessionService()

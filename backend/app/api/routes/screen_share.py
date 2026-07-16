import asyncio
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.api.deps import ACCESS_TOKEN_COOKIE, bearer_scheme
from app.core.config import settings
from app.core.security import create_screen_share_guest_token, decode_access_token, decode_screen_share_guest_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.call import TurnCredentials
from app.schemas.screen_share import (
    ScreenShareGuestToken,
    ScreenShareJoinCodeRequest,
    ScreenShareSessionCreate,
    ScreenShareSessionRead,
    ScreenShareTicket,
)
from app.services.presence_service import presence_service
from app.services.screen_share_service import (
    ScreenShareActor,
    guest_identity,
    participant_identities,
    screen_share_event,
    screen_share_service,
)
from app.services.turn_credentials_service import create_turn_credentials


router = APIRouter(prefix="/screen-share", tags=["screen-share"])


def get_screen_share_actor(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> ScreenShareActor:
    token = credentials.credentials if credentials else request.cookies.get(ACCESS_TOKEN_COOKIE)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Screen share access token is required.")

    user_id = decode_access_token(token)
    if user_id:
        user = db.get(User, user_id)
        if user and user.is_active and (user.subscription_status or "").lower() not in {"blocked", "suspended"}:
            return ScreenShareActor(identity_id=user.id, user=user)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user.")

    guest_id = decode_screen_share_guest_token(token)
    if guest_id:
        return ScreenShareActor(identity_id=guest_identity(guest_id))
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid screen share access token.")


@router.post("/guest-token", response_model=ScreenShareGuestToken)
def create_guest_screen_share_token(response: Response) -> ScreenShareGuestToken:
    guest_id = str(uuid.uuid4())
    response.headers["Cache-Control"] = "no-store"
    return ScreenShareGuestToken(
        access_token=create_screen_share_guest_token(
            guest_id, timedelta(seconds=settings.SCREEN_SHARE_GUEST_TOKEN_TTL_SECONDS)
        ),
        expires_in=settings.SCREEN_SHARE_GUEST_TOKEN_TTL_SECONDS,
    )


@router.post("/session", response_model=ScreenShareSessionRead, status_code=201)
async def create_screen_share_session(
    payload: ScreenShareSessionCreate,
    db: Session = Depends(get_db),
    actor: ScreenShareActor = Depends(get_screen_share_actor),
) -> ScreenShareSessionRead:
    session, invite_token, share_code = screen_share_service.create(
        db,
        actor,
        viewer_user_id=payload.viewer_user_id,
        invite_link=payload.invite_link,
        code_mode=payload.code_mode,
        expires_minutes=payload.expires_minutes,
    )
    invite_link = screen_share_service.invite_link(session.session_id, invite_token) if invite_token else None
    if actor.user:
        await screen_share_service.notify_created(db, session, actor.user, invite_link)
    return screen_share_service.serialize(session, invite_token, share_code)


@router.post("/session/join-code", response_model=ScreenShareSessionRead)
async def join_screen_share_code(
    payload: ScreenShareJoinCodeRequest,
    db: Session = Depends(get_db),
    actor: ScreenShareActor = Depends(get_screen_share_actor),
) -> ScreenShareSessionRead:
    if not await presence_service.allow_rate(
        "screen_share_join", actor.identity_id, settings.SCREEN_SHARE_JOIN_MAX_PER_MINUTE, 60
    ):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many screen share code attempts.")
    session = screen_share_service.claim_by_code(db, actor.identity_id, payload.code)
    return screen_share_service.serialize(session)


@router.get("/session/{session_id}", response_model=ScreenShareSessionRead)
def get_screen_share_session(
    session_id: str,
    invite: str | None = None,
    db: Session = Depends(get_db),
    actor: ScreenShareActor = Depends(get_screen_share_actor),
) -> ScreenShareSessionRead:
    session = screen_share_service.get_authorized(
        db, session_id, actor.identity_id, invite_token=invite, allow_claim=bool(invite)
    )
    return screen_share_service.serialize(session)


@router.post("/session/{session_id}/end", response_model=ScreenShareSessionRead)
async def end_screen_share_session(
    session_id: str,
    db: Session = Depends(get_db),
    actor: ScreenShareActor = Depends(get_screen_share_actor),
) -> ScreenShareSessionRead:
    session = screen_share_service.end(db, session_id, actor.identity_id)
    event = screen_share_event(
        "screen-share-ended",
        sender_user_id=actor.identity_id,
        session_id=session.session_id,
        payload={"status": session.status},
    )
    await asyncio.gather(
        *(presence_service.publish(participant_id, event) for participant_id in participant_identities(session)),
        return_exceptions=True,
    )
    return screen_share_service.serialize(session)


@router.post("/ws-ticket", response_model=ScreenShareTicket)
async def create_screen_share_ws_ticket(actor: ScreenShareActor = Depends(get_screen_share_actor)) -> ScreenShareTicket:
    ticket = await presence_service.create_ticket(actor.identity_id)
    return ScreenShareTicket(ticket=ticket, expires_in=settings.CALL_WS_TICKET_TTL_SECONDS)


@router.get("/turn-credentials", response_model=TurnCredentials)
async def screen_share_turn_credentials(actor: ScreenShareActor = Depends(get_screen_share_actor)) -> TurnCredentials:
    return await create_turn_credentials(actor.identity_id)

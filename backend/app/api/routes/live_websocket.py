import asyncio
import base64
import json
import logging
from contextlib import suppress
from typing import Any

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.live import LiveSession
from app.models.user import User
from app.services.live_audio_service import live_audio_service
from app.services.live_conversation_service import live_conversation_service
from app.services.live_session_service import live_session_service
from app.services.live_vision_service import VisualContext, live_vision_service


router = APIRouter(prefix="/live", tags=["live"])
logger = logging.getLogger("auto_ai.live.websocket")


class LiveSocketHandler:
    def __init__(self, websocket: WebSocket, user_id: str) -> None:
        self.websocket = websocket
        self.user_id = user_id
        self.session_id = ""
        self.language = "auto"
        self.provider: str | None = None
        self.model: str | None = None
        self.camera_on = False
        self.audio_chunks: list[bytes] = []
        self.audio_bytes = 0
        self.audio_format = "webm"
        self.visual_context = VisualContext()
        self.send_lock = asyncio.Lock()
        self.turn_task: asyncio.Task | None = None
        self.vision_task: asyncio.Task | None = None
        self.pending_frame: dict[str, Any] | None = None
        self.context_updated = asyncio.Event()
        self.ended = False

    async def run(self) -> None:
        while not self.ended:
            message = await self.websocket.receive_text()
            try:
                event = json.loads(message)
                if not isinstance(event, dict):
                    raise ValueError("Event must be an object.")
                await self.dispatch(event)
            except (json.JSONDecodeError, ValueError) as exc:
                await self.send("session.error", code="invalid_event", message=str(exc), recoverable=True)

    async def dispatch(self, event: dict[str, Any]) -> None:
        event_type = str(event.get("type") or "")
        if event_type == "ping":
            await self.send("pong", timestamp=event.get("timestamp"))
            return
        if event_type == "session.start":
            await self.start_session(event)
            return
        if not self.session_id:
            await self.send("session.error", code="session_not_started", message="Start the live session first.", recoverable=True)
            return
        if event_type == "audio.chunk":
            await self.add_audio_chunk(event)
        elif event_type == "audio.end":
            await self.finish_audio(event)
        elif event_type == "audio.cancel":
            self.clear_audio()
        elif event_type == "transcript.final":
            await self.start_turn(str(event.get("text") or "").strip())
        elif event_type == "vision.frame":
            await self.queue_vision_frame(event)
        elif event_type == "vision.context_request":
            await self.send("vision.context", **self.visual_context.as_event())
        elif event_type == "assistant.interrupt":
            if self.turn_task and not self.turn_task.done():
                self.turn_task.cancel()
            await self.send("assistant.done", interrupted=True)
        elif event_type == "session.end":
            await self.end_session()
        else:
            await self.send("session.error", code="unsupported_event", message=f"Unsupported event: {event_type}", recoverable=True)

    async def start_session(self, event: dict[str, Any]) -> None:
        if self.session_id:
            self.language = str(event.get("language") or self.language)[:40]
            self.provider = str(event.get("provider") or self.provider or "").strip() or None
            self.model = str(event.get("model") or self.model or "").strip() or None
            self.camera_on = bool(event.get("camera_on", self.camera_on))
            await self.send("session.ready", session_id=self.session_id, resumed=True, configured=True)
            return
        requested_id = str(event.get("session_id") or "").strip() or None
        self.language = str(event.get("language") or "auto")[:40]
        self.provider = str(event.get("provider") or "").strip() or None
        self.model = str(event.get("model") or "").strip() or None
        self.camera_on = bool(event.get("camera_on", False))

        def load_session() -> tuple[str, VisualContext]:
            with SessionLocal() as db:
                user = db.get(User, self.user_id)
                if not user:
                    raise RuntimeError("User no longer exists.")
                session = live_session_service.start_or_resume(db, user, requested_id)
                return session.id, live_session_service.latest_visual_context(db, session, user)

        self.session_id, self.visual_context = await asyncio.to_thread(load_session)
        await self.send(
            "session.ready",
            session_id=self.session_id,
            resumed=bool(requested_id and requested_id == self.session_id),
            visual_context=self.visual_context.as_event(),
        )

    async def add_audio_chunk(self, event: dict[str, Any]) -> None:
        encoded = str(event.get("data") or "")
        if not encoded:
            return
        try:
            chunk = base64.b64decode(encoded, validate=True)
        except ValueError:
            await self.send("session.error", code="invalid_audio", message="Invalid audio chunk.", recoverable=True)
            return
        max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
        if self.audio_bytes + len(chunk) > max_bytes:
            self.clear_audio()
            await self.send("session.error", code="audio_too_large", message="Audio turn is too long. Please try again.", recoverable=True)
            return
        self.audio_format = str(event.get("format") or self.audio_format).lower()
        self.audio_chunks.append(chunk)
        self.audio_bytes += len(chunk)

    async def finish_audio(self, event: dict[str, Any]) -> None:
        chunks = self.audio_chunks
        audio_format = str(event.get("format") or self.audio_format).lower()
        self.clear_audio()
        if not chunks:
            return
        try:
            transcript = await asyncio.to_thread(live_audio_service.transcribe, chunks, audio_format)
        except Exception as exc:
            logger.warning("live_audio_transcription_failed user_id=%s error=%s", self.user_id, exc)
            await self.send(
                "session.error",
                code="stt_failed",
                message="Main clearly nahi sun paya. Dobara boliye.",
                recoverable=True,
            )
            return
        if not transcript:
            await self.send(
                "session.error",
                code="stt_empty",
                message="Main clearly nahi sun paya. Dobara boliye.",
                recoverable=True,
            )
            return
        await self.send("transcript.final", text=transcript)
        await self.start_turn(transcript)

    async def start_turn(self, transcript: str) -> None:
        if not transcript:
            return
        if self.turn_task and not self.turn_task.done():
            self.turn_task.cancel()
            with suppress(asyncio.CancelledError):
                await self.turn_task
        self.turn_task = asyncio.create_task(self.answer_turn(transcript))

    async def answer_turn(self, transcript: str) -> None:
        try:
            visual_question = self.camera_on and live_vision_service.is_visual_question(transcript)
            if visual_question and self.visual_context.age_seconds() > 1.5:
                self.context_updated.clear()
                await self.send("vision.processing", request_fresh_frame=True)
                with suppress(asyncio.TimeoutError):
                    await asyncio.wait_for(self.context_updated.wait(), timeout=1.2)
            visual = self.visual_context if visual_question and self.visual_context.summary else None
            if visual_question and visual is None:
                await self.send("assistant.text.done", text="Camera frame clear nahi mila. Phone ko thoda stable rakhiye.")
                await self.send("assistant.done", interrupted=False)
                return
            await self.send("assistant.thinking")

            def answer() -> tuple[str, str, str]:
                with SessionLocal() as db:
                    user = db.get(User, self.user_id)
                    session = db.get(LiveSession, self.session_id)
                    if not user or not session or session.user_id != self.user_id or session.status != "active":
                        raise RuntimeError("Live session is no longer active.")
                    return live_conversation_service.answer(
                        db,
                        user=user,
                        session=session,
                        transcript=transcript,
                        language=self.language,
                        provider=self.provider,
                        model=self.model,
                        visual_context=visual,
                    )

            response, model, message_id = await asyncio.to_thread(answer)
            for part in self.text_deltas(response):
                await self.send("assistant.text.delta", delta=part)
            await self.send("assistant.text.done", text=response, model=model, message_id=message_id)
            await self.send("assistant.done", interrupted=False)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("live_turn_failed session_id=%s", self.session_id)
            detail = exc.detail if isinstance(exc, HTTPException) else "Live response failed. Please try again."
            await self.send("session.error", code="turn_failed", message=str(detail), recoverable=True)

    async def queue_vision_frame(self, event: dict[str, Any]) -> None:
        if not self.camera_on and not bool(event.get("camera_on", False)):
            return
        self.camera_on = True
        frame = {
            "image_base64": str(event.get("data") or event.get("image_base64") or ""),
            "prompt": str(event.get("prompt") or ""),
        }
        if not frame["image_base64"]:
            return
        if self.vision_task and not self.vision_task.done():
            self.pending_frame = frame
            return
        self.vision_task = asyncio.create_task(self.process_vision_frames(frame))

    async def process_vision_frames(self, frame: dict[str, str]) -> None:
        current: dict[str, str] | None = frame
        while current and not self.ended:
            await self.send("vision.processing", request_fresh_frame=False)
            try:
                def analyze() -> VisualContext:
                    with SessionLocal() as db:
                        session = db.get(LiveSession, self.session_id)
                        if not session or session.user_id != self.user_id or session.status != "active":
                            raise RuntimeError("Live session is no longer active.")
                        return live_vision_service.analyze_frame(
                            db,
                            session_id=self.session_id,
                            user_id=self.user_id,
                            image_base64=current["image_base64"],
                            prompt=current["prompt"],
                        )

                self.visual_context = await asyncio.to_thread(analyze)
                self.context_updated.set()
                await self.send("vision.context", **self.visual_context.as_event())
            except Exception as exc:
                logger.warning("live_vision_failed session_id=%s error=%s", self.session_id, exc)
                self.context_updated.set()
                await self.send(
                    "session.error",
                    code="vision_failed",
                    message="Camera frame clear nahi mila. Phone ko thoda stable rakhiye.",
                    recoverable=True,
                )
            current = self.pending_frame
            self.pending_frame = None

    async def end_session(self) -> None:
        self.ended = True
        self.clear_audio()
        for task in (self.turn_task, self.vision_task):
            if task and not task.done():
                task.cancel()

        def end() -> None:
            with SessionLocal() as db:
                session = db.get(LiveSession, self.session_id)
                if session and session.user_id == self.user_id:
                    live_session_service.end(db, session)

        await asyncio.to_thread(end)
        await self.send("assistant.done", ended=True)
        await self.websocket.close(code=1000)

    async def send(self, event_type: str, **payload: Any) -> None:
        async with self.send_lock:
            await self.websocket.send_json({"type": event_type, **payload})

    def clear_audio(self) -> None:
        self.audio_chunks = []
        self.audio_bytes = 0
        self.audio_format = "webm"

    @staticmethod
    def text_deltas(text: str) -> list[str]:
        words = text.split(" ")
        return [word + (" " if index < len(words) - 1 else "") for index, word in enumerate(words)]

    async def cleanup(self) -> None:
        self.ended = True
        self.clear_audio()
        tasks = [task for task in (self.turn_task, self.vision_task) if task and not task.done()]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


@router.websocket("/ws")
async def live_websocket(websocket: WebSocket) -> None:
    with SessionLocal() as db:
        user = live_session_service.authenticate(websocket, db)
        user_id = user.id if user else ""
    if not user_id:
        await websocket.close(code=4401, reason="Not authenticated")
        return
    await websocket.accept()
    handler = LiveSocketHandler(websocket, user_id)
    try:
        await handler.run()
    except WebSocketDisconnect:
        pass
    except RuntimeError as exc:
        logger.info("live_socket_closed user_id=%s reason=%s", user_id, exc)
    finally:
        await handler.cleanup()

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import admin, ai, auth, chats, documents, health, human, voice
from app.core.config import settings
from app.core.rate_limit import InMemoryRateLimitMiddleware
from app.db.session import init_db


LOCAL_DEV_ORIGIN_REGEX = (
    #r"^https?://("
    #r"localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|"
    #r"10(?:\.\d{1,3}){3}|"
    #r"192\.168(?:\.\d{1,3}){2}|"
    #r"172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}"
    #r")(?::\d+)?$"
    "https://autoai.site.je",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
)


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version="1.0.0",
        description="Production-ready AI assistant backend powered by Groq.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_origin_regex=None if settings.is_production else LOCAL_DEV_ORIGIN_REGEX,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(InMemoryRateLimitMiddleware)

    @app.on_event("startup")
    def on_startup() -> None:
        Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
        init_db()

    app.include_router(health.router)
    app.include_router(health.router, prefix=settings.API_V1_STR)
    app.include_router(auth.router, prefix=settings.API_V1_STR)
    app.include_router(chats.router, prefix=settings.API_V1_STR)
    app.include_router(ai.router, prefix=settings.API_V1_STR)
    app.include_router(documents.router, prefix=settings.API_V1_STR)
    app.include_router(voice.router, prefix=settings.API_V1_STR)
    app.include_router(human.router, prefix=settings.API_V1_STR)
    app.include_router(admin.router, prefix=settings.API_V1_STR)
    return app


app = create_app()

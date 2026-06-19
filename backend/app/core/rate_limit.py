from collections import defaultdict, deque
from time import monotonic
from typing import Deque

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.core.config import settings


class InMemoryRateLimitMiddleware(BaseHTTPMiddleware):
    """Small per-process rate limiter suitable for SQLite/single-node deployments."""

    def __init__(self, app, limit_per_minute: int | None = None) -> None:
        super().__init__(app)
        self.limit_per_minute = limit_per_minute or settings.RATE_LIMIT_PER_MINUTE
        self.window_seconds = 60
        self.requests: dict[str, Deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method == "OPTIONS" or request.url.path in {"/health", "/api/v1/health"}:
            return await call_next(request)

        client_host = request.client.host if request.client else "unknown"
        auth = request.headers.get("authorization", "")
        key = f"{client_host}:{auth[-16:]}:{request.url.path}"
        now = monotonic()
        bucket = self.requests[key]

        while bucket and now - bucket[0] > self.window_seconds:
            bucket.popleft()

        if len(bucket) >= self.limit_per_minute:
            return Response(
                content='{"detail":"Rate limit exceeded"}',
                status_code=429,
                media_type="application/json",
                headers={
                    "X-RateLimit-Limit": str(self.limit_per_minute),
                    "X-RateLimit-Remaining": "0",
                },
            )

        bucket.append(now)
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.limit_per_minute)
        response.headers["X-RateLimit-Remaining"] = str(max(self.limit_per_minute - len(bucket), 0))
        return response


from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


SearchMode = Literal["off", "auto", "web", "news", "research", "deep"]


class SearchSource(BaseModel):
    id: str
    title: str
    url: str
    snippet: str
    source: str
    provider: str
    published_at: str | None = None
    credibility_score: float = Field(ge=0, le=1)
    credibility_label: str


class SearchResultBundle(BaseModel):
    run_id: str | None = None
    query: str
    mode: SearchMode
    provider: str
    status: str
    cache_hit: bool = False
    searched: bool = True
    reason: str = ""
    confidence_score: float = Field(default=0, ge=0, le=1)
    summary: str = ""
    sources: list[SearchSource] = Field(default_factory=list)
    created_at: datetime | None = None


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    mode: SearchMode = "auto"


class SearchHistoryItem(BaseModel):
    id: str
    query: str
    mode: SearchMode
    provider: str
    status: str
    cache_hit: bool
    confidence_score: float
    summary: str
    results: dict
    created_at: datetime

    model_config = {"from_attributes": True}

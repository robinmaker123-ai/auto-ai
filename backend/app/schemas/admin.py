from pydantic import BaseModel


class TokenUsageSummary(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class SystemStatus(BaseModel):
    environment: str
    database_backend: str
    python_version: str
    storage_total_gb: float
    storage_free_gb: float


class AdminStats(BaseModel):
    user_count: int
    chat_count: int
    message_count: int
    document_count: int
    api_calls: int
    token_usage: TokenUsageSummary
    system: SystemStatus


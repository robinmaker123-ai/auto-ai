from datetime import datetime

from pydantic import BaseModel


class DocumentRead(BaseModel):
    id: str
    chat_id: str | None
    filename: str
    content_type: str
    summary: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentDetail(DocumentRead):
    extracted_text: str


class DocumentSummary(BaseModel):
    document: DocumentRead
    summary: str


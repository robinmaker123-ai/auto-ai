import re
from io import BytesIO
from pathlib import Path

from docx import Document as DocxDocument
from fastapi import HTTPException, UploadFile, status
from pypdf import PdfReader

from app.core.config import settings
from app.services.groq_service import groq_service


class DocumentService:
    async def save_and_extract(self, upload: UploadFile, user_id: str) -> tuple[str, str]:
        filename = upload.filename or "document"
        extension = Path(filename).suffix.lower()
        if extension not in settings.ALLOWED_DOCUMENT_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Supported document formats are PDF, TXT, and DOCX.",
            )

        data = await upload.read()
        max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
        if len(data) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds {settings.MAX_UPLOAD_MB} MB.",
            )

        safe_name = self.safe_filename(filename)
        user_dir = Path(settings.UPLOAD_DIR) / user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        stored_path = user_dir / f"{Path(safe_name).stem}-{abs(hash(data))}{extension}"
        stored_path.write_bytes(data)
        return str(stored_path), self.extract_text(data, extension)

    def extract_text(self, data: bytes, extension: str) -> str:
        if extension == ".txt":
            return data.decode("utf-8", errors="replace").strip()
        if extension == ".pdf":
            reader = PdfReader(BytesIO(data))
            pages = [page.extract_text() or "" for page in reader.pages]
            return "\n\n".join(pages).strip()
        if extension == ".docx":
            doc = DocxDocument(BytesIO(data))
            return "\n".join(paragraph.text for paragraph in doc.paragraphs).strip()
        return ""

    def summarize(self, extracted_text: str, filename: str) -> str:
        text = extracted_text[: settings.MAX_DOCUMENT_CONTEXT_CHARS]
        messages = [
            {
                "role": "system",
                "content": "You are Auto-AI. Produce concise, accurate document summaries.",
            },
            {
                "role": "user",
                "content": (
                    f"Summarize the document named {filename}. Include key points, decisions, "
                    f"risks, and action items when present.\n\n{text}"
                ),
            },
        ]
        content, _, _ = groq_service.complete(messages)
        return content

    def document_context(self, documents: list[tuple[str, str]]) -> str:
        if not documents:
            return ""

        budget = settings.MAX_DOCUMENT_CONTEXT_CHARS
        chunks: list[str] = []
        for filename, text in documents:
            if budget <= 0:
                break
            excerpt = text[: min(len(text), budget)]
            budget -= len(excerpt)
            chunks.append(f"Document: {filename}\n{excerpt}")
        return "\n\n---\n\n".join(chunks)

    @staticmethod
    def safe_filename(filename: str) -> str:
        cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", filename).strip("._")
        return cleaned or "document"


document_service = DocumentService()


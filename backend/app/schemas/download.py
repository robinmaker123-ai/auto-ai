from datetime import datetime

from pydantic import BaseModel, Field


class ApkReleaseRead(BaseModel):
    id: str
    version: str
    version_code: int
    filename: str
    file_size: int
    sha256: str
    min_android_version: str
    release_notes: list[str] = Field(default_factory=list)
    changelog: str = ""
    is_active: bool
    created_at: datetime
    download_url: str


class ApkReleaseCreate(BaseModel):
    version: str = Field(pattern=r"^\d+\.\d+\.\d+([.-][A-Za-z0-9]+)?$")
    version_code: int = Field(ge=1)
    min_android_version: str = Field(default="Android 7.0", max_length=40)
    release_notes: list[str] = Field(default_factory=list, max_length=20)
    changelog: str = Field(default="", max_length=8000)


class ApkStats(BaseModel):
    latest: ApkReleaseRead | None
    total_downloads: int
    downloads_by_version: dict[str, int]

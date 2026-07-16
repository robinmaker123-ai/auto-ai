from __future__ import annotations

import json
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.call import UserDevice
from app.models.user import User
from app.schemas.device_monitoring import DeviceRegisterRequest
from app.services.device_token_security import encrypt_token, token_hash


def utc_now_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def normalize_platform(value: str | None) -> str:
    platform = (value or "android").strip().lower()
    if platform in {"desktop", "windows", "macos", "linux", "electron"}:
        return "desktop"
    if platform in {"android", "ios", "web"}:
        return platform
    return "android"


def safe_permission_status(value: dict[str, bool] | None) -> str | None:
    if value is None:
        return None
    notification_allowed = bool(value.get("notification") or value.get("notifications"))
    return json.dumps({"notification": notification_allowed}, separators=(",", ":"))


def upsert_registered_device(db: Session, user: User, payload: DeviceRegisterRequest) -> UserDevice:
    now = payload.lastSeenAt or utc_now_naive()
    device_id = payload.deviceId[:128]
    record = db.scalar(select(UserDevice).where(UserDevice.user_id == user.id, UserDevice.device_id == device_id))
    if not record:
        record = UserDevice(user_id=user.id, device_id=device_id)
        db.add(record)
    record.platform = normalize_platform(payload.platform)
    record.device_name = payload.deviceName
    record.manufacturer = payload.manufacturer
    record.model = payload.model
    record.os_version = payload.osVersion
    record.app_version = payload.appVersion
    record.fcm_token = None
    record.fcm_token_ciphertext = encrypt_token(payload.fcmToken)
    record.fcm_token_hash = token_hash(payload.fcmToken)
    if payload.permissionsStatus is not None:
        record.permissions_status = safe_permission_status(payload.permissionsStatus)
    record.is_active = True
    record.status = "online"
    record.last_registered_at = now
    record.last_seen_at = now
    record.updated_at = now
    db.commit()
    db.refresh(record)
    return record

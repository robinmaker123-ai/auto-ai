from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from fastapi import WebSocket
from sqlalchemy import delete, desc, select
from sqlalchemy.orm import Session

from app.models.call import UserDevice
from app.models.device_monitoring import UserDeviceActivity
from app.models.user import User
from app.schemas.device_monitoring import AdminDeviceSnapshotRead, AdminDeviceUserRead, DeviceActivityCreate, DeviceActivityRead, DeviceHeartbeatRequest, DeviceLocation, DeviceRegisterRequest
from app.services.device_token_security import decrypt_token, encrypt_token, token_hash
from app.services.firebase_notifications import firebase_notification_service

logger = logging.getLogger("auto_ai.device_monitoring")

class DeviceActivityStream:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, user_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            self._subscribers.setdefault(user_id, set()).add(websocket)

    async def unsubscribe(self, user_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            subscribers = self._subscribers.get(user_id)
            if not subscribers:
                return
            subscribers.discard(websocket)
            if not subscribers:
                self._subscribers.pop(user_id, None)

    async def publish(self, activity: DeviceActivityRead) -> None:
        data = activity.model_dump(mode="json")
        payload = {
            "type": "device-update",
            "event": "device-update",
            "userId": activity.userId,
            "deviceId": activity.deviceId,
            "deviceType": activity.type,
            "data": data,
        }
        async with self._lock:
            subscribers = list(self._subscribers.get(activity.userId, set()))
        stale: list[WebSocket] = []
        for websocket in subscribers:
            try:
                await websocket.send_json(payload)
            except Exception:
                stale.append(websocket)
        if stale:
            async with self._lock:
                current = self._subscribers.get(activity.userId)
                if current:
                    for websocket in stale:
                        current.discard(websocket)


device_activity_stream = DeviceActivityStream()


def ensure_device_snapshots(db: Session, user_id: str) -> dict[str, list[AdminDeviceSnapshotRead]]:
    return latest_device_snapshots(db, user_id)


def normalize_platform(value: str | None) -> str:
    platform = (value or "android").strip().lower()
    if platform in {"desktop", "windows", "macos", "linux", "electron"}:
        return "desktop"
    if platform in {"android", "ios", "web"}:
        return platform
    return "android"


def activity_to_read(activity: UserDeviceActivity) -> DeviceActivityRead:
    location = None
    if activity.latitude is not None or activity.longitude is not None:
        location = DeviceLocation(lat=activity.latitude, lng=activity.longitude)
    return DeviceActivityRead(
        id=activity.id,
        userId=activity.user_id,
        deviceId=activity.device_id or f"legacy-{activity.user_id}",
        type=activity.device_type or "mobile",
        timestamp=activity.timestamp,
        battery=activity.battery,
        screenOn=activity.screen_on,
        currentApp=activity.current_app,
        location=location,
        network=activity.network,
        storageTotal=activity.storage_total,
        storageUsed=activity.storage_used,
        storageFree=activity.storage_free,
        ramTotal=activity.ram_total,
        ramUsed=activity.ram_used,
        ramUsage=activity.ram_usage,
        deviceModel=activity.device_model,
        osVersion=activity.os_version,
        isActive=activity.is_active,
    )


def upsert_registered_device(db: Session, user: User, payload: DeviceRegisterRequest) -> UserDevice:
    now = payload.lastSeenAt or datetime.utcnow()
    device_id = payload.deviceId[:128]
    record = db.scalar(select(UserDevice).where(UserDevice.user_id == user.id, UserDevice.device_id == device_id))
    if not record:
        record = UserDevice(user_id=user.id, device_id=device_id)
        db.add(record)
    record.platform = normalize_platform(payload.platform)
    record.device_name = payload.deviceName
    record.os_version = payload.osVersion
    record.app_version = payload.appVersion
    record.fcm_token = None
    record.fcm_token_ciphertext = encrypt_token(payload.fcmToken)
    record.fcm_token_hash = token_hash(payload.fcmToken)
    record.is_active = True
    record.last_registered_at = now
    record.last_seen_at = now
    record.updated_at = now
    db.commit()
    db.refresh(record)
    return record


def screen_status_to_bool(value: str | bool | None) -> bool | None:
    if isinstance(value, bool) or value is None:
        return value
    normalized = value.strip().lower()
    if normalized in {"on", "true", "active", "awake", "1"}:
        return True
    if normalized in {"off", "false", "locked", "sleep", "0"}:
        return False
    return None


def heartbeat_device_activity(db: Session, user: User, payload: DeviceHeartbeatRequest) -> DeviceActivityRead:
    now = payload.lastSeenAt or datetime.utcnow()
    device_id = payload.deviceId[:128]
    record = db.scalar(select(UserDevice).where(UserDevice.user_id == user.id, UserDevice.device_id == device_id))
    if not record:
        record = UserDevice(user_id=user.id, device_id=device_id, platform="android")
        db.add(record)
    record.is_active = True
    record.last_seen_at = now
    record.updated_at = now
    activity = UserDeviceActivity(
        user_id=user.id,
        device_id=device_id,
        device_type=registered_device_type(record),
        timestamp=now,
        battery=payload.battery,
        screen_on=screen_status_to_bool(payload.screenStatus),
        network=payload.network,
        device_model=record.device_name,
        os_version=record.os_version,
        is_active=True,
    )
    db.add(activity)
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(activity)
    return activity_to_read(activity)


def create_activity(db: Session, user: User, payload: DeviceActivityCreate) -> DeviceActivityRead:
    location = payload.location or DeviceLocation()
    device_id = payload.deviceId or f"mobile-{user.id}"
    activity = UserDeviceActivity(
        user_id=user.id,
        device_id=device_id,
        device_type=payload.type,
        timestamp=payload.timestamp or datetime.utcnow(),
        battery=payload.battery,
        screen_on=payload.screenOn,
        current_app=payload.currentApp,
        latitude=location.lat,
        longitude=location.lng,
        network=payload.network,
        storage_total=payload.storageTotal,
        storage_used=payload.storageUsed,
        storage_free=payload.storageFree,
        ram_total=payload.ramTotal,
        ram_used=payload.ramUsed,
        ram_usage=payload.ramUsage,
        device_model=payload.deviceModel,
        os_version=payload.osVersion,
        is_active=payload.isActive,
    )
    user.updated_at = datetime.utcnow()
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity_to_read(activity)


def device_snapshot(activity: UserDeviceActivity, online_cutoff: datetime) -> AdminDeviceSnapshotRead:
    location = None
    if activity.latitude is not None or activity.longitude is not None:
        location = DeviceLocation(lat=activity.latitude, lng=activity.longitude)
    device_type = activity.device_type if activity.device_type in {"mobile", "laptop"} else "mobile"
    return AdminDeviceSnapshotRead(
        deviceId=activity.device_id or f"legacy-{activity.user_id}",
        deviceName=activity.device_model or ("Mobile device" if device_type == "mobile" else "Laptop/Desktop"),
        type=device_type,
        osVersion=activity.os_version,
        battery=activity.battery,
        storageTotal=activity.storage_total,
        storageUsed=activity.storage_used,
        ramTotal=activity.ram_total,
        ramUsed=activity.ram_used,
        network=activity.network,
        currentApp=activity.current_app,
        screenOn=activity.screen_on,
        lastActive=activity.timestamp,
        location=location,
        status="online" if activity.timestamp >= online_cutoff and activity.is_active else "offline",
    )


def registered_device_type(device: UserDevice) -> str:
    return "mobile" if device.platform in {"android", "ios"} else "laptop"


def registered_device_name(device: UserDevice) -> str:
    if device.device_name:
        return device.device_name
    if device.platform == "android":
        return "Unknown Android Device"
    if device.platform == "ios":
        return "Unknown iOS Device"
    if device.platform == "web":
        return "Web Browser"
    return "Registered Device"


def registered_device_snapshot(device: UserDevice, online_cutoff: datetime) -> AdminDeviceSnapshotRead:
    device_type = registered_device_type(device)
    return AdminDeviceSnapshotRead(
        deviceId=device.device_id,
        deviceName=registered_device_name(device),
        type=device_type,
        osVersion=device.os_version,
        battery=None,
        storageTotal=None,
        storageUsed=None,
        ramTotal=None,
        ramUsed=None,
        network=None,
        currentApp=None,
        screenOn=None,
        lastActive=device.last_seen_at,
        location=None,
        status="online" if device.last_seen_at >= online_cutoff and device.is_active else "offline",
    )


def latest_device_snapshots(db: Session, user_id: str, limit: int = 500) -> dict[str, list[AdminDeviceSnapshotRead]]:
    rows = db.scalars(
        select(UserDeviceActivity)
        .where(UserDeviceActivity.user_id == user_id)
        .order_by(desc(UserDeviceActivity.timestamp))
        .limit(max(1, min(limit, 1000)))
    ).all()
    seen: set[str] = set()
    online_cutoff = datetime.utcnow() - timedelta(seconds=10)
    result: dict[str, list[AdminDeviceSnapshotRead]] = {"mobile": [], "laptop": []}
    for row in rows:
        device_id = row.device_id or f"legacy-{row.user_id}"
        if device_id in seen:
            continue
        seen.add(device_id)
        snapshot = device_snapshot(row, online_cutoff)
        result[snapshot.type].append(snapshot)
    registered_devices = db.scalars(
        select(UserDevice)
        .where(UserDevice.user_id == user_id, UserDevice.is_active == True)  # noqa: E712
        .order_by(desc(UserDevice.last_seen_at))
        .limit(max(1, min(limit, 1000)))
    ).all()
    for device in registered_devices:
        if device.device_id in seen:
            continue
        seen.add(device.device_id)
        snapshot = registered_device_snapshot(device, online_cutoff)
        result[snapshot.type].append(snapshot)
    return result


def latest_activities(db: Session, user_id: str, limit: int = 100) -> list[DeviceActivityRead]:
    rows = db.scalars(
        select(UserDeviceActivity)
        .where(UserDeviceActivity.user_id == user_id)
        .order_by(desc(UserDeviceActivity.timestamp))
        .limit(max(1, min(limit, 500)))
    ).all()
    return [activity_to_read(row) for row in rows]


def clean_old_activities(db: Session, user_id: str) -> int:
    cutoff = datetime.utcnow() - timedelta(hours=24)
    result = db.execute(
        delete(UserDeviceActivity).where(
            UserDeviceActivity.user_id == user_id,
            UserDeviceActivity.timestamp < cutoff,
        )
    )
    db.commit()
    return int(result.rowcount or 0)


def list_device_users(db: Session) -> list[AdminDeviceUserRead]:
    users = db.scalars(select(User).order_by(User.created_at.desc())).all()
    result: list[AdminDeviceUserRead] = []
    online_cutoff = datetime.utcnow() - timedelta(seconds=10)
    for user in users:
        activity = db.scalar(
            select(UserDeviceActivity)
            .where(UserDeviceActivity.user_id == user.id)
            .order_by(desc(UserDeviceActivity.timestamp))
            .limit(1)
        )
        registered_device = None
        if not activity:
            registered_device = db.scalar(
                select(UserDevice)
                .where(UserDevice.user_id == user.id, UserDevice.is_active == True)  # noqa: E712
                .order_by(desc(UserDevice.last_seen_at))
                .limit(1)
            )
        result.append(
            AdminDeviceUserRead(
                userId=user.id,
                name=user.name,
                email=user.email,
                deviceModel=activity.device_model if activity else (registered_device_name(registered_device) if registered_device else None),
                osVersion=activity.os_version if activity else None,
                lastActive=activity.timestamp if activity else (registered_device.last_seen_at if registered_device else None),
                online=bool(
                    (activity and activity.timestamp >= online_cutoff and activity.is_active)
                    or (registered_device and registered_device.last_seen_at >= online_cutoff and registered_device.is_active)
                ),
            )
        )
    return result


def send_device_command(db: Session, user_id: str, command_type: str, title: str, body: str, device_id: str | None = None) -> tuple[int, int]:
    query = select(UserDevice).where(
        UserDevice.user_id == user_id,
        UserDevice.platform == "android",
        UserDevice.is_active == True,  # noqa: E712
    )
    if device_id:
        query = query.where(UserDevice.device_id == device_id[:128])
    devices = db.scalars(query).all()
    sent = 0
    failed = 0
    for device in devices:
        token = decrypt_token(device.fcm_token_ciphertext, device.fcm_token)
        if not token:
            failed += 1
            device.is_active = False
            device.updated_at = datetime.utcnow()
            continue
        result = firebase_notification_service.send_device_command(
            token,
            command_type=command_type,
            user_id=user_id,
            title=title,
            body=body,
        )
        if result.ok:
            sent += 1
        else:
            failed += 1
            if result.inactive:
                device.is_active = False
                device.fcm_token = None
                device.fcm_token_ciphertext = None
                device.fcm_token_hash = None
                device.updated_at = datetime.utcnow()
    db.commit()
    logger.info("device_command type=%s user_id=%s sent=%d failed=%d", command_type, user_id, sent, failed)
    return sent, failed

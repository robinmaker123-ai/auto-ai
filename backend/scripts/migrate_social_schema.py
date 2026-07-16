from __future__ import annotations

import re
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import inspect, text  # noqa: E402

from app.db.session import engine  # noqa: E402
from app import models  # noqa: F401,E402
from app.db.base import Base  # noqa: E402


def main() -> None:
    inspector = inspect(engine)
    dialect = engine.dialect.name
    quote = engine.dialect.identifier_preparer.quote
    Base.metadata.create_all(bind=engine, tables=[models.SocialFollow.__table__, models.SocialNotification.__table__])
    inspector = inspect(engine)
    with engine.begin() as connection:
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "bio" not in user_columns:
            connection.execute(text(f"ALTER TABLE {quote('users')} ADD COLUMN {quote('bio')} TEXT"))
        if "profile_visibility" not in user_columns:
            connection.execute(text(f"ALTER TABLE {quote('users')} ADD COLUMN {quote('profile_visibility')} VARCHAR(16) NOT NULL DEFAULT 'public'"))
        if "message_permission" not in user_columns:
            connection.execute(text(f"ALTER TABLE {quote('users')} ADD COLUMN {quote('message_permission')} VARCHAR(32) NOT NULL DEFAULT 'everyone'"))
        connection.execute(text(f"UPDATE {quote('users')} SET {quote('profile_visibility')} = 'public' WHERE {quote('profile_visibility')} IS NULL OR TRIM({quote('profile_visibility')}) = ''"))
        connection.execute(text(f"UPDATE {quote('users')} SET {quote('message_permission')} = 'everyone' WHERE {quote('message_permission')} IS NULL OR TRIM({quote('message_permission')}) = ''"))
        rows = connection.execute(text(f"SELECT {quote('id')}, {quote('name')}, {quote('username')} FROM {quote('users')}")).mappings()
        assigned: set[str] = set()
        pending: list[tuple[str, str]] = []
        for row in rows:
            current = str(row["username"] or "").strip().lower()
            if current:
                assigned.add(current)
                continue
            base = re.sub(r"[^a-z0-9]+", "_", str(row["name"] or "user").lower()).strip("_")[:30] or "user"
            suffix = re.sub(r"[^a-z0-9]", "", str(row["id"]).lower())[:8] or "account"
            candidate = f"{base}_{suffix}"[:48]
            counter = 2
            while candidate in assigned:
                tail = f"_{counter}"
                candidate = f"{base[:48 - len(tail)]}{tail}"
                counter += 1
            assigned.add(candidate)
            pending.append((str(row["id"]), candidate))
        for user_id, username in pending:
            connection.execute(text(f"UPDATE {quote('users')} SET {quote('username')} = :username WHERE {quote('id')} = :user_id"), {"username": username, "user_id": user_id})
        if dialect in {"sqlite", "postgresql"}:
            connection.execute(text(f"CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username_lower ON {quote('users')} (LOWER({quote('username')})) WHERE {quote('username')} IS NOT NULL"))
        social_columns = {column["name"] for column in inspector.get_columns("social_follows")}
        social_follows = quote("social_follows")
        additions = {
            "pair_key": "VARCHAR(73)",
            "responder_user_id": "VARCHAR(36)",
            "cancelled_at": "DATETIME",
            "disconnected_at": "DATETIME",
            "rejection_reason_category": "VARCHAR(32)",
        }
        for column_name, definition in additions.items():
            if column_name not in social_columns:
                connection.execute(text(f"ALTER TABLE {social_follows} ADD COLUMN {quote(column_name)} {definition}"))
        rows = connection.execute(
            text(
                f"SELECT {quote('id')}, {quote('follower_id')}, {quote('following_id')} FROM {social_follows} "
                f"WHERE {quote('pair_key')} IS NULL OR TRIM({quote('pair_key')}) = ''"
            )
        ).mappings()
        for row in rows:
            key = ":".join(sorted([str(row["follower_id"]), str(row["following_id"])]))
            connection.execute(text(f"UPDATE {social_follows} SET {quote('pair_key')} = :pair_key WHERE {quote('id')} = :row_id"), {"pair_key": key, "row_id": str(row["id"])})
        connection.execute(text(f"CREATE INDEX IF NOT EXISTS ix_social_follows_pair_key ON {social_follows} ({quote('pair_key')})"))
        connection.execute(text(f"CREATE INDEX IF NOT EXISTS ix_social_follows_status_created ON {social_follows} ({quote('status')}, {quote('requested_at')})"))
        if {"chat_participants", "user_chat_messages"}.issubset(set(inspector.get_table_names())):
            message_threads = [str(row["thread_id"]) for row in connection.execute(text(f"SELECT DISTINCT {quote('thread_id')} FROM {quote('user_chat_messages')}")).mappings()]
            for thread_id in message_threads:
                participants = [
                    str(row["user_id"])
                    for row in connection.execute(
                        text(f"SELECT {quote('user_id')} FROM {quote('chat_participants')} WHERE {quote('thread_id')} = :thread_id ORDER BY {quote('user_id')} ASC"),
                        {"thread_id": thread_id},
                    ).mappings()
                ]
                if len(participants) != 2:
                    continue
                first_id, second_id = participants
                key = ":".join([first_id, second_id])
                existing = connection.execute(
                    text(
                        f"SELECT {quote('id')} FROM {social_follows} WHERE ({quote('pair_key')} = :pair_key OR "
                        f"(({quote('follower_id')} = :first_id AND {quote('following_id')} = :second_id) OR "
                        f"({quote('follower_id')} = :second_id AND {quote('following_id')} = :first_id))) "
                        f"AND {quote('status')} IN ('pending', 'accepted') LIMIT 1"
                    ),
                    {"pair_key": key, "first_id": first_id, "second_id": second_id},
                ).first()
                if not existing:
                    connection.execute(
                        text(
                            f"INSERT INTO {social_follows} ({quote('id')}, {quote('follower_id')}, {quote('following_id')}, "
                            f"{quote('pair_key')}, {quote('status')}, {quote('requested_at')}, {quote('created_at')}, {quote('updated_at')}) "
                            "VALUES (:id, :first_id, :second_id, :pair_key, 'accepted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                        ),
                        {"id": str(uuid.uuid4()), "first_id": first_id, "second_id": second_id, "pair_key": key},
                    )
    print("Social schema migration completed.")


if __name__ == "__main__":
    main()

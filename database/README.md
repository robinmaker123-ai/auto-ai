# Database

Auto-AI starts with SQLite and stores the default database at `database/auto_ai.db`.

The backend keeps persistence behind repository/service boundaries so the active SQLAlchemy implementation can be replaced by a MongoDB implementation without changing API route contracts. Set `DB_BACKEND=mongodb` and `MONGODB_URL` when adding a Mongo adapter.

The SQLite file is intentionally ignored by git.

## Human Mode Tables

Auto-AI creates these adaptive conversation tables on backend startup:

- `user_interaction_profiles`: one row per user for trust, rapport, respect, curiosity, confidence, frustration, humor, communication style, personality blend, topics, projects, goals, and learning style.
- `user_memories`: user-owned long-term memory facts with category, key, value, source, confidence, and last-seen timestamps.
- `conversation_turn_analyses`: per-turn emotion, tone, intent, language, personality, state delta, and conversation flags.

See `../docs/human-mode.md` for the full schema.

## Content Manager Tables

The CMS uses additive SQLAlchemy tables for pages, blocks, revisions, global content, UI text, FAQs, announcements, media metadata and audit logs. Backend startup creates missing tables and safely seeds current source content as drafts.

Run the idempotent migration manually when needed:

```powershell
cd backend
python scripts/migrate_cms_schema.py
```

CMS images reuse `UPLOAD_DIR/cms`. Production deployments must keep `UPLOAD_DIR` on persistent storage and continue serving `/uploads` through the backend or an equivalent trusted storage proxy.

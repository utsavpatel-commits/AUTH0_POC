"""One-time column adds for user permission overrides (no Alembic)."""
from sqlalchemy import text

from app.core.db import engine


async def ensure_user_permission_columns() -> None:
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_permissions TEXT"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS demo_password VARCHAR(80)"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_set BOOLEAN DEFAULT FALSE"))

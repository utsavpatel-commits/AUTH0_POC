"""One-time schema patches for orgs and audit logs (no Alembic)."""
from sqlalchemy import text

from app.core.db import engine


async def ensure_org_parent_column() -> None:
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE orgs ADD COLUMN IF NOT EXISTS parent_org_id INTEGER REFERENCES orgs(id)"))
        await conn.execute(text("ALTER TABLE orgs ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(200)"))
        await conn.execute(text("ALTER TABLE orgs ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(200)"))
        await conn.execute(text("ALTER TABLE orgs ADD COLUMN IF NOT EXISTS city VARCHAR(120)"))
        await conn.execute(text("ALTER TABLE orgs ADD COLUMN IF NOT EXISTS state VARCHAR(40)"))
        await conn.execute(text("ALTER TABLE orgs ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20)"))
        await conn.execute(text("ALTER TABLE orgs ADD COLUMN IF NOT EXISTS country VARCHAR(2) DEFAULT 'US'"))
        await conn.execute(text("ALTER TABLE orgs ADD COLUMN IF NOT EXISTS phone VARCHAR(40)"))
        await conn.execute(text("ALTER TABLE orgs ADD COLUMN IF NOT EXISTS contact_email VARCHAR(200)"))
        await conn.execute(text("ALTER TABLE orgs ADD COLUMN IF NOT EXISTS mfa_override BOOLEAN"))
        await conn.execute(text("ALTER TABLE orgs ADD COLUMN IF NOT EXISTS passwordless_override BOOLEAN"))
        await conn.execute(text("ALTER TABLE orgs ADD COLUMN IF NOT EXISTS auth0_org_id VARCHAR(64) UNIQUE"))
        await conn.execute(text("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES orgs(id)"))

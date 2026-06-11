"""TCS platform and per-organization security settings (MFA, passwordless)."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.shared.models import AuditLog, Org, TcsPlatformSettings


async def get_or_create_settings(db: AsyncSession) -> TcsPlatformSettings:
    row = (await db.execute(select(TcsPlatformSettings).where(TcsPlatformSettings.id == 1))).scalars().first()
    if row:
        return row
    row = TcsPlatformSettings(id=1, mfa_enabled=False, passwordless_enabled=True)
    db.add(row)
    await db.flush()
    return row


def effective_mfa(platform: TcsPlatformSettings, org: Org | None) -> bool:
    if org and org.mfa_override is not None:
        return org.mfa_override
    return platform.mfa_enabled


def effective_passwordless(platform: TcsPlatformSettings, org: Org | None) -> bool:
    if org and org.passwordless_override is not None:
        return org.passwordless_override
    return platform.passwordless_enabled


async def org_security_payload(db: AsyncSession, org: Org) -> dict:
    plat = await get_or_create_settings(db)
    return {
        "mfa_enabled": effective_mfa(plat, org),
        "passwordless_enabled": effective_passwordless(plat, org),
        "mfa_override": org.mfa_override,
        "passwordless_override": org.passwordless_override,
        "platform_mfa_enabled": plat.mfa_enabled,
        "platform_passwordless_enabled": plat.passwordless_enabled,
        "uses_platform_defaults": org.mfa_override is None and org.passwordless_override is None,
    }


async def passwordless_active(db: AsyncSession, org_id: int | None = None) -> bool:
    if settings.passwordless_mode.lower() != "auth0":
        return False
    if not settings.passwordless_enabled:
        return False
    plat = await get_or_create_settings(db)
    org = await db.get(Org, org_id) if org_id else None
    return effective_passwordless(plat, org)


async def mfa_active(db: AsyncSession, org_id: int | None = None) -> bool:
    plat = await get_or_create_settings(db)
    org = await db.get(Org, org_id) if org_id else None
    return effective_mfa(plat, org)


async def log_tcs_event(
    db: AsyncSession,
    *,
    actor: str,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    details: str | None = None,
    org_id: int | None = None,
) -> None:
    db.add(
        AuditLog(
            org_id=org_id,
            actor=actor,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
        )
    )

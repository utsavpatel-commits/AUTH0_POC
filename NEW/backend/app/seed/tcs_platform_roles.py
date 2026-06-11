"""Seed platform role definitions (idempotent)."""
from sqlalchemy import select

from app.core.db import SessionLocal
from app.services.tcs_permissions import (
    DEFAULT_ROLE_PERMISSIONS,
    _dump_permissions,
    _is_legacy_permissions,
    _parse_permissions,
)
from app.shared.models import RoleDefinition


async def ensure_platform_roles() -> None:
    async with SessionLocal() as db:
        for slug, perms in DEFAULT_ROLE_PERMISSIONS.items():
            row = (
                await db.execute(
                    select(RoleDefinition).where(RoleDefinition.scope == "platform", RoleDefinition.slug == slug)
                )
            ).scalars().first()
            if not row:
                db.add(
                    RoleDefinition(
                        scope="platform",
                        org_id=None,
                        slug=slug,
                        name=slug.replace("_", " ").title(),
                        description=f"Platform {slug.replace('_', ' ')} role",
                        permissions=_dump_permissions(perms),
                        is_system=True,
                    )
                )
                continue
            stored = _parse_permissions(row.permissions)
            if row.is_system and _is_legacy_permissions(stored):
                row.permissions = _dump_permissions(perms)
                row.name = slug.replace("_", " ").title()
        await db.commit()

"""Org-scoped role permissions and effective user access."""
from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CUSTOMER_ROLES, TCS_ROLES
from app.shared.models import OrgRolePermission, RoleDefinition, User

ACCESS_LEVELS = [
    {"id": "limited", "label": "Limited"},
    {"id": "view", "label": "View / Consume"},
    {"id": "use", "label": "Use"},
    {"id": "admin", "label": "Admin"},
]

PERMISSION_MODULES = [
    {"id": "tcs_base", "label": "TCS Base", "group": "tcs"},
    {"id": "lms", "label": "LMS", "group": "customer"},
    {"id": "poc", "label": "POC", "group": "customer"},
    {"id": "survey", "label": "Mock Survey", "group": "customer"},
    {"id": "cafe", "label": "Document Café", "group": "customer"},
    {"id": "ai_search", "label": "AI Search / Chat", "group": "customer"},
    {"id": "compliance_dashboard", "label": "Compliance Dashboard", "group": "customer"},
    {"id": "customer_admin_portal", "label": "Customer Admin Portal", "group": "customer"},
    {"id": "marketing_site", "label": "Marketing Site", "group": "customer"},
    {"id": "executive_command", "label": "Executive Command Center", "group": "tcs"},
    {"id": "cms_library", "label": "CMS / Library / Content Dev", "group": "tcs"},
    {"id": "reporting", "label": "Company & User Reporting", "group": "shared"},
]

MODULE_IDS = {m["id"] for m in PERMISSION_MODULES}
LEVEL_IDS = {level["id"] for level in ACCESS_LEVELS}

# Legacy on/off area ids → module + default level when reading old data.
_LEGACY_AREA_MAP: dict[str, tuple[str, str]] = {
    "lms": ("lms", "use"),
    "cafe": ("cafe", "use"),
    "survey": ("survey", "use"),
    "dashboard": ("compliance_dashboard", "use"),
    "users": ("customer_admin_portal", "admin"),
    "settings": ("customer_admin_portal", "admin"),
}

# Backward-compatible export for older API clients.
PERMISSION_AREAS = [{"id": m["id"], "label": m["label"], "group": m["group"]} for m in PERMISSION_MODULES]


def _p(module: str, level: str) -> str:
    return f"{module}:{level}"


def _customer_admin_modules() -> list[str]:
    return [
        _p("lms", "admin"),
        _p("poc", "admin"),
        _p("survey", "admin"),
        _p("cafe", "admin"),
        _p("ai_search", "admin"),
        _p("compliance_dashboard", "admin"),
        _p("customer_admin_portal", "admin"),
    ]


DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {
    "administrator": _customer_admin_modules(),
    "don": _customer_admin_modules(),
    "corporate_leader": _customer_admin_modules() + [_p("reporting", "admin")],
    "staff_educator": [
        _p("lms", "admin"),
        _p("cafe", "use"),
        _p("survey", "use"),
        _p("ai_search", "use"),
        _p("compliance_dashboard", "view"),
    ],
    "customer_admin": [
        _p("customer_admin_portal", "admin"),
        _p("lms", "view"),
        _p("cafe", "use"),
        _p("survey", "use"),
        _p("ai_search", "use"),
        _p("compliance_dashboard", "view"),
    ],
    "end_user": [
        _p("lms", "view"),
        _p("survey", "limited"),
        _p("ai_search", "view"),
    ],
    "partner": [
        _p("cafe", "use"),
        _p("ai_search", "view"),
        _p("compliance_dashboard", "view"),
    ],
    "tcs_admin": [_p(module, "admin") for module in MODULE_IDS],
    "tcs_sales_cs": _customer_admin_modules()
    + [
        _p("tcs_base", "use"),
        _p("executive_command", "view"),
        _p("cms_library", "view"),
        _p("reporting", "admin"),
        _p("marketing_site", "view"),
    ],
    "tcs_rd": [
        _p("cms_library", "admin"),
        _p("tcs_base", "use"),
        _p("reporting", "view"),
        _p("lms", "view"),
        _p("poc", "view"),
        _p("survey", "view"),
        _p("cafe", "view"),
        _p("ai_search", "view"),
        _p("compliance_dashboard", "view"),
    ],
}

ORG_ROLES = sorted(CUSTOMER_ROLES)
ALL_PLATFORM_ROLE_SLUGS = sorted(CUSTOMER_ROLES | TCS_ROLES)


def permission_schema() -> dict:
    return {
        "modules": PERMISSION_MODULES,
        "access_levels": ACCESS_LEVELS,
        "permission_areas": PERMISSION_AREAS,
    }


def _parse_permissions(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    try:
        data = json.loads(raw)
        return [str(p) for p in data] if isinstance(data, list) else None
    except json.JSONDecodeError:
        return None


def _is_legacy_permissions(perms: list[str] | None) -> bool:
    if not perms:
        return True
    return any(":" not in p for p in perms)


def normalize_permissions(perms: list[str]) -> list[str]:
    """Convert legacy area ids and dedupe module levels (highest wins)."""
    level_rank = {"limited": 1, "view": 2, "use": 3, "admin": 4}
    resolved: dict[str, str] = {}

    for raw in perms:
        if ":" in raw:
            module, level = raw.split(":", 1)
            if module in MODULE_IDS and level in LEVEL_IDS:
                prev = resolved.get(module)
                if not prev or level_rank[level] > level_rank[prev]:
                    resolved[module] = level
            continue
        if raw in _LEGACY_AREA_MAP:
            module, level = _LEGACY_AREA_MAP[raw]
            prev = resolved.get(module)
            if not prev or level_rank[level] > level_rank.get(prev, 0):
                resolved[module] = level

    return sorted(f"{module}:{level}" for module, level in resolved.items())


def is_valid_permission(perm: str) -> bool:
    if ":" in perm:
        module, level = perm.split(":", 1)
        return module in MODULE_IDS and level in LEVEL_IDS
    return perm in _LEGACY_AREA_MAP


def filter_valid_permissions(perms: list[str]) -> list[str]:
    return normalize_permissions([p for p in perms if is_valid_permission(p)])


def _dump_permissions(perms: list[str]) -> str:
    return json.dumps(filter_valid_permissions(perms))


def role_definition_payload(r: RoleDefinition) -> dict:
    perms = normalize_permissions(_parse_permissions(r.permissions) or [])
    return {
        "id": r.id,
        "slug": r.slug,
        "name": r.name,
        "description": r.description,
        "permissions": perms,
        "is_system": r.is_system,
        "scope": r.scope,
        "org_id": r.org_id,
    }


async def role_permissions_for_org(db: AsyncSession, org_id: int, role: str) -> list[str]:
    row = (
        await db.execute(
            select(OrgRolePermission).where(OrgRolePermission.org_id == org_id, OrgRolePermission.role == role)
        )
    ).scalars().first()
    if row:
        parsed = _parse_permissions(row.permissions)
        if parsed is not None:
            return normalize_permissions(parsed)
    org_role = (
        await db.execute(
            select(RoleDefinition).where(
                RoleDefinition.scope == "organization",
                RoleDefinition.org_id == org_id,
                RoleDefinition.slug == role,
            )
        )
    ).scalars().first()
    if org_role:
        parsed = _parse_permissions(org_role.permissions)
        if parsed is not None:
            return normalize_permissions(parsed)
    platform_role = (
        await db.execute(
            select(RoleDefinition).where(RoleDefinition.scope == "platform", RoleDefinition.slug == role)
        )
    ).scalars().first()
    if platform_role:
        parsed = _parse_permissions(platform_role.permissions)
        if parsed is not None:
            return normalize_permissions(parsed)
    return normalize_permissions(list(DEFAULT_ROLE_PERMISSIONS.get(role, [_p("lms", "view")])))


async def effective_user_permissions(db: AsyncSession, user: User) -> list[str]:
    custom = _parse_permissions(user.custom_permissions)
    if custom is not None:
        return normalize_permissions(custom)
    if user.org_id:
        return await role_permissions_for_org(db, user.org_id, user.role)
    return normalize_permissions(list(DEFAULT_ROLE_PERMISSIONS.get(user.role, [_p("lms", "view")])))


async def user_payload(db: AsyncSession, user: User) -> dict:
    role_perms = (
        await role_permissions_for_org(db, user.org_id, user.role)
        if user.org_id
        else normalize_permissions(list(DEFAULT_ROLE_PERMISSIONS.get(user.role, [_p("lms", "view")])))
    )
    effective = await effective_user_permissions(db, user)
    custom = _parse_permissions(user.custom_permissions)
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "profile": user.profile,
        "job_title": user.job_title,
        "org_id": user.org_id,
        "facility_id": user.facility_id,
        "permissions": effective,
        "role_permissions": role_perms,
        "custom_permissions": normalize_permissions(custom) if custom is not None else None,
        "has_custom_permissions": custom is not None,
        "demo_password": user.demo_password,
        "password_set": user.password_set,
        "invite_pending": user.role != "end_user" and not user.password_set and not user.demo_password,
        "website_access": "enabled" if user.is_active else "disabled",
        "is_active": user.is_active,
    }

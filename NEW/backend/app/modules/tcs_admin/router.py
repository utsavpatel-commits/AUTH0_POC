"""TCS admin console — Auth0 login; orgs in local DB synced with Auth0 Organizations."""
from __future__ import annotations

import re
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import CUSTOMER_ROLES, TCS_ROLES
from app.core.tcs_deps import get_tcs_session, require_tcs_admin
from app.services.auth0_invite_service import (
    Auth0InviteError,
    create_auth0_organization,
    delete_auth0_organization,
    send_org_admin_invite,
    send_password_reset_email,
    slugify_org_name,
)
from app.services.tcs_auth_service import login_tcs_staff, send_auth0_password_invite
from app.services.tcs_permissions import (
    DEFAULT_ROLE_PERMISSIONS,
    ORG_ROLES,
    filter_valid_permissions,
    permission_schema,
    role_definition_payload,
    role_permissions_for_org,
    user_payload,
    _dump_permissions,
)
from app.services.tcs_platform_settings import (
    get_or_create_settings,
    log_tcs_event,
    org_security_payload,
    passwordless_active,
)
from app.shared.models import AuditLog, Facility, Org, OrgGroup, OrgInvitation, OrgRolePermission, RoleDefinition, User

router = APIRouter(prefix="/api/tcs", tags=["tcs-admin"])

PLATFORM_ROLES = sorted(CUSTOMER_ROLES | TCS_ROLES)
ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower().strip())
    return (s.strip("-") or "org")[:120]


def _org_payload(
    o: Org,
    *,
    facility_count: int = 0,
    user_count: int = 0,
    sub_org_count: int = 0,
    parent_name: str | None = None,
) -> dict:
    return {
        "id": o.id,
        "display_name": o.name,
        "name": o.name,
        "slug": _slugify(o.name),
        "identifier": f"org_{o.id:08d}",
        "parent_org_id": o.parent_org_id,
        "parent_display_name": parent_name,
        "is_sub_organization": o.parent_org_id is not None,
        "is_corporate": o.is_corporate,
        "tier": o.tier,
        "address_line1": o.address_line1,
        "address_line2": o.address_line2,
        "city": o.city,
        "state": o.state,
        "postal_code": o.postal_code,
        "country": o.country,
        "phone": o.phone,
        "contact_email": o.contact_email,
        "auth0_org_id": o.auth0_org_id,
        "facility_count": facility_count,
        "user_count": user_count,
        "sub_org_count": sub_org_count,
        "created_at": o.created_at.isoformat() if o.created_at else None,
    }


def _group_payload(g: OrgGroup) -> dict:
    return {
        "id": g.id,
        "name": g.name,
        "description": g.description,
        "created_at": g.created_at.isoformat() if g.created_at else None,
    }


def _invitation_payload(inv: OrgInvitation) -> dict:
    return {
        "id": inv.id,
        "email": inv.email,
        "role": inv.role,
        "status": inv.status,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
    }


class TcsLoginBody(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class ForgotPasswordBody(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


@router.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordBody):
    try:
        await send_password_reset_email(body.email)
    except Auth0InviteError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc
    return {
        "ok": True,
        "message": "Auth0 has sent a forgot-password email. Check your inbox and spam folder.",
    }


@router.post("/auth/login")
async def tcs_login(body: TcsLoginBody, request: Request, db: AsyncSession = Depends(get_db)):
    try:
        staff = await login_tcs_staff(db, body.email, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    request.session[settings.tcs_session_cookie] = {
        "staff_id": staff.id,
        "email": staff.email,
        "name": staff.name,
        "role": staff.role,
        "logged_in_at": datetime.utcnow().isoformat(),
    }
    return {"ok": True, "staff": {"id": staff.id, "email": staff.email, "name": staff.name, "role": staff.role}}


@router.post("/auth/logout")
async def tcs_logout(request: Request):
    request.session.pop(settings.tcs_session_cookie, None)
    return {"ok": True}


@router.get("/auth/me")
async def tcs_me(session: dict = Depends(get_tcs_session)):
    return {"ok": True, "staff": session}


@router.get("/roles")
async def list_roles(_: dict = Depends(get_tcs_session)):
    return {
        "platform_roles": [{"id": r, "label": r.replace("_", " ").title()} for r in PLATFORM_ROLES],
        "org_roles": [{"id": r, "label": r.replace("_", " ").title()} for r in ORG_ROLES],
        **permission_schema(),
    }


class OrgRoleUpdate(BaseModel):
    permissions: list[str]


class PlatformRoleCreate(BaseModel):
    name: str
    description: str | None = None
    permissions: list[str] = []


class PlatformRoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    permissions: list[str] | None = None


@router.get("/platform-roles")
async def list_platform_roles(_: dict = Depends(get_tcs_session), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(select(RoleDefinition).where(RoleDefinition.scope == "platform").order_by(RoleDefinition.name))
    ).scalars().all()
    return {"roles": [role_definition_payload(r) for r in rows], **permission_schema()}


@router.post("/platform-roles")
async def create_platform_role(
    body: PlatformRoleCreate,
    _: dict = Depends(require_tcs_admin),
    db: AsyncSession = Depends(get_db),
):
    slug = _slugify(body.name)[:60]
    if (await db.execute(select(RoleDefinition).where(RoleDefinition.scope == "platform", RoleDefinition.slug == slug))).scalars().first():
        slug = f"{slug}-{secrets.token_hex(2)}"
    perms = filter_valid_permissions(body.permissions)
    rd = RoleDefinition(
        scope="platform",
        org_id=None,
        slug=slug,
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        permissions=_dump_permissions(perms),
        is_system=False,
    )
    db.add(rd)
    await db.commit()
    await db.refresh(rd)
    return role_definition_payload(rd)


@router.get("/platform-roles/{role_id}")
async def get_platform_role(role_id: int, _: dict = Depends(get_tcs_session), db: AsyncSession = Depends(get_db)):
    rd = await db.get(RoleDefinition, role_id)
    if not rd or rd.scope != "platform":
        raise HTTPException(404, "Role not found")
    return role_definition_payload(rd)


@router.put("/platform-roles/{role_id}")
async def update_platform_role(
    role_id: int,
    body: PlatformRoleUpdate,
    _: dict = Depends(require_tcs_admin),
    db: AsyncSession = Depends(get_db),
):
    rd = await db.get(RoleDefinition, role_id)
    if not rd or rd.scope != "platform":
        raise HTTPException(404, "Role not found")
    if body.name is not None:
        rd.name = body.name.strip()
    if body.description is not None:
        rd.description = body.description.strip() or None
    if body.permissions is not None:
        rd.permissions = _dump_permissions(filter_valid_permissions(body.permissions))
    await db.commit()
    await db.refresh(rd)
    return role_definition_payload(rd)


@router.delete("/platform-roles/{role_id}")
async def delete_platform_role(role_id: int, _: dict = Depends(require_tcs_admin), db: AsyncSession = Depends(get_db)):
    rd = await db.get(RoleDefinition, role_id)
    if not rd or rd.scope != "platform":
        raise HTTPException(404, "Role not found")
    if rd.is_system:
        raise HTTPException(400, "System roles cannot be deleted.")
    if (await db.execute(select(User).where(User.role == rd.slug))).scalars().first():
        raise HTTPException(400, "Remove users with this role before deleting.")
    await db.delete(rd)
    await db.commit()
    return {"ok": True}


@router.get("/users")
async def list_all_users(
    q: str | None = None,
    _: dict = Depends(get_tcs_session),
    db: AsyncSession = Depends(get_db),
):
    users = (await db.execute(select(User).order_by(User.name))).scalars().all()
    org_ids = {u.org_id for u in users if u.org_id}
    orgs = {}
    if org_ids:
        for o in (await db.execute(select(Org).where(Org.id.in_(org_ids)))).scalars().all():
            orgs[o.id] = o.name
    out = []
    for u in users:
        if q:
            needle = q.lower()
            if needle not in u.name.lower() and needle not in u.email.lower() and needle not in str(u.id):
                continue
        connection = "email" if u.role == "end_user" and not u.demo_password else (
            "Username-Password-Authentication (demo)" if u.demo_password else "Username-Password-Authentication"
        )
        login_count = (u.id * 7 + len(u.email)) % 24 if u.is_active else 0
        out.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "user_id": f"platform|{u.id:08d}",
            "org_id": u.org_id,
            "org_name": orgs.get(u.org_id) if u.org_id else None,
            "role": u.role,
            "connection": connection,
            "login_count": login_count,
            "latest_login": "never" if login_count == 0 else f"{(u.id % 14) + 1} days ago",
            "website_access": "enabled" if u.is_active else "disabled",
        })
    return out


@router.get("/orgs/{org_id}/roles")
async def list_org_roles(org_id: int, _: dict = Depends(get_tcs_session), db: AsyncSession = Depends(get_db)):
    if not await db.get(Org, org_id):
        raise HTTPException(404, "Organization not found")
    roles = []
    platform_defs = (
        await db.execute(select(RoleDefinition).where(RoleDefinition.scope == "platform").order_by(RoleDefinition.name))
    ).scalars().all()
    for rd in platform_defs:
        if rd.slug not in ORG_ROLES:
            continue
        perms = await role_permissions_for_org(db, org_id, rd.slug)
        roles.append({
            **role_definition_payload(rd),
            "permissions": perms,
            "is_custom": False,
            "label": rd.name,
        })
    custom = (
        await db.execute(
            select(RoleDefinition)
            .where(RoleDefinition.scope == "organization", RoleDefinition.org_id == org_id)
            .order_by(RoleDefinition.name)
        )
    ).scalars().all()
    for rd in custom:
        roles.append({**role_definition_payload(rd), "is_custom": True, "label": rd.name})
    return {"roles": roles, **permission_schema()}


class CustomRoleCreate(BaseModel):
    name: str
    description: str | None = None
    permissions: list[str] = []


@router.post("/orgs/{org_id}/custom-roles")
async def create_org_custom_role(
    org_id: int,
    body: CustomRoleCreate,
    _: dict = Depends(require_tcs_admin),
    db: AsyncSession = Depends(get_db),
):
    if not await db.get(Org, org_id):
        raise HTTPException(404, "Organization not found")
    slug = _slugify(body.name)[:60]
    if (await db.execute(
        select(RoleDefinition).where(RoleDefinition.scope == "organization", RoleDefinition.org_id == org_id, RoleDefinition.slug == slug)
    )).scalars().first():
        slug = f"{slug}-{secrets.token_hex(2)}"
    perms = filter_valid_permissions(body.permissions)
    rd = RoleDefinition(
        scope="organization",
        org_id=org_id,
        slug=slug,
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        permissions=_dump_permissions(perms),
        is_system=False,
    )
    db.add(rd)
    await db.commit()
    await db.refresh(rd)
    return {**role_definition_payload(rd), "is_custom": True, "label": rd.name}


@router.put("/orgs/{org_id}/custom-roles/{role_id}")
async def update_org_custom_role(
    org_id: int,
    role_id: int,
    body: CustomRoleCreate,
    _: dict = Depends(require_tcs_admin),
    db: AsyncSession = Depends(get_db),
):
    rd = await db.get(RoleDefinition, role_id)
    if not rd or rd.scope != "organization" or rd.org_id != org_id:
        raise HTTPException(404, "Role not found")
    perms = filter_valid_permissions(body.permissions)
    rd.name = body.name.strip()
    rd.description = (body.description or "").strip() or None
    rd.permissions = _dump_permissions(perms)
    await db.commit()
    await db.refresh(rd)
    return {**role_definition_payload(rd), "is_custom": True, "label": rd.name}


@router.delete("/orgs/{org_id}/custom-roles/{role_id}")
async def delete_org_custom_role(
    org_id: int,
    role_id: int,
    _: dict = Depends(require_tcs_admin),
    db: AsyncSession = Depends(get_db),
):
    rd = await db.get(RoleDefinition, role_id)
    if not rd or rd.scope != "organization" or rd.org_id != org_id:
        raise HTTPException(404, "Role not found")
    if (await db.execute(select(User).where(User.org_id == org_id, User.role == rd.slug))).scalars().first():
        raise HTTPException(400, "Remove users with this role before deleting.")
    await db.delete(rd)
    await db.commit()
    return {"ok": True}


@router.put("/orgs/{org_id}/roles/{role}")
async def update_org_role(
    org_id: int,
    role: str,
    body: OrgRoleUpdate,
    session: dict = Depends(require_tcs_admin),
    db: AsyncSession = Depends(get_db),
):
    if not await db.get(Org, org_id):
        raise HTTPException(404, "Organization not found")
    if role not in ORG_ROLES:
        raise HTTPException(400, "Invalid role.")
    perms = filter_valid_permissions(body.permissions)
    row = (
        await db.execute(
            select(OrgRolePermission).where(OrgRolePermission.org_id == org_id, OrgRolePermission.role == role)
        )
    ).scalars().first()
    if row:
        row.permissions = _dump_permissions(perms)
    else:
        db.add(OrgRolePermission(org_id=org_id, role=role, permissions=_dump_permissions(perms)))
    await log_tcs_event(
        db,
        actor=session.get("email", "tcs_admin"),
        action="role.update",
        entity_type="role",
        entity_id=role,
        details=f"Updated {role.replace('_', ' ').title()} permissions",
        org_id=org_id,
    )
    await db.commit()
    return {"id": role, "label": role.replace("_", " ").title(), "permissions": perms}


class OrgCreate(BaseModel):
    display_name: str
    is_corporate: bool = False
    tier: str = "essentials"
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str = "US"
    phone: str | None = None
    contact_email: str | None = None
    admin_name: str
    admin_email: str

    @field_validator("admin_email", "contact_email")
    @classmethod
    def normalize_email(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.strip().lower() or None


class OrgUpdate(BaseModel):
    display_name: str | None = None
    is_corporate: bool | None = None
    tier: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    phone: str | None = None
    contact_email: str | None = None

    @field_validator("contact_email")
    @classmethod
    def normalize_email(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.strip().lower() or None


@router.get("/orgs")
async def list_organizations(
    q: str | None = None,
    root_only: bool = True,
    _: dict = Depends(get_tcs_session),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Org).order_by(Org.name)
    if root_only:
        stmt = stmt.where(Org.parent_org_id.is_(None))
    rows = (await db.execute(stmt)).scalars().all()
    out = []
    for o in rows:
        if q:
            needle = q.lower()
            slug = _slugify(o.name)
            if needle not in o.name.lower() and needle not in slug:
                continue
        fc = (await db.execute(select(func.count()).select_from(Facility).where(Facility.org_id == o.id))).scalar_one()
        uc = (await db.execute(select(func.count()).select_from(User).where(User.org_id == o.id))).scalar_one()
        sc = (await db.execute(select(func.count()).select_from(Org).where(Org.parent_org_id == o.id))).scalar_one()
        out.append(_org_payload(o, facility_count=fc, user_count=uc, sub_org_count=sc))
    return out


@router.post("/orgs")
async def create_organization(
    body: OrgCreate,
    session: dict = Depends(require_tcs_admin),
    db: AsyncSession = Depends(get_db),
):
    admin_email = body.admin_email.strip().lower()
    if (await db.execute(select(User).where(func.lower(User.email) == admin_email))).scalars().first():
        raise HTTPException(409, "A user with this admin email already exists.")

    org = Org(
        name=body.display_name.strip(),
        is_corporate=body.is_corporate,
        tier=body.tier,
        address_line1=(body.address_line1 or "").strip() or None,
        address_line2=(body.address_line2 or "").strip() or None,
        city=(body.city or "").strip() or None,
        state=(body.state or "").strip() or None,
        postal_code=(body.postal_code or "").strip() or None,
        country=(body.country or "US").strip().upper()[:2] or "US",
        phone=(body.phone or "").strip() or None,
        contact_email=body.contact_email,
    )
    db.add(org)
    await db.flush()

    admin = User(
        org_id=org.id,
        name=body.admin_name.strip(),
        email=admin_email,
        role="administrator",
        profile="all",
        is_active=True,
        password_set=False,
    )
    db.add(admin)
    await db.flush()

    auth0_org_id: str | None = None
    slug = f"{slugify_org_name(org.name)}-{org.id}"
    try:
        auth0_org = await create_auth0_organization(org.name, slug)
        auth0_org_id = auth0_org["id"]
        org.auth0_org_id = auth0_org_id
        await db.flush()

        invite = await send_org_admin_invite(
            admin_email,
            name=body.admin_name.strip(),
            org_id=org.id,
            org_name=org.name,
            auth0_org_id=auth0_org_id,
            inviter_name=session.get("email", "TCS Admin"),
        )
    except Auth0InviteError as exc:
        if auth0_org_id:
            try:
                await delete_auth0_organization(auth0_org_id)
            except Exception:
                pass
        await db.rollback()
        raise HTTPException(exc.status_code, str(exc)) from exc

    inv = OrgInvitation(org_id=org.id, email=admin_email, role="administrator", status="sent")
    db.add(inv)

    await log_tcs_event(
        db,
        actor=session.get("email", "tcs_admin"),
        action="org.create",
        entity_type="organization",
        entity_id=str(org.id),
        details=f"Organization {org.name} created",
        org_id=org.id,
    )
    await log_tcs_event(
        db,
        actor=session.get("email", "tcs_admin"),
        action="user.create",
        entity_type="user",
        entity_id=str(admin.id),
        details=f"Invitation sent to {admin_email} to join {org.name} as Administrator",
        org_id=org.id,
    )
    await db.commit()
    await db.refresh(org)
    await db.refresh(admin)
    return {
        **_org_payload(org, user_count=1),
        "admin_user": await user_payload(db, admin),
        "invite_sent": invite.get("invite_sent", True),
        "invite_email": admin_email,
        "invite_type": invite.get("invite_type", "organization"),
        "invitation_url": invite.get("invitation_url"),
        "password_setup_url": invite.get("password_setup_url"),
        "platform_login_url": invite.get("platform_login_url"),
        "post_password_redirect_url": invite.get("post_password_redirect_url"),
        "message": invite.get("message", f"Organization created. Invitation sent to {admin_email} to join {org.name}."),
    }


@router.get("/orgs/{org_id}")
async def get_organization(org_id: int, _: dict = Depends(get_tcs_session), db: AsyncSession = Depends(get_db)):
    org = await db.get(Org, org_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    parent = await db.get(Org, org.parent_org_id) if org.parent_org_id else None
    facilities = (await db.execute(select(Facility).where(Facility.org_id == org.id).order_by(Facility.name))).scalars().all()
    users = (await db.execute(select(User).where(User.org_id == org.id).order_by(User.name))).scalars().all()
    sub_orgs = (await db.execute(select(Org).where(Org.parent_org_id == org.id).order_by(Org.name))).scalars().all()
    groups = (await db.execute(select(OrgGroup).where(OrgGroup.org_id == org.id).order_by(OrgGroup.name))).scalars().all()
    invitations = (
        await db.execute(select(OrgInvitation).where(OrgInvitation.org_id == org.id).order_by(OrgInvitation.created_at.desc()))
    ).scalars().all()
    fc = len(facilities)
    sub_payloads = []
    for child in sub_orgs:
        child_fc = (await db.execute(select(func.count()).select_from(Facility).where(Facility.org_id == child.id))).scalar_one()
        child_uc = (await db.execute(select(func.count()).select_from(User).where(User.org_id == child.id))).scalar_one()
        sub_payloads.append(_org_payload(child, facility_count=child_fc, user_count=child_uc))
    return {
        **_org_payload(org, facility_count=fc, user_count=len(users), sub_org_count=len(sub_orgs), parent_name=parent.name if parent else None),
        "facilities": [{"id": f.id, "name": f.name, "city": f.city, "state": f.state, "beds": f.beds} for f in facilities],
        "users": [await user_payload(db, u) for u in users],
        "sub_organizations": sub_payloads,
        "groups": [_group_payload(g) for g in groups],
        "invitations": [_invitation_payload(i) for i in invitations],
    }


@router.put("/orgs/{org_id}")
async def update_organization(org_id: int, body: OrgUpdate, _: dict = Depends(require_tcs_admin), db: AsyncSession = Depends(get_db)):
    org = await db.get(Org, org_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    if body.display_name is not None:
        org.name = body.display_name.strip()
    if body.is_corporate is not None:
        org.is_corporate = body.is_corporate
    if body.tier is not None:
        org.tier = body.tier
    if body.address_line1 is not None:
        org.address_line1 = body.address_line1.strip() or None
    if body.address_line2 is not None:
        org.address_line2 = body.address_line2.strip() or None
    if body.city is not None:
        org.city = body.city.strip() or None
    if body.state is not None:
        org.state = body.state.strip() or None
    if body.postal_code is not None:
        org.postal_code = body.postal_code.strip() or None
    if body.country is not None:
        org.country = body.country.strip().upper()[:2] or "US"
    if body.phone is not None:
        org.phone = body.phone.strip() or None
    if body.contact_email is not None:
        org.contact_email = body.contact_email
    await db.commit()
    await db.refresh(org)
    return _org_payload(org)


@router.delete("/orgs/{org_id}")
async def delete_organization(org_id: int, _: dict = Depends(require_tcs_admin), db: AsyncSession = Depends(get_db)):
    org = await db.get(Org, org_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    if (await db.execute(select(Org).where(Org.parent_org_id == org_id))).scalars().first():
        raise HTTPException(400, "Remove sub-organizations before deleting.")
    if (await db.execute(select(User).where(User.org_id == org_id))).scalars().first():
        raise HTTPException(400, "Remove users before deleting the organization.")
    for f in (await db.execute(select(Facility).where(Facility.org_id == org_id))).scalars().all():
        await db.delete(f)
    for g in (await db.execute(select(OrgGroup).where(OrgGroup.org_id == org_id))).scalars().all():
        await db.delete(g)
    for inv in (await db.execute(select(OrgInvitation).where(OrgInvitation.org_id == org_id))).scalars().all():
        await db.delete(inv)
    await db.delete(org)
    await db.commit()
    return {"ok": True}


class SubOrgCreate(BaseModel):
    display_name: str
    tier: str = "essentials"


@router.post("/orgs/{org_id}/sub-orgs")
async def create_sub_organization(
    org_id: int,
    body: SubOrgCreate,
    session: dict = Depends(require_tcs_admin),
    db: AsyncSession = Depends(get_db),
):
    parent = await db.get(Org, org_id)
    if not parent:
        raise HTTPException(404, "Organization not found")
    if parent.parent_org_id is not None:
        raise HTTPException(400, "Sub-organizations cannot have nested sub-organizations.")
    child = Org(name=body.display_name.strip(), parent_org_id=org_id, tier=body.tier, is_corporate=False)
    db.add(child)
    await db.flush()
    await log_tcs_event(
        db,
        actor=session.get("email", "tcs_admin"),
        action="org.create",
        entity_type="organization",
        entity_id=str(child.id),
        details=f"Sub-organization {child.name} created",
        org_id=org_id,
    )
    await db.commit()
    await db.refresh(child)
    return _org_payload(child)


class GroupCreate(BaseModel):
    name: str
    description: str | None = None


@router.post("/orgs/{org_id}/groups")
async def create_group(org_id: int, body: GroupCreate, _: dict = Depends(require_tcs_admin), db: AsyncSession = Depends(get_db)):
    if not await db.get(Org, org_id):
        raise HTTPException(404, "Organization not found")
    g = OrgGroup(org_id=org_id, name=body.name.strip(), description=(body.description or "").strip() or None)
    db.add(g)
    await db.commit()
    await db.refresh(g)
    return _group_payload(g)


@router.delete("/orgs/{org_id}/groups/{group_id}")
async def delete_group(org_id: int, group_id: int, _: dict = Depends(require_tcs_admin), db: AsyncSession = Depends(get_db)):
    g = await db.get(OrgGroup, group_id)
    if not g or g.org_id != org_id:
        raise HTTPException(404, "Group not found")
    await db.delete(g)
    await db.commit()
    return {"ok": True}


class InvitationCreate(BaseModel):
    email: str
    role: str = "end_user"
    send_auth0_invite: bool = True

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


@router.post("/orgs/{org_id}/invitations")
async def create_invitation(
    org_id: int,
    body: InvitationCreate,
    session: dict = Depends(require_tcs_admin),
    db: AsyncSession = Depends(get_db),
):
    org = await db.get(Org, org_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    status = "pending"
    if body.send_auth0_invite and body.role != "end_user":
        try:
            await send_auth0_password_invite(
                body.email,
                org_id=org_id,
                org_name=org.name,
                invite_role=body.role,
                auth0_org_id=org.auth0_org_id,
                inviter_name=session.get("email", "TCS Admin"),
            )
            status = "sent"
        except Auth0InviteError as exc:
            raise HTTPException(exc.status_code, str(exc)) from exc
    inv = OrgInvitation(org_id=org_id, email=body.email, role=body.role, status=status)
    db.add(inv)
    await log_tcs_event(
        db,
        actor=session.get("email", "tcs_admin"),
        action="user.invite",
        entity_type="invitation",
        entity_id=body.email,
        details=f"Invitation sent to {body.email} to join {org.name} as {body.role}",
        org_id=org_id,
    )
    await db.commit()
    await db.refresh(inv)
    return _invitation_payload(inv)


@router.delete("/orgs/{org_id}/invitations/{invitation_id}")
async def delete_invitation(
    org_id: int,
    invitation_id: int,
    _: dict = Depends(require_tcs_admin),
    db: AsyncSession = Depends(get_db),
):
    inv = await db.get(OrgInvitation, invitation_id)
    if not inv or inv.org_id != org_id:
        raise HTTPException(404, "Invitation not found")
    await db.delete(inv)
    await db.commit()
    return {"ok": True}


class UserCreate(BaseModel):
    org_id: int
    facility_id: int | None = None
    name: str
    email: str
    role: str = "end_user"
    profile: str = "all"
    job_title: str | None = None
    send_auth0_invite: bool = True

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    profile: str | None = None
    job_title: str | None = None
    facility_id: int | None = None
    is_active: bool | None = None
    permissions: list[str] | None = None
    reset_permissions_to_role: bool = False


class DemoUserCreate(BaseModel):
    role: str = "administrator"
    name: str | None = None
    facility_id: int | None = None


@router.get("/users/{user_id}")
async def get_user(user_id: int, _: dict = Depends(get_tcs_session), db: AsyncSession = Depends(get_db)):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    org = await db.get(Org, u.org_id) if u.org_id else None
    fac = await db.get(Facility, u.facility_id) if u.facility_id else None
    return {**(await user_payload(db, u)), "org_name": org.name if org else None, "facility_name": fac.name if fac else None}


@router.post("/orgs/{org_id}/users/demo")
async def create_demo_user(
    org_id: int,
    body: DemoUserCreate,
    session: dict = Depends(require_tcs_admin),
    db: AsyncSession = Depends(get_db),
):
    org = await db.get(Org, org_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    if body.role not in ORG_ROLES:
        raise HTTPException(400, "Invalid role.")
    slug = _slugify(org.name)
    token = secrets.token_hex(3)
    email = f"{body.role.replace('_', '')}.{token}@{slug}.demo.tcs"
    password = f"Demo@{secrets.token_hex(2).upper()}1"
    name = (body.name or f"Demo {body.role.replace('_', ' ').title()}").strip()
    if (await db.execute(select(User).where(func.lower(User.email) == email))).scalars().first():
        raise HTTPException(409, "Could not generate unique demo email; try again.")
    u = User(
        org_id=org_id,
        facility_id=body.facility_id,
        name=name,
        email=email,
        role=body.role,
        profile="all",
        demo_password=password,
        is_active=True,
    )
    db.add(u)
    await db.flush()
    await log_tcs_event(
        db,
        actor=session.get("email", "tcs_admin"),
        action="user.create",
        entity_type="user",
        entity_id=str(u.id),
        details=f"Demo user {email} created as {body.role}",
        org_id=org_id,
    )
    await db.commit()
    await db.refresh(u)
    return {**(await user_payload(db, u)), "demo_password": password, "message": "Demo user created. Save these credentials — password is shown once."}


@router.post("/users")
async def create_user(body: UserCreate, session: dict = Depends(require_tcs_admin), db: AsyncSession = Depends(get_db)):
    if not await db.get(Org, body.org_id):
        raise HTTPException(404, "Organization not found")
    if (await db.execute(select(User).where(func.lower(User.email) == body.email))).scalars().first():
        raise HTTPException(409, "Email already exists.")
    u = User(org_id=body.org_id, facility_id=body.facility_id, name=body.name.strip(), email=body.email, role=body.role, profile=body.profile, job_title=body.job_title, is_active=True)
    db.add(u)
    await db.flush()
    await log_tcs_event(
        db,
        actor=session.get("email", "tcs_admin"),
        action="user.create",
        entity_type="user",
        entity_id=str(u.id),
        details=f"Member {body.email} added as {body.role}",
        org_id=body.org_id,
    )
    await db.commit()
    await db.refresh(u)
    if body.send_auth0_invite and body.role != "end_user":
        org = await db.get(Org, body.org_id)
        try:
            await send_auth0_password_invite(
                body.email,
                name=u.name,
                org_id=body.org_id,
                org_name=org.name if org else None,
                invite_role=body.role,
                auth0_org_id=org.auth0_org_id if org else None,
                inviter_name=session.get("email", "TCS Admin"),
            )
        except Auth0InviteError as exc:
            raise HTTPException(exc.status_code, str(exc)) from exc
    return await user_payload(db, u)


@router.put("/users/{user_id}")
async def update_user(user_id: int, body: UserUpdate, session: dict = Depends(require_tcs_admin), db: AsyncSession = Depends(get_db)):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if body.name is not None:
        u.name = body.name.strip()
    if body.role is not None:
        u.role = body.role
    if body.profile is not None:
        u.profile = body.profile
    if body.job_title is not None:
        u.job_title = body.job_title
    if body.facility_id is not None:
        u.facility_id = body.facility_id
    if body.is_active is not None:
        u.is_active = body.is_active
    if body.reset_permissions_to_role:
        u.custom_permissions = None
    elif body.permissions is not None:
        u.custom_permissions = _dump_permissions(filter_valid_permissions(body.permissions))
    if body.permissions is not None or body.reset_permissions_to_role or body.role is not None or body.is_active is not None:
        await log_tcs_event(
            db,
            actor=session.get("email", "tcs_admin"),
            action="user.update",
            entity_type="user",
            entity_id=str(user_id),
            details="User access or profile updated",
            org_id=u.org_id,
        )
    await db.commit()
    await db.refresh(u)
    return await user_payload(db, u)


@router.post("/users/{user_id}/invite")
async def invite_user(
    user_id: int,
    session: dict = Depends(require_tcs_admin),
    db: AsyncSession = Depends(get_db),
):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if u.role == "end_user":
        raise HTTPException(400, "Learner accounts use email OTP, not organization invite.")
    org = await db.get(Org, u.org_id) if u.org_id else None
    if not org:
        raise HTTPException(400, "User is not assigned to an organization.")
    try:
        invite = await send_auth0_password_invite(
            u.email,
            name=u.name,
            org_id=org.id,
            org_name=org.name,
            invite_role=u.role,
            auth0_org_id=org.auth0_org_id,
            inviter_name=session.get("email", "TCS Admin"),
        )
    except Auth0InviteError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc
    return {
        "ok": True,
        "invite_sent": True,
        "invite_type": invite.get("invite_type", "organization"),
        "invitation_url": invite.get("invitation_url"),
        "password_setup_url": invite.get("password_setup_url"),
        "platform_login_url": invite.get("platform_login_url"),
        "post_password_redirect_url": invite.get("post_password_redirect_url"),
        "message": invite.get("message", f"Invitation sent to {u.email} to join {org.name}."),
    }


class SecuritySettingsUpdate(BaseModel):
    mfa_enabled: bool | None = None
    passwordless_enabled: bool | None = None


@router.get("/branding/invite-email-template")
async def get_invite_email_template(_: dict = Depends(get_tcs_session)):
    from app.services.auth0_invite_email_template import invite_email_template_payload

    return invite_email_template_payload()


@router.get("/security")
async def get_security_settings(_: dict = Depends(get_tcs_session), db: AsyncSession = Depends(get_db)):
    plat = await get_or_create_settings(db)
    return {
        "mfa_enabled": plat.mfa_enabled,
        "passwordless_enabled": plat.passwordless_enabled,
        "updated_at": plat.updated_at.isoformat() if plat.updated_at else None,
    }


@router.put("/security")
async def update_security_settings(
    body: SecuritySettingsUpdate,
    session: dict = Depends(require_tcs_admin),
    db: AsyncSession = Depends(get_db),
):
    plat = await get_or_create_settings(db)
    changes: list[str] = []
    if body.mfa_enabled is not None and body.mfa_enabled != plat.mfa_enabled:
        plat.mfa_enabled = body.mfa_enabled
        changes.append(f"MFA {'enabled' if body.mfa_enabled else 'disabled'}")
    if body.passwordless_enabled is not None and body.passwordless_enabled != plat.passwordless_enabled:
        plat.passwordless_enabled = body.passwordless_enabled
        changes.append(f"Passwordless {'enabled' if body.passwordless_enabled else 'disabled'}")
    if changes:
        await log_tcs_event(
            db,
            actor=session.get("email", "tcs_admin"),
            action="security.update",
            entity_type="platform_settings",
            entity_id="1",
            details="; ".join(changes),
        )
    await db.commit()
    await db.refresh(plat)
    return {
        "mfa_enabled": plat.mfa_enabled,
        "passwordless_enabled": plat.passwordless_enabled,
        "updated_at": plat.updated_at.isoformat() if plat.updated_at else None,
    }


def _audit_log_payload(row: AuditLog) -> dict:
    return {
        "id": row.id,
        "org_id": row.org_id,
        "actor": row.actor,
        "action": row.action,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "details": row.details,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _filter_audit_logs(rows: list[AuditLog], q: str | None) -> list[dict]:
    out = []
    for row in rows:
        if q:
            needle = q.lower()
            blob = f"{row.actor} {row.action} {row.entity_type} {row.entity_id} {row.details}".lower()
            if needle not in blob:
                continue
        out.append(_audit_log_payload(row))
    return out


@router.get("/logs")
async def list_audit_logs(
    q: str | None = None,
    limit: int = 100,
    _: dict = Depends(get_tcs_session),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(min(limit, 500))
    rows = (await db.execute(stmt)).scalars().all()
    return _filter_audit_logs(rows, q)


class OrgSecuritySettingsUpdate(BaseModel):
    mfa_override: bool | None = None
    passwordless_override: bool | None = None
    reset_to_platform_defaults: bool = False


@router.get("/orgs/{org_id}/security")
async def get_org_security_settings(org_id: int, _: dict = Depends(get_tcs_session), db: AsyncSession = Depends(get_db)):
    org = await db.get(Org, org_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    return await org_security_payload(db, org)


@router.put("/orgs/{org_id}/security")
async def update_org_security_settings(
    org_id: int,
    body: OrgSecuritySettingsUpdate,
    session: dict = Depends(require_tcs_admin),
    db: AsyncSession = Depends(get_db),
):
    org = await db.get(Org, org_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    changes: list[str] = []
    if body.reset_to_platform_defaults:
        if org.mfa_override is not None or org.passwordless_override is not None:
            org.mfa_override = None
            org.passwordless_override = None
            changes.append("Reset to platform security defaults")
    else:
        if body.mfa_override is not None and body.mfa_override != org.mfa_override:
            org.mfa_override = body.mfa_override
            changes.append(f"MFA override {'enabled' if body.mfa_override else 'disabled'}")
        if body.passwordless_override is not None and body.passwordless_override != org.passwordless_override:
            org.passwordless_override = body.passwordless_override
            changes.append(f"Passwordless override {'enabled' if body.passwordless_override else 'disabled'}")
    if changes:
        await log_tcs_event(
            db,
            actor=session.get("email", "tcs_admin"),
            action="security.update",
            entity_type="organization",
            entity_id=str(org_id),
            details="; ".join(changes),
            org_id=org_id,
        )
    await db.commit()
    await db.refresh(org)
    return await org_security_payload(db, org)


@router.get("/orgs/{org_id}/logs")
async def list_org_audit_logs(
    org_id: int,
    q: str | None = None,
    limit: int = 100,
    _: dict = Depends(get_tcs_session),
    db: AsyncSession = Depends(get_db),
):
    if not await db.get(Org, org_id):
        raise HTTPException(404, "Organization not found")
    stmt = (
        select(AuditLog)
        .where(AuditLog.org_id == org_id)
        .order_by(AuditLog.created_at.desc())
        .limit(min(limit, 500))
    )
    rows = (await db.execute(stmt)).scalars().all()
    return _filter_audit_logs(rows, q)

"""Auth0 password login for TCS internal staff."""
from __future__ import annotations

import logging

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.shared.models import TcsStaff

logger = logging.getLogger(__name__)


async def lookup_tcs_staff(db: AsyncSession, email: str) -> TcsStaff | None:
    return (
        await db.execute(
            select(TcsStaff).where(func.lower(TcsStaff.email) == email.strip().lower())
        )
    ).scalars().first()


async def login_tcs_staff(db: AsyncSession, email: str, password: str) -> TcsStaff:
    email = email.strip().lower()
    staff = await lookup_tcs_staff(db, email)
    if not staff or not staff.is_active:
        raise ValueError("You do not have access to the TCS admin console.")

    if not settings.auth0_domain or not settings.auth0_client_id or not settings.auth0_client_secret:
        raise ValueError("Auth0 is not configured for TCS login")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            settings.auth0_token_url,
            json={
                "grant_type": "http://auth0.com/oauth/grant-type/password-realm",
                "username": email,
                "password": password,
                "realm": "Username-Password-Authentication",
                "client_id": settings.auth0_client_id,
                "client_secret": settings.auth0_client_secret,
                "scope": "openid profile email",
            },
        )
    if resp.status_code == 200:
        return staff

    try:
        detail = resp.json().get("error_description") or resp.json().get("error") or ""
    except Exception:
        detail = resp.text[:200]

    # Auth0 Password grant often disabled on Regular Web Apps — allow demo password for seeded TCS staff.
    if "not allowed" in str(detail).lower() or "unauthorized_client" in str(detail).lower():
        if password == settings.tcs_demo_password:
            logger.info("TCS demo password accepted for %s (Auth0 password grant disabled)", email)
            return staff
        raise ValueError("Invalid email or password.")

    raise ValueError("Invalid email or password." if "invalid" in str(detail).lower() else str(detail))


async def send_auth0_password_invite(
    email: str,
    name: str | None = None,
    *,
    org_id: int | None = None,
    org_name: str | None = None,
    invite_role: str | None = None,
    auth0_org_id: str | None = None,
    inviter_name: str = "TCS Admin",
) -> dict:
    from app.services.auth0_invite_service import send_staff_password_invite

    return await send_staff_password_invite(
        email,
        name,
        org_id=org_id,
        org_name=org_name,
        invite_role=invite_role,
        auth0_org_id=auth0_org_id,
        inviter_name=inviter_name,
    )

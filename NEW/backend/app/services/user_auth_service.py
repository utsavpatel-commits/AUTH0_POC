"""Auth0 password login for organization platform users (admins, staff)."""
from __future__ import annotations

import logging

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.shared.models import Org, User

logger = logging.getLogger(__name__)


async def login_platform_user(db: AsyncSession, email: str, password: str) -> User:
    email = email.strip().lower()
    user = (await db.execute(select(User).where(func.lower(User.email) == email))).scalars().first()
    if not user or not user.is_active:
        raise ValueError("Invalid email or password.")
    if user.role == "end_user":
        raise ValueError("Learner accounts sign in with an email code.")

    if not settings.auth0_domain or not settings.auth0_client_id or not settings.auth0_client_secret:
        raise ValueError("Auth0 is not configured for sign-in.")

    org = await db.get(Org, user.org_id) if user.org_id else None
    token_body: dict[str, str] = {
        "grant_type": "http://auth0.com/oauth/grant-type/password-realm",
        "username": email,
        "password": password,
        "realm": "Username-Password-Authentication",
        "client_id": settings.auth0_client_id,
        "client_secret": settings.auth0_client_secret,
        "scope": "openid profile email",
    }
    if org and org.auth0_org_id:
        token_body["organization"] = org.auth0_org_id

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(settings.auth0_token_url, json=token_body)
    if resp.status_code == 200:
        return user

    try:
        detail = resp.json().get("error_description") or resp.json().get("error") or ""
    except Exception:
        detail = resp.text[:200]
    logger.warning("Auth0 password login failed for %s: %s", email, detail)

    if user.demo_password and password == user.demo_password:
        logger.info("Demo password accepted for platform user %s", email)
        return user

    raise ValueError("Invalid email or password.")

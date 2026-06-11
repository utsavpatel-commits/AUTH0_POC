"""Auth0 passwordless OTP for frontline learner login."""
from __future__ import annotations

import logging
import time

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.shared.models import User

logger = logging.getLogger(__name__)

OTP_EXPIRY_MINUTES = 10
RATE_LIMIT_WINDOW = 900
MAX_OTP_REQUESTS = 3
MAX_VERIFY_FAILURES = 5
LOCKOUT_SECONDS = 900

_send_attempts: dict[str, list[float]] = {}
_verify_failures: dict[str, list[float]] = {}


def _prune_timestamps(entries: list[float], window: int) -> list[float]:
    cutoff = time.time() - window
    return [t for t in entries if t >= cutoff]


def _check_rate_limit(email: str) -> None:
    key = email.lower().strip()
    attempts = _prune_timestamps(_send_attempts.get(key, []), RATE_LIMIT_WINDOW)
    if len(attempts) >= MAX_OTP_REQUESTS:
        raise ValueError(
            f"Rate limit exceeded. Max {MAX_OTP_REQUESTS} codes per "
            f"{RATE_LIMIT_WINDOW // 60} minutes. Try again later."
        )
    attempts.append(time.time())
    _send_attempts[key] = attempts


def _check_brute_force(email: str) -> None:
    key = email.lower().strip()
    failures = _prune_timestamps(_verify_failures.get(key, []), LOCKOUT_SECONDS)
    if len(failures) >= MAX_VERIFY_FAILURES:
        raise ValueError(
            f"Too many failed attempts. Account locked for {LOCKOUT_SECONDS // 60} minutes."
        )


def _record_verify_failure(email: str) -> None:
    key = email.lower().strip()
    failures = _prune_timestamps(_verify_failures.get(key, []), LOCKOUT_SECONDS)
    failures.append(time.time())
    _verify_failures[key] = failures


def _clear_verify_failures(email: str) -> None:
    _verify_failures.pop(email.lower().strip(), None)


async def lookup_user_by_email(db: AsyncSession, email: str) -> User | None:
    return (
        await db.execute(
            select(User)
            .where(func.lower(User.email) == email.lower().strip())
            .order_by(User.id)
        )
    ).scalars().first()


async def _ensure_learner(db: AsyncSession, email: str) -> User:
    user = await lookup_user_by_email(db, email)
    if not user:
        raise ValueError(f"No account found for {email}")
    if not user.is_active:
        raise ValueError("Account not active")
    if user.role != "end_user":
        raise ValueError("One-time code login is only for frontline learners")
    return user


def _auth0_error_detail(resp: httpx.Response) -> str:
    try:
        body = resp.json()
        desc = body.get("error_description") or body.get("message") or body.get("error")
        if desc:
            return str(desc)
    except Exception:
        pass
    return resp.text[:300] or f"HTTP {resp.status_code}"


async def _auth0_passwordless_start(email: str) -> None:
    if not settings.passwordless_enabled:
        raise ValueError("Auth0 passwordless is not configured")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"https://{settings.auth0_domain}/passwordless/start",
            json={
                "client_id": settings.passwordless_client_id,
                "client_secret": settings.passwordless_client_secret,
                "connection": "email",
                "email": email,
                "send": "code",
            },
        )
    if resp.status_code in (200, 201):
        logger.info("Auth0 passwordless code sent to %s", email)
        return

    detail = _auth0_error_detail(resp)
    logger.warning("Auth0 passwordless/start failed (%s): %s", resp.status_code, detail)
    if "connection is disabled" in detail.lower():
        raise ValueError(
            "Auth0 Email passwordless is disabled. Enable it under "
            "Authentication → Passwordless → Email in the Auth0 Dashboard."
        )
    raise ValueError(f"Auth0 could not send code: {detail}")


async def _auth0_passwordless_verify(email: str, code: str) -> dict:
    if not settings.passwordless_enabled:
        raise ValueError("Auth0 passwordless is not configured")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            settings.auth0_token_url,
            json={
                "grant_type": "http://auth0.com/oauth/grant-type/passwordless/otp",
                "client_id": settings.passwordless_client_id,
                "client_secret": settings.passwordless_client_secret,
                "username": email,
                "otp": code,
                "realm": "email",
                "scope": "openid profile email",
            },
        )
    if resp.status_code != 200:
        detail = _auth0_error_detail(resp)
        logger.warning("Auth0 token exchange failed (%s): %s", resp.status_code, detail)
        raise ValueError(detail or "Invalid or expired code.")

    tokens = resp.json()
    if not tokens.get("access_token"):
        raise ValueError("Auth0 did not return an access_token.")
    return tokens


async def send_passwordless_code(*, email: str, db: AsyncSession) -> dict:
    email = email.strip().lower()
    await _ensure_learner(db, email)
    _check_rate_limit(email)
    await _auth0_passwordless_start(email)
    return {
        "ok": True,
        "message": f"A verification code was sent to {email}. Check your inbox (and spam).",
        "email": email,
        "provider": "auth0",
        "expires_in_minutes": OTP_EXPIRY_MINUTES,
    }


async def verify_passwordless_code(*, email: str, code: str, db: AsyncSession) -> dict:
    email = email.strip().lower()
    _check_brute_force(email)
    user = await _ensure_learner(db, email)

    try:
        tokens = await _auth0_passwordless_verify(email, code.strip())
    except ValueError:
        _record_verify_failure(email)
        raise

    _clear_verify_failures(email)
    return {
        "ok": True,
        "message": "Login successful",
        "provider": "auth0",
        "user": {
            "user_id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "facility_id": user.facility_id,
            "org_id": user.org_id,
        },
        "access_token": tokens.get("access_token"),
    }

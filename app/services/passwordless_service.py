"""
Passwordless OTP flow — Auth0 only.

  Enter Email → Auth0 /passwordless/start (OTP)
  → Auth0 email delivery → POST /oauth/token (verify + JWT)
"""
from __future__ import annotations

import logging
import time
from typing import Any

import httpx
from jose import jwt as jose_jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_validator import validate_token, TokenValidationError
from app.config import settings
from app.models import Organization, PlatformUser, UserStatus

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


def _flow_step(step_id: str, label: str, status: str, **extra: Any) -> dict:
    item = {"id": step_id, "label": label, "status": status}
    item.update(extra)
    return item


def _base_flow() -> list[dict]:
    return [
        _flow_step("enter_email", "Enter Email", "pending"),
        _flow_step(
            "auth0_passwordless",
            "Auth0 Passwordless",
            "pending",
            substeps=[
                "Generate OTP",
                "Store OTP",
                "Expiry",
                "Rate Limiting",
                "Brute Force Protection",
            ],
        ),
        _flow_step("amazon_ses", "Email Delivery", "pending"),
        _flow_step("email_delivered", "Email Delivered", "pending"),
        _flow_step("verify_code", "Auth0 Verifies Code", "pending"),
        _flow_step("jwt_issued", "JWT Issued by Auth0", "pending"),
    ]


async def _lookup_user_by_email(db: AsyncSession, email: str) -> PlatformUser | None:
    result = await db.execute(
        select(PlatformUser)
        .where(func.lower(PlatformUser.email) == email.lower().strip())
        .order_by(PlatformUser.created_at.desc())
    )
    users = result.scalars().all()
    if not users:
        return None
    for user in users:
        if user.status == UserStatus.ACTIVE:
            return user
    return users[0]


async def _ensure_active_user(db: AsyncSession, email: str) -> PlatformUser:
    user = await _lookup_user_by_email(db, email)
    if not user:
        raise ValueError(f"No LMS learner account found for {email}")
    if user.status != UserStatus.ACTIVE:
        raise ValueError(f"Account not active (status: {user.status})")
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
    """Ask Auth0 to generate and email a passwordless OTP."""
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
            "Auth0 Email passwordless is disabled. In Auth0 Dashboard go to "
            "Authentication → Passwordless → Email → Enable, then enable it for your application."
        )
    if "grant" in detail.lower() or "unauthorized_client" in detail.lower():
        raise ValueError(
            "Auth0 application not configured for passwordless. Enable the Passwordless OTP "
            "grant on your Regular Web App in Auth0 Dashboard → Applications → Advanced Settings → Grant Types."
        )
    raise ValueError(f"Auth0 could not send code: {detail}")


async def _auth0_passwordless_verify(email: str, code: str) -> dict:
    """
    Exchange OTP for tokens via Auth0 — JWT issued by Auth0 only.
    POST /oauth/token with grant_type passwordless/otp
    """
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
        try:
            body = resp.json()
            if body.get("error") == "mfa_required":
                raise ValueError(
                    "MFA is still required for this login. In Auth0 Dashboard disable "
                    "'Always require MFA' for the learner app, or ensure the "
                    "skip-mfa-learner-passwordless Action is deployed."
                )
        except ValueError:
            raise
        except Exception:
            pass
        raise ValueError(detail or "Invalid or expired code.")

    tokens = resp.json()
    if not tokens.get("access_token"):
        raise ValueError("Auth0 did not return an access_token.")
    logger.info("Auth0 issued JWT for %s", email)
    return tokens


async def _decode_auth0_token_claims(id_token: str | None, access_token: str) -> dict:
    """Decode Auth0-issued id_token/access_token claims (JWKS when possible)."""
    token = id_token or access_token
    if not token:
        return {}
    try:
        payload = await validate_token(token)
    except TokenValidationError:
        try:
            from app.auth.jwt_validator import _get_jwks, invalidate_jwks_cache
            from jose import jwt as jose_jwt_lib
            from jose.exceptions import JWTError

            jwks = await _get_jwks()
            header = jose_jwt_lib.get_unverified_header(token)
            kid = header.get("kid")
            rsa_key = next(
                (k for k in jwks.get("keys", []) if k.get("kid") == kid),
                None,
            )
            if not rsa_key:
                invalidate_jwks_cache()
                jwks = await _get_jwks()
                rsa_key = next(
                    (k for k in jwks.get("keys", []) if k.get("kid") == kid),
                    None,
                )
            if rsa_key:
                payload = jose_jwt_lib.decode(
                    token,
                    rsa_key,
                    algorithms=["RS256"],
                    audience=settings.passwordless_client_id,
                    issuer=settings.auth0_issuer,
                    options={"verify_at_hash": False},
                )
            else:
                raise TokenValidationError("No matching JWKS key")
        except Exception:
            logger.warning("Auth0 token JWKS validation failed — using unverified decode for display")
            try:
                payload = jose_jwt.get_unverified_claims(token)
            except Exception:
                return {}
    return {
        "sub": payload.get("sub"),
        "email": payload.get("email"),
        "email_verified": payload.get("email_verified"),
        "iss": payload.get("iss"),
        "aud": payload.get("aud"),
        "exp": payload.get("exp"),
    }


async def _link_auth0_sub(db: AsyncSession, user: PlatformUser, sub: str, email_verified: bool) -> None:
    if sub and user.idp_sub != sub:
        user.idp_sub = sub
        user.email_verified = email_verified
        db.add(user)
        await db.commit()
        await db.refresh(user)


async def send_passwordless_code(*, email: str, db: AsyncSession) -> dict:
    email = email.strip().lower()
    await _ensure_active_user(db, email)
    _check_rate_limit(email)

    flow = _base_flow()
    flow[0]["status"] = "complete"
    flow[1]["status"] = "active"

    await _auth0_passwordless_start(email)
    flow[1]["status"] = "complete"
    flow[1]["substeps_status"] = {
        "Generate OTP": "complete",
        "Store OTP": "complete",
        "Expiry": f"{OTP_EXPIRY_MINUTES} min",
        "Rate Limiting": "active",
        "Brute Force Protection": "active",
    }
    flow[2]["status"] = "complete"
    flow[2]["detail"] = "Auth0 email provider"
    flow[3]["status"] = "complete"

    return {
        "ok": True,
        "message": f"Auth0 sent a verification code to {email}. Check your inbox (and spam).",
        "email": email,
        "provider": "auth0",
        "expires_in_minutes": OTP_EXPIRY_MINUTES,
        "flow": flow,
        "email_sent": True,
        "jwt_issuer": settings.auth0_issuer,
    }


async def verify_passwordless_code(
    *,
    email: str,
    code: str,
    db: AsyncSession,
) -> dict:
    email = email.strip().lower()
    _check_brute_force(email)
    user = await _ensure_active_user(db, email)

    try:
        tokens = await _auth0_passwordless_verify(email, code)
    except ValueError:
        _record_verify_failure(email)
        raise

    _clear_verify_failures(email)

    access_token = tokens.get("access_token", "")
    id_token = tokens.get("id_token")
    claims = await _decode_auth0_token_claims(id_token, access_token)

    sub = claims.get("sub")
    email_verified = claims.get("email_verified", False)
    if sub:
        await _link_auth0_sub(db, user, sub, bool(email_verified))

    org_r = await db.execute(select(Organization).where(Organization.id == user.org_id))
    org = org_r.scalar_one_or_none()

    flow = _base_flow()
    for step in flow:
        step["status"] = "complete"
    flow[1]["substeps_status"] = {
        "Generate OTP": "complete",
        "Store OTP": "complete",
        "Expiry": "verified",
        "Rate Limiting": "complete",
        "Brute Force Protection": "complete",
    }
    flow[4]["detail"] = "Verified via POST /oauth/token"
    flow[5]["detail"] = f"iss: {claims.get('iss', settings.auth0_issuer)} · sub: {sub}"

    return {
        "ok": True,
        "message": "Login successful — JWT issued by Auth0",
        "provider": "auth0",
        "user": {
            "email": user.email,
            "role": user.role,
            "org_id": user.org_id,
            "org_name": org.name if org else None,
            "status": user.status,
        },
        "jwt": {
            "access_token": access_token,
            "id_token": id_token,
            "token_type": tokens.get("token_type", "Bearer"),
            "expires_in": tokens.get("expires_in"),
            "issuer": claims.get("iss") or settings.auth0_issuer,
            "claims": {
                "sub": sub,
                "email": claims.get("email") or user.email,
                "email_verified": email_verified,
                "exp": claims.get("exp"),
                "iss": claims.get("iss") or settings.auth0_issuer,
                "aud": claims.get("aud"),
            },
        },
        "flow": flow,
    }

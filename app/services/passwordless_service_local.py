"""Dev-only passwordless fallback when PASSWORDLESS_MODE=local (not Auth0 JWT)."""
from __future__ import annotations

import random
import string
from datetime import datetime, timezone, timedelta

from jose import jwt as jose_jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import OTPRecord, PlatformUser
from app.services.email_service import send_otp_email

OTP_EXPIRY_MINUTES = 10


def _generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


async def local_send_otp(db: AsyncSession, email: str, user: PlatformUser) -> tuple[str, dict]:
    old_result = await db.execute(
        select(OTPRecord).where(OTPRecord.email == email, OTPRecord.used == False)
    )
    for old in old_result.scalars().all():
        old.used = True
        db.add(old)

    code = _generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)
    otp = OTPRecord(email=email, code=code, expires_at=expires_at)
    db.add(otp)
    await db.commit()

    delivery = await send_otp_email(to=email, code=code, expires_minutes=OTP_EXPIRY_MINUTES)
    return code, delivery


async def local_verify_otp(db: AsyncSession, email: str, code: str) -> None:
    result = await db.execute(
        select(OTPRecord)
        .where(OTPRecord.email == email, OTPRecord.used == False)
        .order_by(OTPRecord.created_at.desc())
    )
    otp = result.scalars().first()
    if not otp:
        raise ValueError("No active OTP found. Request a new one.")
    now = datetime.now(timezone.utc)
    if otp.expires_at.replace(tzinfo=timezone.utc) < now:
        otp.used = True
        db.add(otp)
        await db.commit()
        raise ValueError("OTP has expired. Request a new one.")
    if otp.code != code:
        raise ValueError("Invalid OTP code.")
    otp.used = True
    db.add(otp)
    await db.commit()


def local_issue_jwt(user: PlatformUser) -> dict:
    now = datetime.now(timezone.utc)
    claims = {
        "iss": settings.auth0_issuer,
        "sub": user.idp_sub or f"local|{user.id}",
        "aud": settings.auth0_client_id,
        "email": user.email,
        "email_verified": True,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=8)).timestamp()),
    }
    token = jose_jwt.encode(claims, settings.secret_key, algorithm="HS256")
    return {
        "access_token": token,
        "id_token": token,
        "token_type": "Bearer",
        "expires_in": 28800,
    }

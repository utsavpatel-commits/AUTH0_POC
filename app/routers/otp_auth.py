"""
Passwordless OTP login.

POST /api/otp/request  — generate a 6-digit OTP for an email
POST /api/otp/verify   — verify OTP and create a session
"""
from __future__ import annotations

import random
import string
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import OTPRecord, Organization, PlatformUser, UserStatus
from app.services.activity_service import client_ip, client_user_agent, log_activity

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/otp", tags=["otp-auth"])

OTP_EXPIRY_MINUTES = 10


def _generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


class OTPRequest(BaseModel):
    email: str
    expires_minutes: int = OTP_EXPIRY_MINUTES


class OTPVerify(BaseModel):
    email: str
    code: str


@router.post("/request", summary="Request a passwordless OTP")
async def request_otp(
    body: OTPRequest,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    # Check user exists in platform DB
    result = await db.execute(select(PlatformUser).where(PlatformUser.email == body.email))
    user: PlatformUser | None = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=f"No user found for {body.email}")
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=403, detail=f"Account not active (status: {user.status})")

    # Invalidate any previous unused OTPs for this email
    old_result = await db.execute(
        select(OTPRecord).where(OTPRecord.email == body.email, OTPRecord.used == False)
    )
    for old in old_result.scalars().all():
        old.used = True
        db.add(old)

    # Generate new OTP
    expires_minutes = min(body.expires_minutes, 120)  # cap at 2 hours
    code = _generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)

    otp = OTPRecord(email=body.email, code=code, expires_at=expires_at)
    db.add(otp)
    await db.commit()

    logger.info("OTP generated for %s — expires in %s mins", body.email, expires_minutes)

    return JSONResponse({
        "message": f"OTP generated for {body.email}",
        "otp": code,  # shown in POC — in production send via email
        "expires_in": f"{expires_minutes} minutes",
        "note": "In production this would be sent via email, not returned here.",
    })


@router.post("/verify", summary="Verify OTP and create session")
async def verify_otp(
    body: OTPVerify,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    # Find the latest unused OTP for this email
    result = await db.execute(
        select(OTPRecord).where(
            OTPRecord.email == body.email,
            OTPRecord.used == False,
        ).order_by(OTPRecord.created_at.desc())
    )
    otp: OTPRecord | None = result.scalars().first()

    if not otp:
        raise HTTPException(status_code=401, detail="No active OTP found. Request a new one.")

    # Check expiry
    now = datetime.now(timezone.utc)
    if otp.expires_at.replace(tzinfo=timezone.utc) < now:
        otp.used = True
        db.add(otp)
        await db.commit()
        raise HTTPException(status_code=401, detail="OTP has expired. Request a new one.")

    # Check code
    if otp.code != body.code:
        await log_activity(
            db,
            "auth.login.failed",
            f"Invalid OTP for {body.email}",
            category="auth",
            actor_email=body.email,
            severity="warn",
            success=False,
            connection="passwordless",
            ip_address=client_ip(request),
        )
        raise HTTPException(status_code=401, detail="Invalid OTP code.")

    # Mark as used
    otp.used = True
    db.add(otp)

    # Load user
    result = await db.execute(select(PlatformUser).where(PlatformUser.email == body.email))
    user: PlatformUser | None = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    await db.commit()

    org_r = await db.execute(select(Organization).where(Organization.id == user.org_id))
    org = org_r.scalar_one_or_none()
    await log_activity(
        db,
        "auth.otp_login",
        f"Successful OTP login for {user.email}",
        category="auth",
        actor_email=user.email,
        org_id=user.org_id,
        org_name=org.name if org else None,
        connection="passwordless",
        ip_address=client_ip(request),
        user_agent=client_user_agent(request),
    )

    # Create legacy session
    request.session["legacy_user_id"] = user.id
    request.session["legacy_email"] = user.email
    request.session["legacy_role"] = user.role
    request.session["legacy_org_id"] = user.org_id

    logger.info("OTP login success: %s (role=%s)", user.email, user.role)

    return JSONResponse({
        "message": f"Login successful for {user.email}",
        "user": {
            "email": user.email,
            "role": user.role,
            "org_id": user.org_id,
            "status": user.status,
        },
    })

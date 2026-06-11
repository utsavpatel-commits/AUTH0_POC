"""
Passwordless OTP login — LMS Learner flow.

GET  /learner/login       — passwordless login page (email → OTP → JWT)
GET  /learner/dashboard   — post-login success view
POST /api/passwordless/send   — request OTP (Auth0 or local fallback)
POST /api/passwordless/verify — verify OTP and issue JWT + session
POST /api/otp/request     — legacy alias for send
POST /api/otp/verify      — legacy alias for verify
"""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Organization, PlatformUser
from app.services.activity_service import client_ip, client_user_agent, log_activity
from app.services.passwordless_service import (
    _lookup_user_by_email,
    send_passwordless_code,
    verify_passwordless_code,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["passwordless-auth"])
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))


class PasswordlessSend(BaseModel):
    email: EmailStr


class PasswordlessVerify(BaseModel):
    email: EmailStr
    code: str


class OTPRequest(BaseModel):
    email: str
    expires_minutes: int = 10


class OTPVerify(BaseModel):
    email: str
    code: str


def _store_session(request: Request, user: PlatformUser, jwt_payload: dict) -> None:
    claims = jwt_payload.get("claims", {})
    request.session["user_sub"] = claims.get("sub") or user.idp_sub or user.id
    request.session["user_email"] = claims.get("email") or user.email
    request.session["user_email_verified"] = claims.get("email_verified", True)
    request.session["access_token"] = jwt_payload.get("access_token", "")
    request.session["jwt_issuer"] = jwt_payload.get("issuer") or claims.get("iss") or settings.auth0_issuer
    request.session["platform_user_id"] = user.id
    request.session["legacy_user_id"] = user.id
    request.session["legacy_email"] = user.email
    request.session["legacy_role"] = user.role
    request.session["legacy_org_id"] = user.org_id
    request.session["login_method"] = "passwordless"


@router.get("/learner/login", response_class=HTMLResponse, include_in_schema=False)
async def learner_login_page(request: Request) -> HTMLResponse:
    import os
    mode = os.getenv("PASSWORDLESS_MODE", "auth0").lower()
    return templates.TemplateResponse(
        "passwordless_login.html",
        {
            "request": request,
            "auth0_domain": settings.auth0_domain,
            "passwordless_mode": mode,
            "demo_emails": [
                "demo@utsav.dev",
                "alice@globex.com",
                "utsavpatel8696@gmail.com",
            ],
        },
    )


@router.get("/learner/dashboard", response_class=HTMLResponse, include_in_schema=False)
async def learner_dashboard(request: Request, db: AsyncSession = Depends(get_db)) -> HTMLResponse:
    user_id = request.session.get("platform_user_id") or request.session.get("legacy_user_id")
    if not user_id:
        return RedirectResponse(url="/learner/login", status_code=302)

    result = await db.execute(select(PlatformUser).where(PlatformUser.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return RedirectResponse(url="/learner/login", status_code=302)

    org_r = await db.execute(select(Organization).where(Organization.id == user.org_id))
    org = org_r.scalar_one_or_none()

    jwt_claims = {
        "sub": request.session.get("user_sub"),
        "email": request.session.get("user_email", user.email),
        "email_verified": request.session.get("user_email_verified", True),
        "iss": request.session.get("jwt_issuer", settings.auth0_issuer),
    }
    access_token = request.session.get("access_token", "")
    jwt_issuer = request.session.get("jwt_issuer", settings.auth0_issuer)

    return templates.TemplateResponse(
        "learner_dashboard.html",
        {
            "request": request,
            "user": user,
            "org": org,
            "jwt_claims": jwt_claims,
            "access_token": access_token,
            "jwt_issuer": jwt_issuer,
            "login_method": request.session.get("login_method", "passwordless"),
        },
    )


@router.get("/learner/logout", include_in_schema=False)
async def learner_logout(request: Request, db: AsyncSession = Depends(get_db)) -> RedirectResponse:
    email = request.session.get("legacy_email") or request.session.get("user_email")
    if email:
        await log_activity(
            db,
            "auth.logout",
            f"{email} signed out (passwordless)",
            category="auth",
            actor_email=email,
            connection="passwordless",
            ip_address=client_ip(request),
        )
    request.session.clear()
    return RedirectResponse(url="/learner/login", status_code=302)


@router.post("/api/passwordless/send", summary="Send passwordless OTP")
async def passwordless_send(
    body: PasswordlessSend,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    try:
        result = await send_passwordless_code(email=body.email, db=db)
        return JSONResponse(result)
    except ValueError as exc:
        status = 429 if "Rate limit" in str(exc) or "locked" in str(exc) else 400
        raise HTTPException(status_code=status, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("passwordless send failed for %s", body.email)
        raise HTTPException(status_code=500, detail="Failed to send verification code.") from exc


@router.post("/api/passwordless/verify", summary="Verify passwordless OTP and issue JWT")
async def passwordless_verify(
    body: PasswordlessVerify,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    try:
        result = await verify_passwordless_code(email=body.email, code=body.code.strip(), db=db)
    except ValueError as exc:
        await log_activity(
            db,
            "auth.login.failed",
            f"Invalid passwordless OTP for {body.email}",
            category="auth",
            actor_email=body.email,
            severity="warn",
            success=False,
            connection="passwordless",
            ip_address=client_ip(request),
        )
        if "locked" in str(exc):
            raise HTTPException(status_code=429, detail=str(exc)) from exc
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user = await _lookup_user_by_email(db, body.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    org_r = await db.execute(select(Organization).where(Organization.id == user.org_id))
    org = org_r.scalar_one_or_none()

    _store_session(request, user, result["jwt"])

    await log_activity(
        db,
        "auth.otp_login",
        f"Successful passwordless login for {user.email}",
        category="auth",
        actor_email=user.email,
        actor_sub=result["jwt"]["claims"].get("sub"),
        org_id=user.org_id,
        org_name=org.name if org else None,
        connection="passwordless",
        ip_address=client_ip(request),
        user_agent=client_user_agent(request),
        metadata={"provider": result.get("provider")},
    )

    result["redirect"] = "/learner/dashboard"
    return JSONResponse(result)


# Legacy API aliases (used by older clients / docs)
@router.post("/api/otp/request", summary="Request a passwordless OTP (legacy alias)")
async def request_otp(body: OTPRequest, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    try:
        result = await send_passwordless_code(email=body.email, db=db)
        payload = {
            "message": result["message"],
            "expires_in": f"{result['expires_in_minutes']} minutes",
            "note": result["delivery"].get("note") or "Check your email for the code.",
        }
        return JSONResponse(payload)
    except ValueError as exc:
        status = 404 if "No LMS" in str(exc) else 429 if "Rate limit" in str(exc) else 400
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@router.post("/api/otp/verify", summary="Verify OTP and create session (legacy alias)")
async def verify_otp(
    body: OTPVerify,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    verify_body = PasswordlessVerify(email=body.email, code=body.code)
    return await passwordless_verify(verify_body, request, db)

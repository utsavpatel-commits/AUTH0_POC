"""Auth0 passwordless OTP endpoints for frontline learner login."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services.passwordless_service import send_passwordless_code, verify_passwordless_code

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/passwordless", tags=["passwordless-auth"])


class PasswordlessSend(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        email = v.strip().lower()
        if "@" not in email:
            raise ValueError("Invalid email address")
        return email


class PasswordlessVerify(BaseModel):
    email: str
    code: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        email = v.strip().lower()
        if "@" not in email:
            raise ValueError("Invalid email address")
        return email


@router.post("/send")
async def passwordless_send(body: PasswordlessSend, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    try:
        result = await send_passwordless_code(email=body.email, db=db)
        return JSONResponse(result)
    except ValueError as exc:
        status = 429 if "Rate limit" in str(exc) or "locked" in str(exc) else 400
        if "No account found" in str(exc):
            status = 404
        raise HTTPException(status_code=status, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("passwordless send failed for %s", body.email)
        raise HTTPException(status_code=500, detail="Failed to send verification code.") from exc


@router.post("/verify")
async def passwordless_verify(body: PasswordlessVerify, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    try:
        result = await verify_passwordless_code(
            email=body.email, code=body.code.strip(), db=db
        )
        return JSONResponse(result)
    except ValueError as exc:
        if "locked" in str(exc):
            raise HTTPException(status_code=429, detail=str(exc)) from exc
        raise HTTPException(status_code=400, detail=str(exc)) from exc

"""Post-Auth0 password reset redirect — sends users to the platform login (no approval queue)."""
from __future__ import annotations

import urllib.parse

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from app.core.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth-redirect"])


@router.get("/welcome")
async def welcome_after_password(request: Request) -> RedirectResponse:
    """Legacy alias — redirects to the configured post-password page (not /login)."""
    return RedirectResponse(url=settings.post_password_redirect_url, status_code=302)

from fastapi import HTTPException, Request

from app.core.config import settings


def get_tcs_session(request: Request) -> dict:
    session = request.session.get(settings.tcs_session_cookie)
    if not session or not session.get("email"):
        raise HTTPException(status_code=401, detail="TCS session required.")
    return session


def require_tcs_admin(request: Request) -> dict:
    session = get_tcs_session(request)
    if session.get("role") != "tcs_admin":
        raise HTTPException(status_code=403, detail="TCS admin role required.")
    return session

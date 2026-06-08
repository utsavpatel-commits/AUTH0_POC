"""Shared OAuth / PKCE helpers used by auth and legacy login flows."""
from __future__ import annotations

import base64
import hashlib
import logging
import os

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from starlette.requests import Request

from app.config import settings

logger = logging.getLogger(__name__)

# Signed OAuth state — survives even if the session cookie is lost on redirect
_state_signer = URLSafeTimedSerializer(settings.secret_key, salt="oauth-pkce-state")
_STATE_MAX_AGE = 600  # 10 minutes


def generate_code_verifier() -> str:
    return base64.urlsafe_b64encode(os.urandom(40)).rstrip(b"=").decode("ascii")


def generate_code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def generate_state() -> str:
    return base64.urlsafe_b64encode(os.urandom(16)).rstrip(b"=").decode("ascii")


def resolve_callback_url(request: Request | None = None) -> str:
    """
    OAuth redirect_uri must match the browser origin that started the flow.

    Always prefer the incoming request host (localhost, ngrok, Render, etc.)
    so the session cookie and Auth0 callback land on the same origin.
    """
    if request is None:
        return settings.callback_url

    host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("host")
        or ""
    ).split(",")[0].strip()

    if not host:
        return settings.callback_url

    proto = (request.headers.get("x-forwarded-proto") or "https").split(",")[0].strip()
    if "localhost" in host or host.startswith("127.0.0.1"):
        proto = "http"
    elif "ngrok" in host:
        proto = "https"

    return f"{proto}://{host}/callback"


def build_signed_oauth_state(verifier: str, callback: str) -> str:
    """Embed PKCE verifier + callback in a signed state param sent to Auth0."""
    nonce = generate_state()
    return _state_signer.dumps({"n": nonce, "v": verifier, "r": callback})


def parse_signed_oauth_state(signed_state: str) -> dict | None:
    """Verify and unpack the signed state returned by Auth0."""
    try:
        return _state_signer.loads(signed_state, max_age=_STATE_MAX_AGE)
    except (BadSignature, SignatureExpired) as exc:
        logger.warning("Signed OAuth state invalid: %s", exc)
        return None


def store_pkce_session(request: Request) -> tuple[str, str, str]:
    """
    Prepare PKCE flow.

    Returns (signed_state, code_challenge, callback_url).
    The signed_state is sent to Auth0 as the `state` parameter so the
    callback can recover the verifier even if the session cookie is missing.
    """
    verifier = generate_code_verifier()
    challenge = generate_code_challenge(verifier)
    callback = resolve_callback_url(request)
    signed_state = build_signed_oauth_state(verifier, callback)

    # Session backup (used when available)
    request.session["pkce_verifier"] = verifier
    request.session["oauth_state"] = signed_state
    request.session["oauth_redirect_uri"] = callback

    return signed_state, challenge, callback


def resolve_pkce_from_callback(request: Request, state: str | None) -> tuple[str | None, str | None]:
    """
    Recover PKCE verifier and redirect_uri from signed state or session.

    Returns (verifier, redirect_uri) or (None, None) on failure.
    """
    if state:
        payload = parse_signed_oauth_state(state)
        if payload:
            return payload.get("v"), payload.get("r")

    verifier = request.session.get("pkce_verifier")
    redirect_uri = request.session.get("oauth_redirect_uri") or resolve_callback_url(request)
    session_state = request.session.get("oauth_state")

    if verifier and session_state and session_state == state:
        return verifier, redirect_uri

    return None, None

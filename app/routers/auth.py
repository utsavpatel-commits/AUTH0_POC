"""
PKCE Authorization Code Flow endpoints.

/login      — builds Auth0 authorize URL with PKCE challenge, redirects
/callback   — exchanges code for tokens, stores sub in session
/logout     — clears session, redirects to Auth0 logout

PKCE (Proof Key for Code Exchange) is used so the client secret is never
exposed in the browser — only the server-side callback handles it.
"""
from __future__ import annotations

import logging
import urllib.parse
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.oauth_helpers import resolve_pkce_from_callback, store_pkce_session
from app.auth.service import auth_service
from app.config import settings
from app.database import get_db
from app.models import PlatformUser, UserStatus
from app.services.activity_service import client_ip, client_user_agent, log_activity

logger = logging.getLogger(__name__)
router = APIRouter(tags=["auth"])


def _post_password_redirect(email: str | None = None) -> RedirectResponse:
    """After password setup — welcome page, not the login form."""
    url = settings.post_password_redirect_url
    if email:
        url = f"{url}?{urllib.parse.urlencode({'email': email})}"
    return RedirectResponse(url=url, status_code=302)


async def _auth0_app_metadata(sub: str) -> dict:
    try:
        user = await auth_service.get_user(sub)
        return user.get("app_metadata") or {}
    except Exception as exc:
        logger.warning("Could not load Auth0 app_metadata for %s: %s", sub, exc)
        return {}


def _is_org_admin_invite(metadata: dict) -> bool:
    if not metadata.get("needsInvitation") or metadata.get("inviteType") != "org_join":
        return False
    role = (metadata.get("invite_role") or "administrator").lower().replace(" ", "_")
    return role in {"administrator", "admin"}


@router.get("/platform-login", include_in_schema=False)
async def platform_login_entry(request: Request):
    """HTTPS landing page after Auth0 password reset — forwards to Web 3.0 login."""
    email = request.query_params.get("email")
    return _post_password_redirect(email)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/login", summary="Initiate PKCE login flow")
async def login(
    request: Request,
    org_id: Optional[str] = None,
    organization: Optional[str] = None,
    organization_name: Optional[str] = None,
    invitation: Optional[str] = None,
    connection: Optional[str] = None,         # social: google-oauth2, windowslive, github
    force_oauth: Optional[str] = None,
):
    """
    Redirect the browser to Auth0 Universal Login.

    When called from an invitation link, Auth0 appends ?invitation=...&organization=...
    These must be forwarded to Auth0's /authorize so it shows the password-setting UI.

    After password reset Auth0 lands here with no params — send org admins to the
    Web 3.0 platform login instead of starting OAuth (which shows Access Pending).
    """
    if invitation or organization:
        state, challenge, callback = store_pkce_session(request)
        effective_org = organization or org_id
        params = {
            "response_type": "code",
            "client_id": settings.auth0_client_id,
            "redirect_uri": callback,
            "scope": "openid profile email",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "organization": effective_org,
            "invitation": invitation,
        }
        if organization_name:
            params["organization_name"] = organization_name
        auth_url = f"{settings.auth0_authorize_url}?{urllib.parse.urlencode({k: v for k, v in params.items() if v})}"
        logger.info("Org invitation login — forwarding to Auth0 authorize.")
        return RedirectResponse(url=auth_url, status_code=302)

    if not force_oauth:
        email = request.query_params.get("email")
        logger.info("Post-password or bare /login hit — redirecting to platform login.")
        return _post_password_redirect(email)

    state, challenge, callback = store_pkce_session(request)

    # organization can come from ?org_id= (our param) or ?organization= (Auth0 invitation link)
    effective_org = organization or org_id

    params = {
        "response_type": "code",
        "client_id": settings.auth0_client_id,
        "redirect_uri": callback,
        "scope": "openid profile email",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }

    if effective_org:
        params["organization"] = effective_org

    if invitation:
        params["invitation"] = invitation

    if organization_name:
        params["organization_name"] = organization_name

    # Social login: pass connection only when no org context (Auth0 rejects both)
    if connection and not effective_org:
        params["connection"] = connection

    auth_url = f"{settings.auth0_authorize_url}?{urllib.parse.urlencode(params)}"
    logger.debug("Redirecting to Auth0: %s", auth_url)
    return RedirectResponse(url=auth_url, status_code=302)


@router.get("/callback", summary="OAuth2 callback — exchange code for tokens")
async def callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle the redirect from Auth0.

    1. Validate state (CSRF protection)
    2. Exchange authorization code for tokens using stored PKCE verifier
    3. Validate the id_token
    4. Look up or create PlatformUser in our DB
    5. Store sub in session and redirect to dashboard
    """
    # Auth0 sends back errors on the redirect
    if error:
        logger.warning("Auth0 returned error: %s — %s", error, error_description)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Auth0 error: {error_description or error}",
        )

    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing authorization code.")

    verifier, redirect_uri = resolve_pkce_from_callback(request, state)
    if not verifier or not redirect_uri:
        logger.warning(
            "OAuth state recovery failed — query_state=%s host=%s",
            state[:40] + "..." if state and len(state) > 40 else state,
            request.headers.get("host"),
        )
        return RedirectResponse(
            url="/tcs/login?error=Your+login+session+expired.+Please+sign+in+again.",
            status_code=302,
        )

    # Exchange code for tokens
    async with httpx.AsyncClient(timeout=15) as client:
        token_resp = await client.post(
            settings.auth0_token_url,
            json={
                "grant_type": "authorization_code",
                "client_id": settings.auth0_client_id,
                "client_secret": settings.auth0_client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
                "code_verifier": verifier,
            },
        )

    if token_resp.status_code != 200:
        logger.error("Token exchange failed: %s", token_resp.text)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Token exchange failed: {token_resp.text}",
        )

    tokens = token_resp.json()
    access_token = tokens.get("access_token")
    id_token = tokens.get("id_token")

    if not access_token:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="No access_token in response.")

    # Validate id_token to extract user claims
    # We use the access_token for API calls but validate via id_token claims
    try:
        # Auth0 id_tokens use the client_id as audience
        from jose import jwt as jose_jwt
        from app.auth.jwt_validator import _get_jwks

        jwks = await _get_jwks()
        unverified = jose_jwt.get_unverified_claims(id_token or access_token)
        sub = unverified.get("sub")
        email = unverified.get("email")
        email_verified = unverified.get("email_verified", False)
    except Exception as exc:
        logger.warning("Could not decode id_token claims: %s", exc)
        # Fall back to /userinfo endpoint
        async with httpx.AsyncClient(timeout=10) as client:
            ui_resp = await client.get(
                f"https://{settings.auth0_domain}/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if ui_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to retrieve user info.")
        userinfo = ui_resp.json()
        sub = userinfo.get("sub")
        email = userinfo.get("email")
        email_verified = userinfo.get("email_verified", False)

    if not sub:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="No 'sub' in token.")

    # Look up PlatformUser by sub
    result = await db.execute(select(PlatformUser).where(PlatformUser.idp_sub == sub))
    platform_user: Optional[PlatformUser] = result.scalar_one_or_none()

    # If not found by sub, try by email (user may have accepted an invitation)
    if platform_user is None and email:
        result = await db.execute(select(PlatformUser).where(PlatformUser.email == email))
        platform_user = result.scalar_one_or_none()
        if platform_user and platform_user.idp_sub is None:
            # Link the Auth0 sub to this platform user
            platform_user.idp_sub = sub
            platform_user.email_verified = email_verified
            await db.commit()
            await db.refresh(platform_user)

    # Clean up session temp keys
    request.session.pop("pkce_verifier", None)
    request.session.pop("oauth_state", None)
    request.session.pop("oauth_redirect_uri", None)

    metadata = await _auth0_app_metadata(sub)

    if platform_user is None:
        if _is_org_admin_invite(metadata):
            logger.info(
                "Org admin invite accepted for %s — redirecting to platform login (no approval).",
                email,
            )
            return _post_password_redirect(email)

        request.session["user_sub"] = sub
        request.session["user_email"] = email or ""
        request.session["user_email_verified"] = email_verified
        request.session["access_token"] = access_token
        logger.info("Unknown user logged in: %s — redirecting to pending page.", email)
        return RedirectResponse(url="/pending", status_code=302)

    # Known user
    request.session["user_sub"] = sub
    request.session["user_email"] = email or platform_user.email
    request.session["user_email_verified"] = email_verified
    request.session["access_token"] = access_token
    request.session["platform_user_id"] = platform_user.id

    logger.info("User %s (%s) logged in successfully. Status: %s", platform_user.id, email, platform_user.status)

    from sqlalchemy import select as sa_select
    from app.models import Organization
    org_r = await db.execute(sa_select(Organization).where(Organization.id == platform_user.org_id))
    org = org_r.scalar_one_or_none()
    connection = request.query_params.get("connection", "oauth")
    await log_activity(
        db,
        "auth.oauth_login",
        f"Successful login for {email or platform_user.email}",
        category="auth",
        actor_email=email or platform_user.email,
        actor_sub=sub,
        org_id=platform_user.org_id,
        org_name=org.name if org else None,
        connection=connection,
        ip_address=client_ip(request),
        user_agent=client_user_agent(request),
    )

    # If this was an MFA challenge triggered after legacy login, go back to the original destination
    mfa_redirect = request.session.pop("mfa_post_login_redirect", None)
    if mfa_redirect:
        logger.info("MFA verified for %s — redirecting to %s", email, mfa_redirect)
        return RedirectResponse(url=mfa_redirect, status_code=302)

    if _is_org_admin_invite(metadata) or platform_user.invited_by:
        if platform_user.status != UserStatus.ACTIVE:
            platform_user.status = UserStatus.ACTIVE
            if not platform_user.role:
                platform_user.role = "administrator"
            if not platform_user.entitlements:
                platform_user.entitlements = ["*"]
            from datetime import datetime, timezone

            platform_user.approved_at = datetime.now(timezone.utc)
            await db.commit()
            await db.refresh(platform_user)
        return _post_password_redirect(email or platform_user.email)

    if platform_user.status == UserStatus.ACTIVE:
        return RedirectResponse(url="/dashboard", status_code=302)
    return RedirectResponse(url="/pending", status_code=302)


@router.get("/logout", summary="Log out — clear session and redirect to Auth0 logout")
async def logout(request: Request):
    """Clear the local session and redirect to Auth0 logout endpoint."""
    request.session.clear()
    return_to = urllib.parse.quote(settings.app_base_url, safe="")
    logout_url = (
        f"{settings.auth0_logout_url}"
        f"?client_id={settings.auth0_client_id}"
        f"&returnTo={return_to}"
    )
    return RedirectResponse(url=logout_url, status_code=302)

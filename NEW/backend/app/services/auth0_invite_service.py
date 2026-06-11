"""Auth0 organization join invites — Auth0 Organizations invitation API."""
from __future__ import annotations

import logging
import re
import secrets
import time
from urllib.parse import quote

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

DB_CONNECTION = "Username-Password-Authentication"

_token: str | None = None
_token_expires_at: float = 0.0
_db_connection_id: str | None = None


class Auth0InviteError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


def slugify_org_name(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower().strip())
    return (slug.strip("-") or "org")[:120]


async def _mgmt_token(client: httpx.AsyncClient) -> str:
    global _token, _token_expires_at
    if _token and time.monotonic() < _token_expires_at - 60:
        return _token

    if not settings.auth0_mgmt_configured:
        raise Auth0InviteError(
            "Auth0 Management API is not configured. Set AUTH0_MGMT_CLIENT_ID and AUTH0_MGMT_CLIENT_SECRET.",
            503,
        )

    resp = await client.post(
        settings.auth0_token_url,
        json={
            "grant_type": "client_credentials",
            "client_id": settings.auth0_mgmt_client_id,
            "client_secret": settings.auth0_mgmt_client_secret,
            "audience": f"https://{settings.auth0_domain}/api/v2/",
        },
    )
    if resp.status_code != 200:
        logger.error("Auth0 mgmt token failed: %s", resp.text[:300])
        raise Auth0InviteError("Could not obtain Auth0 Management API token.", 502)

    data = resp.json()
    _token = data["access_token"]
    _token_expires_at = time.monotonic() + data.get("expires_in", 86400)
    return _token


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _user_path(user_id: str) -> str:
    return f"{settings.auth0_mgmt_base}/users/{quote(user_id, safe='')}"


def _org_join_metadata(
    *,
    org_id: int | None = None,
    org_name: str | None = None,
    invite_role: str | None = None,
) -> dict:
    meta: dict = {"needsInvitation": True, "inviteType": "org_join"}
    if org_id is not None:
        meta["org_id"] = org_id
    if org_name:
        meta["org_name"] = org_name.strip()
    if invite_role:
        meta["invite_role"] = invite_role.replace("_", " ").title()
    return meta


async def _get_db_connection_id(client: httpx.AsyncClient, token: str) -> str:
    global _db_connection_id
    if _db_connection_id:
        return _db_connection_id

    resp = await client.get(
        f"{settings.auth0_mgmt_base}/connections",
        headers=_auth_headers(token),
        params={"name": DB_CONNECTION, "fields": "id"},
    )
    if resp.status_code != 200 or not resp.json():
        raise Auth0InviteError(
            f"Auth0 connection '{DB_CONNECTION}' not found. Enable it in Auth0 Dashboard.",
            502,
        )
    _db_connection_id = resp.json()[0]["id"]
    return _db_connection_id


async def create_auth0_organization(display_name: str, slug: str) -> dict:
    """Create an Auth0 Organization and enable database login."""
    async with httpx.AsyncClient(timeout=20) as client:
        token = await _mgmt_token(client)
        resp = await client.post(
            f"{settings.auth0_mgmt_base}/organizations",
            headers=_auth_headers(token),
            json={"name": slug, "display_name": display_name.strip()},
        )
        if resp.status_code not in (200, 201):
            logger.error("Auth0 create organization failed: %s", resp.text[:300])
            raise Auth0InviteError(f"Could not create Auth0 organization: {resp.text[:200]}", 502)

        auth0_org = resp.json()
        conn_id = await _get_db_connection_id(client, token)
        enable = await client.post(
            f"{settings.auth0_mgmt_base}/organizations/{auth0_org['id']}/enabled_connections",
            headers=_auth_headers(token),
            json={
                "connection_id": conn_id,
                "assign_membership_on_login": True,
                "is_signup_enabled": True,
            },
        )
        if enable.status_code not in (200, 201):
            logger.warning(
                "Could not enable %s on Auth0 org %s: %s",
                DB_CONNECTION,
                auth0_org["id"],
                enable.text[:200],
            )
        return auth0_org


async def delete_auth0_organization(auth0_org_id: str) -> None:
    async with httpx.AsyncClient(timeout=15) as client:
        token = await _mgmt_token(client)
        await client.delete(
            f"{settings.auth0_mgmt_base}/organizations/{auth0_org_id}",
            headers=_auth_headers(token),
        )


async def _delete_pending_org_invitations(
    client: httpx.AsyncClient, token: str, auth0_org_id: str, email: str
) -> None:
    email = email.strip().lower()
    resp = await client.get(
        f"{settings.auth0_mgmt_base}/organizations/{auth0_org_id}/invitations",
        headers=_auth_headers(token),
    )
    if resp.status_code != 200:
        return
    for inv in resp.json():
        if inv.get("invitee", {}).get("email", "").lower() == email:
            await client.delete(
                f"{settings.auth0_mgmt_base}/organizations/{auth0_org_id}/invitations/{inv['id']}",
                headers=_auth_headers(token),
            )


async def send_auth0_organization_invitation(
    auth0_org_id: str,
    email: str,
    *,
    inviter_name: str = "TCS Admin",
    org_name: str | None = None,
    org_id: int | None = None,
    invite_role: str = "administrator",
    role_label: str = "Administrator",
    ttl_sec: int = 604800,
) -> dict:
    """Send Auth0 Organizations invitation email (join org + set password)."""
    if not settings.auth0_client_id:
        raise Auth0InviteError("AUTH0_CLIENT_ID is not configured.", 503)

    email = email.strip().lower()
    async with httpx.AsyncClient(timeout=20) as client:
        token = await _mgmt_token(client)
        conn_id = await _get_db_connection_id(client, token)
        await _delete_pending_org_invitations(client, token, auth0_org_id, email)
        resp = await client.post(
            f"{settings.auth0_mgmt_base}/organizations/{auth0_org_id}/invitations",
            headers=_auth_headers(token),
            json={
                "inviter": {"name": inviter_name},
                "invitee": {"email": email},
                "client_id": settings.auth0_client_id,
                "connection_id": conn_id,
                "ttl_sec": ttl_sec,
                "send_invitation_email": True,
                # Render OAuth callback uses this to skip the legacy "Access Pending" screen.
                "app_metadata": _org_join_metadata(
                    org_id=org_id,
                    org_name=org_name,
                    invite_role=invite_role,
                ),
            },
        )
        if resp.status_code not in (200, 201):
            logger.error("Auth0 org invitation failed for %s: %s", email, resp.text[:300])
            raise Auth0InviteError(
                f"Auth0 could not send organization invitation to {email}. "
                "Check Auth0 Dashboard → Branding → Email Provider and Organization Invitation template.",
                502,
            )

        invitation = resp.json()
        logger.info(
            "Auth0 organization invitation sent to %s for org %s (invitation %s)",
            email,
            auth0_org_id,
            invitation.get("id"),
        )

    display_org = org_name or "the organization"
    invitation_url = invitation.get("invitation_url")
    return {
        "ok": True,
        "invite_sent": True,
        "invite_type": "organization",
        "invite_email": email,
        "auth0_org_id": auth0_org_id,
        "auth0_invitation_id": invitation.get("id"),
        "invitation_url": invitation_url,
        "post_password_redirect_url": settings.post_password_redirect_url,
        "platform_login_url": settings.platform_login_url,
        "org_name": org_name,
        "role": role_label,
        "message": (
            f"Organization invitation sent to {email} to join {display_org} as {role_label}. "
            f"After setting their password they will be taken to {settings.post_password_redirect_url}."
        ),
    }


async def _find_database_user_id(client: httpx.AsyncClient, token: str, email: str) -> str | None:
    email = email.strip().lower()
    lookup = await client.get(
        f"{settings.auth0_mgmt_base}/users-by-email",
        headers=_auth_headers(token),
        params={"email": email},
    )
    if lookup.status_code != 200:
        return None
    for user in lookup.json():
        for identity in user.get("identities", []):
            if identity.get("connection") == DB_CONNECTION:
                return user["user_id"]
    return None


async def _apply_org_join_metadata(
    client: httpx.AsyncClient,
    token: str,
    user_id: str,
    *,
    name: str | None,
    org_id: int | None,
    org_name: str | None,
    invite_role: str | None,
    invite_setup_url: str | None = None,
) -> None:
    meta = _org_join_metadata(org_id=org_id, org_name=org_name, invite_role=invite_role)
    if invite_setup_url:
        meta["invite_setup_url"] = invite_setup_url
    payload: dict = {
        "email_verified": True,
        "app_metadata": meta,
    }
    if name:
        payload["name"] = name.strip()
    resp = await client.patch(_user_path(user_id), headers=_auth_headers(token), json=payload)
    if resp.status_code not in (200, 201):
        logger.warning("Auth0 org-join metadata update failed for %s: %s", user_id, resp.text[:200])


async def _ensure_auth0_user(
    client: httpx.AsyncClient,
    token: str,
    email: str,
    *,
    name: str | None = None,
    org_id: int | None = None,
    org_name: str | None = None,
    invite_role: str | None = None,
) -> str:
    email = email.strip().lower()
    existing = await _find_database_user_id(client, token, email)
    if existing:
        await _apply_org_join_metadata(
            client, token, existing, name=name, org_id=org_id, org_name=org_name, invite_role=invite_role
        )
        return existing

    create = await client.post(
        f"{settings.auth0_mgmt_base}/users",
        headers=_auth_headers(token),
        json={
            "email": email,
            "name": (name or email).strip(),
            "email_verified": True,
            "connection": DB_CONNECTION,
            "password": f"TempJoin!{secrets.token_hex(6)}9#",
            "verify_email": False,
            "app_metadata": _org_join_metadata(org_id=org_id, org_name=org_name, invite_role=invite_role),
        },
    )
    if create.status_code == 201:
        return create.json()["user_id"]

    if create.status_code == 409:
        existing = await _find_database_user_id(client, token, email)
        if existing:
            await _apply_org_join_metadata(
                client, token, existing, name=name, org_id=org_id, org_name=org_name, invite_role=invite_role
            )
            return existing

    logger.error("Auth0 create user failed for %s: %s", email, create.text[:300])
    raise Auth0InviteError(f"Could not create Auth0 user for {email}.", 502)


async def _create_password_setup_ticket(
    client: httpx.AsyncClient,
    token: str,
    user_id: str,
    email: str,
) -> str:
    """Ticket link embeds result_url — user is sent to platform login after setting password."""
    result_url = settings.post_password_redirect_url
    ticket = await client.post(
        f"{settings.auth0_mgmt_base}/tickets/password-change",
        headers=_auth_headers(token),
        json={
            "user_id": user_id,
            "result_url": result_url,
            "ttl_sec": 432000,
            "mark_email_as_verified": True,
        },
    )
    if ticket.status_code not in (200, 201):
        logger.error("Auth0 password ticket failed for %s: %s", email, ticket.text[:300])
        raise Auth0InviteError(f"Could not create password setup link for {email}.", 502)
    setup_url = ticket.json().get("ticket", "")
    if not setup_url:
        raise Auth0InviteError(f"Auth0 returned no password setup link for {email}.", 502)
    return setup_url


async def _trigger_set_password_email(
    client: httpx.AsyncClient,
    token: str,
    email: str,
    *,
    user_id: str | None = None,
    org_id: int | None = None,
    org_name: str | None = None,
    invite_role: str | None = None,
    name: str | None = None,
) -> str | None:
    if not settings.auth0_client_id:
        raise Auth0InviteError("AUTH0_CLIENT_ID is not configured.", 503)

    email = email.strip().lower()
    setup_url: str | None = None
    if user_id:
        setup_url = await _create_password_setup_ticket(client, token, user_id, email)
        await _apply_org_join_metadata(
            client,
            token,
            user_id,
            name=name,
            org_id=org_id,
            org_name=org_name,
            invite_role=invite_role,
            invite_setup_url=setup_url,
        )

    resp = await client.post(
        f"https://{settings.auth0_domain}/dbconnections/change_password",
        json={
            "client_id": settings.auth0_client_id,
            "email": email,
            "connection": DB_CONNECTION,
        },
    )
    if resp.status_code != 200:
        logger.error("Auth0 password email failed for %s: %s", email, resp.text[:300])
        raise Auth0InviteError(
            f"Auth0 could not send password email to {email}. "
            "Check Auth0 Dashboard → Branding → Email Provider.",
            502,
        )
    logger.info("Auth0 org-join invite email sent to %s (setup ticket with platform redirect)", email)
    return setup_url


async def send_org_join_invite(
    email: str,
    *,
    name: str | None = None,
    org_id: int | None = None,
    org_name: str,
    role: str = "administrator",
    auth0_org_id: str | None = None,
    inviter_name: str = "TCS Admin",
) -> dict:
    """
    Invite someone to join an organization.
    Uses Auth0 Organizations invitation email when auth0_org_id is set.
    """
    email = email.strip().lower()
    role_label = role.replace("_", " ").title()
    _ = name  # stored in local DB; Auth0 org invite creates the Auth0 user on accept

    if auth0_org_id:
        return await send_auth0_organization_invitation(
            auth0_org_id,
            email,
            inviter_name=inviter_name,
            org_name=org_name,
            org_id=org_id,
            invite_role=role,
            role_label=role_label,
        )

    async with httpx.AsyncClient(timeout=20) as client:
        token = await _mgmt_token(client)
        await _ensure_auth0_user(
            client, token, email, name=name, org_id=org_id, org_name=org_name, invite_role=role
        )
        auth0_user_id = await _find_database_user_id(client, token, email)
        if not auth0_user_id:
            raise Auth0InviteError(
                f"No Auth0 database user for {email}. Enable Username-Password-Authentication on your Auth0 app."
            )
        setup_url = await _trigger_set_password_email(
            client,
            token,
            email,
            user_id=auth0_user_id,
            org_id=org_id,
            org_name=org_name,
            invite_role=role,
            name=name,
        )

    who = (name or email).strip()
    return {
        "ok": True,
        "invite_sent": True,
        "invite_type": "password_reset",
        "invite_email": email,
        "password_setup_url": setup_url,
        "platform_login_url": settings.platform_login_url,
        "org_id": org_id,
        "org_name": org_name,
        "role": role,
        "message": (
            f"Invitation sent to {who} ({email}) to join {org_name} as {role_label}. "
            f"They will set their password from the email, then land on {settings.post_password_redirect_url}."
        ),
    }


async def send_password_reset_email(email: str, name: str | None = None, **_: object) -> dict:
    """Forgot-password only (no org context)."""
    email = email.strip().lower()
    async with httpx.AsyncClient(timeout=20) as client:
        token = await _mgmt_token(client)
        await _ensure_auth0_user(client, token, email, name=name)
        auth0_user_id = await _find_database_user_id(client, token, email)
        if not auth0_user_id:
            raise Auth0InviteError(f"No Auth0 database user for {email}.")
        await _trigger_set_password_email(client, token, email, user_id=auth0_user_id, name=name)
    return {
        "ok": True,
        "email": email,
        "message": f"Password reset email sent to {email}.",
    }


async def send_staff_password_invite(
    email: str,
    name: str | None = None,
    *,
    org_id: int | None = None,
    org_name: str | None = None,
    invite_role: str | None = None,
    auth0_org_id: str | None = None,
    inviter_name: str = "TCS Admin",
    **__: object,
) -> dict:
    if org_name:
        return await send_org_join_invite(
            email,
            name=name,
            org_id=org_id,
            org_name=org_name,
            role=invite_role or "administrator",
            auth0_org_id=auth0_org_id,
            inviter_name=inviter_name,
        )
    return await send_password_reset_email(email, name=name)


async def send_org_admin_invite(
    email: str,
    *,
    name: str,
    org_id: int,
    org_name: str,
    auth0_org_id: str,
    inviter_name: str = "TCS Admin",
) -> dict:
    return await send_org_join_invite(
        email,
        name=name,
        org_id=org_id,
        org_name=org_name,
        role="administrator",
        auth0_org_id=auth0_org_id,
        inviter_name=inviter_name,
    )


send_org_admin_welcome = send_org_admin_invite

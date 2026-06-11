"""
Sync Auth0 passwordless email template branding (logo, subject).
"""
from __future__ import annotations

import logging
import re

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

EMAIL_CONNECTION_ID = "con_cFbIT9bTztMcEdD0"
AUTH0_BADGE_URL = "https://cdn.auth0.com/styleguide/2.0.9/lib/logos/img/badge.png"


async def _mgmt_token(client: httpx.AsyncClient) -> str:
    resp = await client.post(
        f"https://{settings.auth0_domain}/oauth/token",
        json={
            "grant_type": "client_credentials",
            "client_id": settings.auth0_mgmt_client_id,
            "client_secret": settings.auth0_mgmt_client_secret,
            "audience": f"https://{settings.auth0_domain}/api/v2/",
        },
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def _logo_url() -> str:
    base = settings.app_base_url.rstrip("/")
    return f"{base}/static/branding/tcs-logo.png"


def _branded_body(original: str) -> str:
    logo = _logo_url()
    body = original.replace(AUTH0_BADGE_URL, logo)
    body = re.sub(
        r'<img([^>]*?)alt="Your logo goes here"([^>]*?)width="50"',
        r'<img\1alt="The Compliance Store"\2width="280"',
        body,
        flags=re.IGNORECASE,
    )
    body = re.sub(
        r'<img([^>]*?)width="50"([^>]*?)alt="Your logo goes here"',
        r'<img\1width="280"\2alt="The Compliance Store"',
        body,
        flags=re.IGNORECASE,
    )
    if logo not in body:
        body = body.replace(
            'alt="Your logo goes here"',
            f'src="{logo}" alt="The Compliance Store" width="280"',
            1,
        )
    return body


async def sync_passwordless_email_branding() -> None:
    """Replace Auth0 badge logo with The Compliance Store logo in email template."""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            token = await _mgmt_token(client)
            headers = {"Authorization": f"Bearer {token}"}
            conn_id = EMAIL_CONNECTION_ID

            resp = await client.get(
                f"https://{settings.auth0_domain}/api/v2/connections/{conn_id}",
                headers=headers,
            )
            resp.raise_for_status()
            conn = resp.json()
            options = dict(conn.get("options") or {})
            email_opts = dict(options.get("email") or {})
            original_body = email_opts.get("body") or ""

            if not original_body:
                logger.warning("Auth0 email connection has no HTML body to brand")
                return

            branded_body = _branded_body(original_body)
            if branded_body == original_body and _logo_url() not in original_body:
                logger.warning("Auth0 email template unchanged — logo URL not applied")
                return

            email_opts["body"] = branded_body
            email_opts["subject"] = "Your {{ application.name }} login code"
            options["email"] = email_opts
            options["subject"] = email_opts["subject"]

            patch = await client.patch(
                f"https://{settings.auth0_domain}/api/v2/connections/{conn_id}",
                headers=headers,
                json={"options": options},
            )
            patch.raise_for_status()
            logger.info(
                "Auth0 passwordless email branded with logo: %s",
                _logo_url(),
            )
    except Exception as exc:
        logger.warning("Auth0 email branding sync skipped: %s", exc)

"""Transactional email — Amazon SES when configured, console log for local POC."""
from __future__ import annotations

import logging
import os

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_invite_password_email(
    *,
    to: str,
    name: str,
    temp_password: str,
    login_url: str | None = None,
) -> dict:
    """Email a new administrator their temporary password and sign-in link."""
    login_url = login_url or f"{settings.app_base_url.rstrip('/')}/login"
    display_name = name.strip() or to.split("@")[0]
    subject = "Your TCS account — temporary password"
    body_text = (
        f"Hello {display_name},\n\n"
        f"An administrator account has been created for you on The Compliance Store.\n\n"
        f"Sign in at: {login_url}\n"
        f"Email: {to}\n"
        f"Temporary password: {temp_password}\n\n"
        "You will be asked to choose a new password after your first sign-in.\n\n"
        "If you did not expect this email, please contact your organization administrator."
    )
    body_html = f"""
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b;">
      <h1 style="font-size:20px;color:#0f172a;margin:0 0 8px;">Welcome to The Compliance Store</h1>
      <p style="color:#64748b;font-size:14px;margin:0 0 20px;">Hello {display_name}, your administrator account is ready.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;margin-bottom:20px;">
        <p style="margin:0 0 10px;font-size:14px;"><strong>Sign in:</strong> <a href="{login_url}" style="color:#2563eb;">{login_url}</a></p>
        <p style="margin:0 0 6px;font-size:14px;"><strong>Email:</strong> {to}</p>
        <p style="margin:0;font-size:14px;"><strong>Temporary password:</strong>
          <span style="font-family:monospace;font-size:16px;color:#2563eb;">{temp_password}</span>
        </p>
      </div>
      <p style="font-size:14px;color:#475569;margin:0;">
        After you sign in with this temporary password, you will be prompted to set a new password.
      </p>
    </div>
    """

    region = os.getenv("AWS_REGION", "")
    from_email = os.getenv("SES_FROM_EMAIL", "")
    access_key = os.getenv("AWS_ACCESS_KEY_ID", "")
    secret_key = os.getenv("AWS_SECRET_ACCESS_KEY", "")

    if region and from_email and access_key and secret_key:
        try:
            import boto3

            client = boto3.client(
                "ses",
                region_name=region,
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
            )
            response = client.send_email(
                Source=from_email,
                Destination={"ToAddresses": [to]},
                Message={
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": {
                        "Text": {"Data": body_text, "Charset": "UTF-8"},
                        "Html": {"Data": body_html, "Charset": "UTF-8"},
                    },
                },
            )
            message_id = response.get("MessageId", "")
            logger.info("SES invite email sent to %s (MessageId=%s)", to, message_id)
            return {"provider": "amazon_ses", "delivered": True, "message_id": message_id, "to": to}
        except Exception as exc:
            logger.warning("SES invite send failed for %s: %s — falling back to console", to, exc)

    logger.info("POC invite email for %s — temporary password: %s (login: %s)", to, temp_password, login_url)
    return {
        "provider": "console",
        "delivered": True,
        "to": to,
        "temp_password": temp_password,
        "note": "SES not configured — password logged server-side for POC testing.",
    }

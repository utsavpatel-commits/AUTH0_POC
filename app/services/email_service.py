"""
Email delivery for passwordless OTP — Amazon SES in production, console in POC.
"""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


async def send_otp_email(*, to: str, code: str, expires_minutes: int = 10) -> dict:
    """
    Send a one-time passcode email.

    Returns metadata used by the passwordless flow UI (provider, message id, etc.).
    """
    subject = "Your LMS login code"
    body_text = (
        f"Your one-time login code is: {code}\n\n"
        f"This code expires in {expires_minutes} minutes.\n"
        "If you did not request this code, you can ignore this email."
    )
    from app.config import settings
    logo_url = f"{settings.app_base_url.rstrip('/')}/static/branding/tcs-logo.png"
    body_html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <img src="{logo_url}" alt="The Compliance Store" width="280" style="max-width:100%;margin-bottom:20px;" />
      <p style="color:#64748b;font-size:13px;margin:0 0 16px;">Because Getting It Right Matters.</p>
      <p>Your one-time login code is:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#2563eb;">{code}</p>
      <p style="color:#64748b;font-size:14px;">Expires in {expires_minutes} minutes.</p>
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
            logger.info("SES OTP email sent to %s (MessageId=%s)", to, message_id)
            return {
                "provider": "amazon_ses",
                "delivered": True,
                "message_id": message_id,
                "to": to,
            }
        except Exception as exc:
            logger.warning("SES send failed for %s: %s — falling back to console", to, exc)

    logger.info("POC email (console) OTP for %s: %s", to, code)
    return {
        "provider": "console",
        "delivered": True,
        "to": to,
        "note": "SES not configured — OTP logged server-side for POC testing.",
    }

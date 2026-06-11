"""Auth0 Organization Invitation template — paste in Auth0 Dashboard."""
from __future__ import annotations

from app.core.config import settings

ORG_INVITATION_SUBJECT = "You're invited to join {{ organization.display_name }}"

ORG_INVITATION_BODY = """<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 24px;">
    <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px;">
      <p style="margin: 0 0 20px; font-size: 13px; color: #64748b; font-weight: 600;">The Compliance Store</p>
      <h1 style="margin: 0 0 16px; font-size: 20px; color: #0f172a; line-height: 1.4;">
        {{ inviter.name }} has invited you to join {{ organization.display_name }}
      </h1>
      <p style="margin: 0 0 24px; font-size: 15px; color: #475569; line-height: 1.6;">
        You have been invited to join <strong>{{ organization.display_name }}</strong> as an administrator.
        Accept the invitation by setting your password below.
      </p>
      <p style="margin: 0 0 28px; text-align: center;">
        <a href="{{ url }}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600;">Accept invitation</a>
      </p>
      <p style="margin: 0; font-size: 12px; color: #94a3b8;">After setting your password you will see a confirmation page. Sign in later when you are ready.</p>
    </div>
  </body>
</html>"""

ORG_JOIN_PREVIEW = """
<div style="font-family:sans-serif;background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0;">
  <div style="background:#fff;padding:20px;border-radius:8px;border:1px solid #e2e8f0;">
    <p style="margin:0 0 8px;font-size:13px;color:#64748b;font-weight:600;">The Compliance Store</p>
    <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#0f172a;">utsav.patel@ignitedata.ai has invited you to join Acme Healthcare</p>
    <p style="margin:0 0 12px;font-size:14px;color:#475569;">You have been invited as <strong>Administrator</strong>.</p>
    <p style="text-align:center;margin:16px 0;"><span style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;">Accept invitation</span></p>
  </div>
</div>
"""


def auth0_dashboard_email_templates_url() -> str:
    tenant = (settings.auth0_domain or "").split(".")[0]
    if tenant:
        return f"https://manage.auth0.com/dashboard/us/{tenant}/branding/emails"
    return "https://manage.auth0.com/dashboard"


def invite_email_template_payload() -> dict:
    return {
        "auth0_only": True,
        "template_name": "Organization Invitation",
        "dashboard_url": auth0_dashboard_email_templates_url(),
        "instructions": (
            "When you create an organization, Auth0 sends an Organization Invitation email "
            "(not a password reset). Paste into Auth0 Dashboard → Branding → Email Templates → Organization Invitation."
        ),
        "setup_steps": [
            "Auth0 Dashboard → Branding → Email Provider — configure for reliable delivery",
            "Auth0 Dashboard → Branding → Email Templates → Organization Invitation",
            "Paste Subject and HTML Body below, then Save",
            "Create an organization — admin receives the organization invitation email",
        ],
        "subject": ORG_INVITATION_SUBJECT,
        "body": ORG_INVITATION_BODY,
        "preview_html": ORG_JOIN_PREVIEW.strip(),
    }

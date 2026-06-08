"""Activity / audit log service — Auth0-style tenant logs."""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.models import ActivityLog

logger = logging.getLogger(__name__)

# Auth0-style display labels
EVENT_LABELS: dict[str, str] = {
    "auth.login": "Success Login",
    "auth.login.failed": "Failed Login",
    "auth.signup": "Success Signup",
    "auth.logout": "Success Logout",
    "auth.legacy_login": "Success Login",
    "auth.oauth_login": "Success Login",
    "auth.otp_login": "Success Login",
    "auth.mfa": "MFA Challenge",
    "user.invited": "User Invited",
    "user.role_assigned": "Role Assigned",
    "user.signup_complete": "Success Signup",
    "org.created": "Organization Created",
    "org.deleted": "Organization Deleted",
    "migration.email_sent": "Migration Email Sent",
    "migration.bulk": "Bulk Migration",
    "security.webhook": "Webhook Event",
    "admin.action": "Admin Action",
}


def event_label(event_type: str) -> str:
    return EVENT_LABELS.get(event_type, event_type.replace(".", " ").replace("_", " ").title())


def client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def client_user_agent(request: Request | None) -> str | None:
    if request is None:
        return None
    ua = request.headers.get("user-agent")
    return ua[:512] if ua else None


async def log_activity(
    db: AsyncSession,
    event_type: str,
    description: str,
    *,
    category: str = "auth",
    severity: str = "info",
    actor_email: str | None = None,
    actor_sub: str | None = None,
    target_email: str | None = None,
    org_id: str | None = None,
    org_name: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    connection: str | None = None,
    metadata: dict[str, Any] | None = None,
    success: bool = True,
    commit: bool = True,
) -> ActivityLog:
    entry = ActivityLog(
        event_type=event_type,
        category=category,
        severity=severity,
        actor_email=actor_email,
        actor_sub=actor_sub,
        target_email=target_email,
        org_id=org_id,
        org_name=org_name,
        ip_address=ip_address,
        user_agent=user_agent,
        connection=connection,
        description=description,
        extra_data=json.dumps(metadata) if metadata else None,
        success=success,
    )
    db.add(entry)
    if commit:
        await db.commit()
        await db.refresh(entry)
    else:
        await db.flush()
    logger.info("Activity: [%s] %s", event_type, description)
    return entry


async def get_activity_logs(
    db: AsyncSession,
    *,
    limit: int = 100,
    offset: int = 0,
    category: str | None = None,
    event_type: str | None = None,
    actor_email: str | None = None,
    org_id: str | None = None,
) -> list[ActivityLog]:
    q = select(ActivityLog).order_by(desc(ActivityLog.created_at))
    if category:
        q = q.where(ActivityLog.category == category)
    if event_type:
        q = q.where(ActivityLog.event_type == event_type)
    if actor_email:
        q = q.where(ActivityLog.actor_email == actor_email)
    if org_id:
        q = q.where(ActivityLog.org_id == org_id)
    q = q.offset(offset).limit(limit)
    result = await db.execute(q)
    return list(result.scalars().all())


async def count_activity_logs(db: AsyncSession, category: str | None = None) -> int:
    from sqlalchemy import func
    q = select(func.count()).select_from(ActivityLog)
    if category:
        q = q.where(ActivityLog.category == category)
    result = await db.execute(q)
    return result.scalar() or 0


async def get_log_stats(db: AsyncSession) -> dict:
    from sqlalchemy import func
    from datetime import datetime, timedelta, timezone

    since_24h = datetime.now(timezone.utc) - timedelta(hours=24)
    result = await db.execute(
        select(ActivityLog.event_type, func.count())
        .where(ActivityLog.created_at >= since_24h)
        .group_by(ActivityLog.event_type)
    )
    by_type = {row[0]: row[1] for row in result.all()}

    logins = sum(v for k, v in by_type.items() if "login" in k and "failed" not in k)
    failed = by_type.get("auth.login.failed", 0)
    signups = sum(v for k, v in by_type.items() if "signup" in k)

    return {
        "last_24h_logins": logins,
        "last_24h_failed": failed,
        "last_24h_signups": signups,
        "last_24h_total": sum(by_type.values()),
    }

"""
TCS Super-Admin routes.

TCS is the platform owner — they can see all organisations and trigger
bulk migration across all orgs at once.

GET  /tcs/dashboard          — HTML overview of all orgs + migration status
POST /api/tcs/migrate/org/{org_id}  — migrate all pending users in one org
POST /api/tcs/migrate/all    — migrate all pending users across all orgs
GET  /api/tcs/status         — JSON migration status per org
"""
from __future__ import annotations
from pathlib import Path
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import MigrationStatus, Organization, PlatformUser, UserStatus, ActivityLog
from app.services.activity_service import (
    EVENT_LABELS,
    count_activity_logs,
    event_label,
    get_activity_logs,
    get_log_stats,
    log_activity,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["tcs-admin"])
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))


# ---------------------------------------------------------------------------
# Auth0 helpers
# ---------------------------------------------------------------------------

async def _mgmt_token() -> str:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            f"https://{settings.auth0_domain}/oauth/token",
            json={
                "grant_type": "client_credentials",
                "client_id": settings.auth0_mgmt_client_id,
                "client_secret": settings.auth0_mgmt_client_secret,
                "audience": f"https://{settings.auth0_domain}/api/v2/",
            },
        )
        r.raise_for_status()
        return r.json()["access_token"]


async def _ensure_auth0_user(token: str, email: str) -> str:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            f"https://{settings.auth0_domain}/api/v2/users",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "email": email,
                "email_verified": True,
                "connection": "Username-Password-Authentication",
                "password": f"TempMig!{email[:4]}9#Xz",
                "verify_email": False,
            },
        )
        if r.status_code == 409:
            sr = await c.get(
                f"https://{settings.auth0_domain}/api/v2/users-by-email",
                headers={"Authorization": f"Bearer {token}"},
                params={"email": email},
            )
            users = sr.json()
            return users[0]["user_id"] if users else ""
        r.raise_for_status()
        return r.json()["user_id"]


async def _send_reset_email(email: str) -> None:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            f"https://{settings.auth0_domain}/dbconnections/change_password",
            json={
                "client_id": settings.auth0_client_id,
                "email": email,
                "connection": "Username-Password-Authentication",
            },
        )
        r.raise_for_status()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_org_stats(db: AsyncSession, org: Organization) -> dict:
    result = await db.execute(
        select(PlatformUser).where(PlatformUser.org_id == org.id)
    )
    all_users = list(result.scalars().all())
    legacy = [u for u in all_users if u.password_hash is not None]
    migrated = [u for u in legacy if u.idp_sub is not None]
    email_sent = [u for u in legacy if u.migration_status == MigrationStatus.EMAIL_SENT and u.idp_sub is None]
    pending = [u for u in legacy if u.migration_status == MigrationStatus.PENDING and u.idp_sub is None]
    new_users = [u for u in all_users if u.password_hash is None]

    return {
        "org": {
            "id": org.id,
            "name": org.name,
            "auth0_org_id": org.auth0_org_id,
            "mfa_required": org.mfa_required or False,
        },
        "total": len(all_users),
        "legacy_total": len(legacy),
        "migrated": len(migrated),
        "email_sent": len(email_sent),
        "pending": len(pending),
        "new_users": len(new_users),
        "pct": round(len(migrated) / len(legacy) * 100) if legacy else 100,
    }


async def _migrate_users(db: AsyncSession, users: list[PlatformUser], actor_email: str | None = None) -> list[dict]:
    if not users:
        return []

    token = await _mgmt_token()
    results = []

    for user in users:
        org_r = await db.execute(select(Organization).where(Organization.id == user.org_id))
        org = org_r.scalar_one_or_none()
        try:
            auth0_id = await _ensure_auth0_user(token, user.email)
            await _send_reset_email(user.email)
            user.migration_status = MigrationStatus.EMAIL_SENT
            db.add(user)
            results.append({"email": user.email, "status": "email_sent", "auth0_id": auth0_id})
            await log_activity(
                db,
                "migration.email_sent",
                f"Migration email sent to {user.email}",
                category="migration",
                target_email=user.email,
                actor_email=actor_email,
                org_id=user.org_id,
                org_name=org.name if org else None,
                connection="Username-Password-Authentication",
                metadata={"auth0_id": auth0_id},
                commit=False,
            )
            logger.info("Migration email sent: %s → %s", user.email, auth0_id)
        except Exception as exc:
            results.append({"email": user.email, "status": "error", "error": str(exc)})
            logger.error("Migration failed for %s: %s", user.email, exc)

    if len(results) > 1:
        await log_activity(
            db,
            "migration.bulk",
            f"Bulk migration triggered for {len([r for r in results if r['status'] == 'email_sent'])} user(s)",
            category="migration",
            actor_email=actor_email,
            metadata={"count": len(results)},
            commit=False,
        )

    await db.commit()
    return results


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/demo", response_class=HTMLResponse, include_in_schema=False)
async def demo_home(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("demo.html", {"request": request})


@router.get("/social-login", response_class=HTMLResponse, include_in_schema=False)
async def social_login_page(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("social_login.html", {"request": request, "hide_signin": True})


@router.get("/tcs/login", response_class=HTMLResponse, include_in_schema=False)
async def tcs_login_page(request: Request) -> HTMLResponse:
    error = request.query_params.get("error")
    return templates.TemplateResponse("legacy_login.html", {
        "request": request,
        "error": error,
        "hint": "TCS Super Admin — sign in with email and password below (do not use Google for admin access).",
        "hide_signin": True,
        "hide_google": True,
        "google_login_url": "/login?connection=google-oauth2",
    })


@router.get("/org/login", response_class=HTMLResponse, include_in_schema=False)
async def org_login_redirect(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("legacy_login.html", {
        "request": request,
        "error": None,
        "hint": "Log in as an Org Admin to manage your organisation's users.",
        "hide_signin": True,
    })


@router.get("/org/dashboard", response_class=HTMLResponse, include_in_schema=False)
async def org_dashboard(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    user_id = request.session.get("legacy_user_id")
    if not user_id:
        return RedirectResponse(url="/org/login", status_code=302)

    result = await db.execute(select(PlatformUser).where(PlatformUser.id == user_id))
    admin: PlatformUser | None = result.scalar_one_or_none()
    if not admin or admin.role != "admin":
        return RedirectResponse(url="/org/login", status_code=302)

    result = await db.execute(select(Organization).where(Organization.id == admin.org_id))
    org: Organization | None = result.scalar_one_or_none()

    all_users_r = await db.execute(select(PlatformUser).where(PlatformUser.org_id == admin.org_id))
    all_users = list(all_users_r.scalars().all())

    pending = [u for u in all_users if u.status == "pending_role_assignment"]

    stats = {
        "total": len(all_users),
        "active": sum(1 for u in all_users if u.status == "active"),
        "pending": len(pending),
        "invited": sum(1 for u in all_users if u.status == "invited"),
    }

    return templates.TemplateResponse("org_dashboard.html", {
        "request": request,
        "user": admin,
        "admin": admin,
        "org": org,
        "users": [u.to_dict() for u in all_users],
        "pending_users": [u.to_dict() for u in pending],
        "stats": stats,
        "roles": ["admin", "member"],
        "active_page": "admin",
    })


TCS_ADMIN_EMAILS = {"utsav.patel@ignitedata.ai", "akash.bhandwalkar@ignitedata.ai"}


def _require_tcs_admin(request: Request) -> str | RedirectResponse:
    email = request.session.get("legacy_email")
    if email not in TCS_ADMIN_EMAILS:
        return RedirectResponse(url="/tcs/login", status_code=302)
    return email


async def _tcs_page_context(
    request: Request,
    db: AsyncSession,
    active_section: str,
) -> dict | RedirectResponse:
    auth = _require_tcs_admin(request)
    if isinstance(auth, RedirectResponse):
        return auth

    result = await db.execute(select(Organization))
    orgs = list(result.scalars().all())
    org_stats = [await _get_org_stats(db, org) for org in orgs]

    total_legacy = sum(s["legacy_total"] for s in org_stats)
    total_migrated = sum(s["migrated"] for s in org_stats)
    total_pending = sum(s["pending"] for s in org_stats)
    total_email_sent = sum(s["email_sent"] for s in org_stats)
    total_users = sum(s["total"] for s in org_stats)

    return {
        "request": request,
        "active_section": active_section,
        "tcs_email": auth,
        "auth0_domain": settings.auth0_domain,
        "auth0_client_id": settings.auth0_client_id,
        "auth0_mgmt_client_id": settings.auth0_mgmt_client_id,
        "org_stats": org_stats,
        "total_legacy": total_legacy,
        "total_migrated": total_migrated,
        "total_pending": total_pending,
        "total_email_sent": total_email_sent,
        "total_users": total_users,
        "overall_pct": round(total_migrated / total_legacy * 100) if total_legacy else 100,
    }


async def _render_tcs_page(
    request: Request,
    db: AsyncSession,
    template: str,
    active_section: str,
    extra: dict | None = None,
) -> HTMLResponse | RedirectResponse:
    ctx = await _tcs_page_context(request, db, active_section)
    if isinstance(ctx, RedirectResponse):
        return ctx
    if extra:
        ctx.update(extra)
    return templates.TemplateResponse(template, ctx)


async def _render_tcs_generic(
    request: Request,
    db: AsyncSession,
    active_section: str,
    page_title: str,
    page_description: str = "",
    panels: list | None = None,
    actions: list | None = None,
) -> HTMLResponse | RedirectResponse:
    return await _render_tcs_page(
        request, db, "tcs_generic.html", active_section,
        extra={
            "page_title": page_title,
            "page_description": page_description,
            "panels": panels or [],
            "actions": actions or [],
        },
    )


def _format_log_row(log: ActivityLog) -> dict:
    row = log.to_dict()
    row["type_label"] = event_label(log.event_type)
    row["date_display"] = log.created_at.strftime("%b %d, %Y %H:%M:%S") if log.created_at else "—"
    return row


async def _logs_page_extra(request: Request, db: AsyncSession, limit: int = 100) -> dict:
    category = request.query_params.get("category") or None
    event_type = request.query_params.get("event_type") or None
    email = request.query_params.get("email") or None
    logs = await get_activity_logs(
        db,
        limit=limit,
        category=category,
        event_type=event_type,
        actor_email=email,
    )
    return {
        "logs": [_format_log_row(l) for l in logs],
        "log_total": await count_activity_logs(db, category=category),
        "log_stats": await get_log_stats(db),
        "filter_category": category or "",
        "filter_event_type": event_type or "",
        "filter_email": email or "",
        "event_types": list(EVENT_LABELS.keys()),
        "show_filters": True,
        "refresh_url": str(request.url),
        "clear_url": request.url.path,
    }


@router.get("/tcs/dashboard", response_class=HTMLResponse, include_in_schema=False)
async def tcs_dashboard(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_page(request, db, "tcs_home.html", "home")


@router.get("/tcs/activity", response_class=HTMLResponse, include_in_schema=False)
async def tcs_activity(request: Request, db: AsyncSession = Depends(get_db)):
    extra = await _logs_page_extra(request, db, limit=20)
    return await _render_tcs_page(request, db, "tcs_activity.html", "activity", extra=extra)


@router.get("/tcs/monitoring", response_class=HTMLResponse, include_in_schema=False)
async def tcs_monitoring(request: Request, db: AsyncSession = Depends(get_db)):
    extra = await _logs_page_extra(request, db, limit=200)
    return await _render_tcs_page(request, db, "tcs_monitoring.html", "monitoring", extra=extra)


@router.get("/api/tcs/logs", summary="Activity logs JSON")
async def api_tcs_logs(
    request: Request,
    db: AsyncSession = Depends(get_db),
    limit: int = 100,
    category: Optional[str] = None,
    event_type: Optional[str] = None,
    email: Optional[str] = None,
) -> dict:
    if request.session.get("legacy_email") not in TCS_ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="TCS admin only.")
    logs = await get_activity_logs(
        db, limit=min(limit, 500), category=category, event_type=event_type, actor_email=email,
    )
    return {
        "total": await count_activity_logs(db, category=category),
        "stats": await get_log_stats(db),
        "logs": [_format_log_row(l) for l in logs],
    }


@router.get("/tcs/organizations", response_class=HTMLResponse, include_in_schema=False)
async def tcs_organizations(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_page(request, db, "tcs_organizations.html", "organizations")


@router.get("/tcs/users", response_class=HTMLResponse, include_in_schema=False)
async def tcs_users(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_page(request, db, "tcs_users.html", "users")


@router.get("/tcs/roles", response_class=HTMLResponse, include_in_schema=False)
async def tcs_roles_page(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_page(request, db, "tcs_roles.html", "roles")


@router.get("/tcs/migration", response_class=HTMLResponse, include_in_schema=False)
async def tcs_migration(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_page(request, db, "tcs_migration.html", "migration")


@router.get("/tcs/applications", response_class=HTMLResponse, include_in_schema=False)
async def tcs_applications(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_page(request, db, "tcs_applications.html", "applications")


@router.get("/tcs/authentication", response_class=HTMLResponse, include_in_schema=False)
async def tcs_authentication(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_page(request, db, "tcs_authentication.html", "authentication")


@router.get("/tcs/branding", response_class=HTMLResponse, include_in_schema=False)
async def tcs_branding(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_page(request, db, "tcs_branding.html", "branding")


@router.get("/tcs/security", response_class=HTMLResponse, include_in_schema=False)
async def tcs_security(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_page(request, db, "tcs_security.html", "security")


@router.get("/tcs/settings", response_class=HTMLResponse, include_in_schema=False)
async def tcs_settings(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_page(request, db, "tcs_settings.html", "settings")


# ---------------------------------------------------------------------------
# Auth0-parity sidebar pages (generic content + links to real features)
# ---------------------------------------------------------------------------

@router.get("/tcs/ai-agents", response_class=HTMLResponse, include_in_schema=False)
async def tcs_ai_agents(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_generic(
        request, db, "ai_agents", "AI Agents",
        "AI-powered authentication assistance — onboarding guides, anomaly detection, and integration help.",
        actions=[
            {"icon": "robot", "title": "Onboarding Guide", "text": "Step-by-step setup for Auth0 integration.", "url": "/architecture", "btn": "Start Guide"},
            {"icon": "shield-check", "title": "Security Insights", "text": "Monitor login anomalies and blocked attempts.", "url": "/tcs/security/attack-protection", "btn": "View"},
        ],
    )


@router.get("/tcs/apis", response_class=HTMLResponse, include_in_schema=False)
async def tcs_apis(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_generic(
        request, db, "apis", "APIs",
        "Auth0 APIs registered in your tenant.",
        panels=[{
            "title": "Platform API",
            "html": f'<p class="mb-2">Audience: <code>{settings.auth0_audience}</code></p>'
                    f'<p class="mb-0 small text-muted">Management API: <code>{settings.auth0_domain}/api/v2/</code></p>',
        }],
    )


@router.get("/tcs/sso", response_class=HTMLResponse, include_in_schema=False)
async def tcs_sso(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_generic(
        request, db, "sso", "SSO Integrations",
        "Social and enterprise SSO connections.",
        actions=[
            {"icon": "google", "title": "Social Login", "text": "Google, Microsoft, GitHub OAuth.", "url": "/social-login", "btn": "Try It Out"},
            {"icon": "building", "title": "Enterprise SSO", "text": "SAML / OIDC enterprise connections.", "url": "/tcs/auth/enterprise", "btn": "Configure"},
        ],
    )


@router.get("/tcs/auth/database", response_class=HTMLResponse, include_in_schema=False)
async def tcs_auth_database(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_generic(
        request, db, "auth_database", "Database",
        "Username-Password-Authentication connection enabled for all organisations.",
        panels=[{"title": "Username-Password-Authentication", "text": "Enabled on all orgs. Users set passwords via Auth0 Universal Login.", "link": {"url": "/tcs/authentication", "label": "View Connections"}}],
    )


@router.get("/tcs/auth/social", response_class=HTMLResponse, include_in_schema=False)
async def tcs_auth_social(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_generic(
        request, db, "auth_social", "Social",
        "Social identity providers connected to your tenant.",
        actions=[
            {"icon": "google", "title": "Google", "text": "google-oauth2 connection", "url": "/login?connection=google-oauth2", "btn": "Test"},
            {"icon": "github", "title": "GitHub", "text": "github connection", "url": "/social-login", "btn": "Test"},
        ],
    )


@router.get("/tcs/auth/passwordless", response_class=HTMLResponse, include_in_schema=False)
async def tcs_auth_passwordless(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_generic(
        request, db, "auth_passwordless", "Passwordless",
        "Email OTP and magic link authentication.",
        panels=[{"title": "Email OTP", "text": "Passwordless login via one-time codes.", "link": {"url": "/tcs/login", "label": "Try OTP Login"}}],
    )


@router.get("/tcs/auth/enterprise", response_class=HTMLResponse, include_in_schema=False)
async def tcs_auth_enterprise(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_generic(
        request, db, "auth_enterprise", "Enterprise",
        "SAML and OIDC enterprise connections for B2B SSO.",
        panels=[{"title": "Enterprise Connections", "text": "Configure SAML/OIDC IdPs in Auth0 Dashboard → Authentication → Enterprise. This POC uses org-scoped Auth0 Organizations.", "link": {"url": "/tcs/organizations", "label": "Manage Orgs"}}],
    )


@router.get("/tcs/branding/email", response_class=HTMLResponse, include_in_schema=False)
async def tcs_branding_email(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_generic(
        request, db, "email_templates", "Email Templates",
        "Customize invitation, verification, and password reset emails.",
        panels=[{"title": "Email Provider", "text": "Auth0 sends invitation and password reset emails. Customize templates in Auth0 Dashboard → Branding → Email Templates.", "link": {"url": "/tcs/users", "label": "Send Invitation"}}],
    )


@router.get("/tcs/security/attack-protection", response_class=HTMLResponse, include_in_schema=False)
async def tcs_attack_protection(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_generic(
        request, db, "attack_protection", "Attack Protection",
        "Brute-force protection, suspicious IP throttling, and breached password detection.",
        panels=[
            {"title": "Brute-force Protection", "text": "Enabled by Auth0 — blocks repeated failed login attempts."},
            {"title": "Breached Password Detection", "text": "Auth0 checks passwords against known breach databases."},
        ],
    )


@router.get("/tcs/actions", response_class=HTMLResponse, include_in_schema=False)
async def tcs_actions(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_generic(
        request, db, "actions", "Triggers",
        "Auth0 Actions — custom Node.js code in the auth pipeline.",
        panels=[{
            "title": "Post-Login Action",
            "html": '<p class="small text-muted mb-2">Syncs Auth0 user to platform DB via webhook after login.</p>'
                    '<code style="font-size:.75rem;">auth0_action.js</code>',
            "link": {"url": "/webhooks/idp-events", "label": "Webhook Endpoint"},
        }],
    )


@router.get("/tcs/actions/forms", response_class=HTMLResponse, include_in_schema=False)
async def tcs_action_forms(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_generic(
        request, db, "action_forms", "Forms",
        "Custom forms during login and signup flows.",
        panels=[{"title": "Login Form", "text": "Universal Login form customized via Branding.", "link": {"url": "/tcs/branding", "label": "Customize Login Box"}}],
    )


@router.get("/tcs/actions/library", response_class=HTMLResponse, include_in_schema=False)
async def tcs_action_library(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_generic(
        request, db, "action_library", "Library",
        "Pre-built Auth0 Actions from the marketplace.",
        panels=[{"title": "Custom Actions", "text": "This POC uses a custom Post-Login action to call the platform webhook.", "link": {"url": "/tcs/actions", "label": "View Triggers"}}],
    )


@router.get("/tcs/pipeline/rules", response_class=HTMLResponse, include_in_schema=False)
async def tcs_pipeline_rules(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_generic(
        request, db, "pipeline_rules", "Rules",
        "Legacy Auth0 Rules (deprecated — use Actions instead).",
        panels=[{"title": "Architecture", "text": "This POC uses Actions + Platform DB for roles/entitlements instead of Rules.", "link": {"url": "/architecture", "label": "View Architecture"}}],
    )


@router.get("/tcs/pipeline/hooks", response_class=HTMLResponse, include_in_schema=False)
async def tcs_pipeline_hooks(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_generic(
        request, db, "pipeline_hooks", "Hooks",
        "Legacy Auth0 Hooks (deprecated — use Actions instead).",
        panels=[{"title": "Webhook Integration", "text": "Platform receives IdP events via /webhooks/idp-events.", "link": {"url": "/docs", "label": "API Docs"}}],
    )


@router.get("/tcs/event-streams", response_class=HTMLResponse, include_in_schema=False)
async def tcs_event_streams(request: Request, db: AsyncSession = Depends(get_db)):
    extra = await _logs_page_extra(request, db, limit=50)
    extra["show_filters"] = False
    return await _render_tcs_page(request, db, "tcs_event_streams.html", "event_streams", extra=extra)


@router.get("/tcs/monitoring/streams", response_class=HTMLResponse, include_in_schema=False)
async def tcs_monitoring_streams(request: Request, db: AsyncSession = Depends(get_db)):
    extra = await _logs_page_extra(request, db, limit=50)
    extra["filter_category"] = "auth"
    extra["show_filters"] = False
    logs = await get_activity_logs(db, limit=50, category="auth")
    extra["logs"] = [_format_log_row(l) for l in logs]
    return await _render_tcs_page(request, db, "tcs_monitoring_streams.html", "monitoring_streams", extra=extra)


@router.get("/tcs/marketplace", response_class=HTMLResponse, include_in_schema=False)
async def tcs_marketplace(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_generic(
        request, db, "marketplace", "Marketplace",
        "Third-party integrations and extensions for Auth0.",
        actions=[
            {"icon": "google", "title": "Social Connections", "text": "Add Google, GitHub, Microsoft.", "url": "/tcs/auth/social", "btn": "Browse"},
            {"icon": "shield", "title": "Security Add-ons", "text": "MFA, attack protection.", "url": "/tcs/security", "btn": "Browse"},
        ],
    )


@router.get("/tcs/extensions", response_class=HTMLResponse, include_in_schema=False)
async def tcs_extensions(request: Request, db: AsyncSession = Depends(get_db)):
    return await _render_tcs_generic(
        request, db, "extensions", "Extensions",
        "Auth0 Extensions for custom integrations.",
        panels=[{"title": "Platform Extensions", "text": "This POC extends Auth0 with a Platform Backend for roles, entitlements, and subscriptions.", "link": {"url": "/architecture", "label": "Learn More"}}],
    )


@router.get("/api/tcs/status", summary="Migration status across all orgs")
async def tcs_status(db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(Organization))
    orgs = list(result.scalars().all())
    org_stats = [await _get_org_stats(db, org) for org in orgs]
    return {"organisations": org_stats}


@router.post("/api/tcs/migrate/org/{org_id}", summary="Migrate all pending users in one org")
async def migrate_org(
    org_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(PlatformUser).where(
            PlatformUser.org_id == org_id,
            PlatformUser.password_hash.isnot(None),
            PlatformUser.idp_sub.is_(None),
            PlatformUser.migration_status == MigrationStatus.PENDING,
        )
    )
    users = list(result.scalars().all())
    results = await _migrate_users(db, users, actor_email=request.session.get("legacy_email"))
    return {
        "org_id": org_id,
        "processed": len(results),
        "results": results,
    }


@router.post("/api/tcs/migrate/all", summary="Migrate ALL pending legacy users across ALL orgs")
async def migrate_all(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(
        select(PlatformUser).where(
            PlatformUser.password_hash.isnot(None),
            PlatformUser.idp_sub.is_(None),
            PlatformUser.migration_status == MigrationStatus.PENDING,
        )
    )
    users = list(result.scalars().all())
    results = await _migrate_users(db, users, actor_email=request.session.get("legacy_email"))

    sent = [r for r in results if r["status"] == "email_sent"]
    errors = [r for r in results if r["status"] == "error"]

    return {
        "message": f"Migration triggered for {len(sent)} user(s) across all organisations.",
        "total_processed": len(results),
        "emails_sent": len(sent),
        "errors": len(errors),
        "results": results,
    }


# ---------------------------------------------------------------------------
# Organisation management — create & delete in Auth0 + platform DB
# ---------------------------------------------------------------------------

import re
from pydantic import BaseModel

class CreateOrgRequest(BaseModel):
    name: str
    display_name: str = ""


@router.post("/api/tcs/orgs", summary="Create a new organisation in Auth0 + platform DB")
async def create_org(body: CreateOrgRequest, db: AsyncSession = Depends(get_db)) -> dict:
    token = await _mgmt_token()

    # Slug: lowercase, replace spaces with hyphens
    slug = re.sub(r"[^a-z0-9-]", "", body.name.lower().replace(" ", "-"))
    display = body.display_name or body.name

    async with httpx.AsyncClient(timeout=15) as c:
        # Create org in Auth0
        r = await c.post(
            f"https://{settings.auth0_domain}/api/v2/organizations",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": slug, "display_name": display},
        )
        if r.status_code not in (200, 201):
            raise HTTPException(status_code=r.status_code, detail=f"Auth0 error: {r.text}")
        auth0_org = r.json()
        auth0_org_id = auth0_org["id"]

        # Enable Username-Password-Authentication connection
        cr = await c.get(
            f"https://{settings.auth0_domain}/api/v2/connections",
            headers={"Authorization": f"Bearer {token}"},
            params={"name": "Username-Password-Authentication", "fields": "id"},
        )
        if cr.status_code == 200 and cr.json():
            conn_id = cr.json()[0]["id"]
            await c.post(
                f"https://{settings.auth0_domain}/api/v2/organizations/{auth0_org_id}/enabled_connections",
                headers={"Authorization": f"Bearer {token}"},
                json={"connection_id": conn_id, "assign_membership_on_login": False},
            )

    # Save to platform DB
    org_db_id = f"org_{slug}"
    new_org = Organization(id=org_db_id, name=display, auth0_org_id=auth0_org_id)
    db.add(new_org)
    await db.commit()

    await log_activity(
        db,
        "org.created",
        f"Organisation '{display}' created",
        category="org",
        org_id=org_db_id,
        org_name=display,
        metadata={"auth0_org_id": auth0_org_id},
    )

    logger.info("Created org: %s (%s)", display, auth0_org_id)
    return {"message": f"Organisation '{display}' created.", "org_id": org_db_id, "auth0_org_id": auth0_org_id}


@router.delete("/api/tcs/orgs/{org_id}", summary="Delete an organisation from Auth0 + platform DB")
async def delete_org(org_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail=f"Organisation '{org_id}' not found.")

    # Delete from Auth0 if linked
    if org.auth0_org_id:
        token = await _mgmt_token()
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.delete(
                f"https://{settings.auth0_domain}/api/v2/organizations/{org.auth0_org_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            if r.status_code not in (200, 204):
                raise HTTPException(status_code=r.status_code, detail=f"Auth0 error: {r.text}")

    org_name = org.name
    auth0_org_id = org.auth0_org_id
    await db.delete(org)
    await db.commit()

    await log_activity(
        db,
        "org.deleted",
        f"Organisation '{org_name}' deleted",
        category="org",
        org_id=org_id,
        org_name=org_name,
    )

    logger.info("Deleted org: %s (%s)", org_name, auth0_org_id)
    return {"message": f"Organisation '{org_name}' deleted.", "org_id": org_id}


# ---------------------------------------------------------------------------
# Role management — create, list, delete, assign via Auth0 RBAC
# ---------------------------------------------------------------------------

class CreateRoleRequest(BaseModel):
    name: str
    description: str = ""


class AssignRoleRequest(BaseModel):
    user_id: str       # platform user ID
    role_id: str       # Auth0 role ID


@router.get("/api/tcs/roles", summary="List all Auth0 roles")
async def list_roles() -> dict:
    token = await _mgmt_token()
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            f"https://{settings.auth0_domain}/api/v2/roles",
            headers={"Authorization": f"Bearer {token}"},
        )
        r.raise_for_status()
    return {"roles": r.json()}


@router.post("/api/tcs/roles", summary="Create a role in Auth0")
async def create_role(body: CreateRoleRequest) -> dict:
    token = await _mgmt_token()
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            f"https://{settings.auth0_domain}/api/v2/roles",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": body.name, "description": body.description},
        )
        if r.status_code not in (200, 201):
            raise HTTPException(status_code=r.status_code, detail=f"Auth0 error: {r.text}")
        role = r.json()
    logger.info("Created Auth0 role: %s (%s)", body.name, role.get("id"))
    return {"message": f"Role '{body.name}' created in Auth0.", "role": role}


@router.delete("/api/tcs/roles/{role_id}", summary="Delete a role from Auth0")
async def delete_role(role_id: str) -> dict:
    token = await _mgmt_token()
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.delete(
            f"https://{settings.auth0_domain}/api/v2/roles/{role_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        if r.status_code not in (200, 204):
            raise HTTPException(status_code=r.status_code, detail=f"Auth0 error: {r.text}")
    logger.info("Deleted Auth0 role: %s", role_id)
    return {"message": f"Role '{role_id}' deleted from Auth0."}


@router.post("/api/tcs/roles/assign", summary="Assign Auth0 role to a user")
async def assign_auth0_role(body: AssignRoleRequest, db: AsyncSession = Depends(get_db)) -> dict:
    # Get platform user
    result = await db.execute(select(PlatformUser).where(PlatformUser.id == body.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if not user.idp_sub:
        raise HTTPException(status_code=400, detail="User has no Auth0 account yet. Migrate first.")

    token = await _mgmt_token()
    async with httpx.AsyncClient(timeout=15) as c:
        # Assign role in Auth0
        r = await c.post(
            f"https://{settings.auth0_domain}/api/v2/users/{user.idp_sub}/roles",
            headers={"Authorization": f"Bearer {token}"},
            json={"roles": [body.role_id]},
        )
        if r.status_code not in (200, 204):
            raise HTTPException(status_code=r.status_code, detail=f"Auth0 error: {r.text}")

        # Get role name
        rr = await c.get(
            f"https://{settings.auth0_domain}/api/v2/roles/{body.role_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        role_name = rr.json().get("name", body.role_id) if rr.status_code == 200 else body.role_id

    # Also update platform DB
    user.role = role_name
    db.add(user)
    await db.commit()

    org_r = await db.execute(select(Organization).where(Organization.id == user.org_id))
    org = org_r.scalar_one_or_none()
    await log_activity(
        db,
        "user.role_assigned",
        f"Role '{role_name}' assigned to {user.email}",
        category="user",
        actor_email=None,
        target_email=user.email,
        org_id=user.org_id,
        org_name=org.name if org else None,
        metadata={"role": role_name, "auth0_role_id": body.role_id},
    )

    logger.info("Assigned role '%s' to user %s in Auth0 + platform DB", role_name, user.email)
    return {
        "message": f"Role '{role_name}' assigned to {user.email} in Auth0 and platform DB.",
        "user": user.email,
        "role": role_name,
    }

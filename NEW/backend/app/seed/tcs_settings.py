"""Default platform settings and demo audit logs."""
from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.shared.models import AuditLog, TcsPlatformSettings

DEMO_LOGS = [
    (None, "utsav.patel@ignitedata.ai", "security.update", "platform_settings", "1", "Passwordless OTP enabled"),
    (1, "utsav.patel@ignitedata.ai", "user.invite", "user", "51", "Invitation sent to utsavpatel8696@gmail.com"),
    (1, "system", "org.create", "organization", "5", "Sub-organization Cedar Ridge Care Center created"),
    (1, "utsav.patel@ignitedata.ai", "role.update", "role", "administrator", "Updated Administrator permissions"),
    (None, "system", "auth.login", "tcs_staff", "1", "TCS admin console login"),
]


async def ensure_tcs_platform_bootstrap() -> None:
    async with SessionLocal() as db:
        if not (await db.execute(select(TcsPlatformSettings).where(TcsPlatformSettings.id == 1))).scalars().first():
            db.add(TcsPlatformSettings(id=1, mfa_enabled=False, passwordless_enabled=True))
        count = (await db.execute(select(func.count()).select_from(AuditLog))).scalar_one()
        if count == 0:
            for org_id, actor, action, entity_type, entity_id, details in DEMO_LOGS:
                db.add(
                    AuditLog(
                        org_id=org_id,
                        actor=actor,
                        action=action,
                        entity_type=entity_type,
                        entity_id=entity_id,
                        details=details,
                    )
                )
        await db.commit()

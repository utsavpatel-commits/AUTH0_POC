from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import Persona, get_persona
from app.shared.models import Facility, Notification, Org, User

router = APIRouter(prefix="/api", tags=["shared"])


@router.get("/orgs")
async def list_orgs(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Org).order_by(Org.name))).scalars().all()
    return [
        {"id": o.id, "name": o.name, "is_corporate": o.is_corporate, "tier": o.tier}
        for o in rows
    ]


@router.get("/facilities")
async def list_facilities(
    org_id: int | None = None, db: AsyncSession = Depends(get_db)
):
    q = select(Facility).order_by(Facility.name)
    if org_id:
        q = q.where(Facility.org_id == org_id)
    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "id": f.id,
            "org_id": f.org_id,
            "name": f.name,
            "city": f.city,
            "state": f.state,
            "beds": f.beds,
        }
        for f in rows
    ]


@router.get("/users")
async def list_users(
    facility_id: int | None = None,
    profile: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(User).where(User.is_active.is_(True)).order_by(User.name)
    if facility_id:
        q = q.where(User.facility_id == facility_id)
    if profile and profile != "all":
        q = q.where(User.profile == profile)
    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "profile": u.profile,
            "job_title": u.job_title,
            "facility_id": u.facility_id,
        }
        for u in rows
    ]


@router.get("/notifications")
async def list_notifications(
    facility_id: int | None = None, user_id: int | None = None, db: AsyncSession = Depends(get_db)
):
    q = select(Notification).order_by(Notification.created_at.desc()).limit(50)
    if user_id:
        q = q.where(
            (Notification.user_id == user_id) | (Notification.user_id.is_(None))
        )
    if facility_id:
        q = q.where(Notification.facility_id == facility_id)
    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "id": n.id,
            "title": n.title,
            "body": n.body,
            "kind": n.kind,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in rows
    ]


@router.post("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: int, db: AsyncSession = Depends(get_db)):
    n = await db.get(Notification, notif_id)
    if n:
        n.is_read = True
    return {"ok": True}


@router.post("/notifications/read-all")
async def mark_all_read(facility_id: int | None = None, db: AsyncSession = Depends(get_db)):
    q = select(Notification).where(Notification.is_read.is_(False))
    if facility_id:
        q = q.where((Notification.facility_id == facility_id) | (Notification.facility_id.is_(None)))
    for n in (await db.execute(q)).scalars().all():
        n.is_read = True
    return {"ok": True}


@router.get("/me")
async def whoami(persona: Persona = Depends(get_persona)):
    return {
        "role": persona.role,
        "facility_id": persona.facility_id,
        "org_id": persona.org_id,
        "is_tcs": persona.is_tcs,
        "is_corporate": persona.is_corporate,
    }

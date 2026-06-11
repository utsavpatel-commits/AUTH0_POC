from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.modules.lms.models import TrainingAssignment
from app.modules.survey.models import CaseFinding, PlanOfCorrection
from app.shared.models import Facility


def _readiness(completion_rate: int, open_findings: int) -> int:
    """A simple composite readiness score: training completion minus finding drag."""
    score = completion_rate - open_findings * 4
    return max(0, min(100, score))


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


async def _facility_metrics(db: AsyncSession, facility_id: int) -> dict:
    # Training
    tq = (
        select(TrainingAssignment.status, func.count())
        .where(TrainingAssignment.facility_id == facility_id)
        .group_by(TrainingAssignment.status)
    )
    counts = {s: n for s, n in (await db.execute(tq)).all()}
    total = sum(counts.values())
    completed = counts.get("completed", 0)
    completion_rate = round(100 * completed / total) if total else 0

    # Findings
    open_findings = (
        await db.execute(
            select(func.count())
            .select_from(CaseFinding)
            .where(CaseFinding.facility_id == facility_id, CaseFinding.status != "resolved")
        )
    ).scalar() or 0
    open_pocs = (
        await db.execute(
            select(func.count())
            .select_from(PlanOfCorrection)
            .where(
                PlanOfCorrection.facility_id == facility_id,
                PlanOfCorrection.status != "closed",
            )
        )
    ).scalar() or 0

    return {
        "training_total": total,
        "training_completed": completed,
        "completion_rate": completion_rate,
        "overdue": counts.get("overdue", 0),
        "open_findings": open_findings,
        "open_pocs": open_pocs,
        "readiness_score": _readiness(completion_rate, open_findings),
    }


@router.get("/facility/{facility_id}")
async def facility_dashboard(facility_id: int, db: AsyncSession = Depends(get_db)):
    fac = await db.get(Facility, facility_id)
    metrics = await _facility_metrics(db, facility_id)
    # Top F-tags at this facility
    ft = (
        await db.execute(
            select(CaseFinding.ftag, CaseFinding.ftag_title, func.count())
            .where(CaseFinding.facility_id == facility_id)
            .group_by(CaseFinding.ftag, CaseFinding.ftag_title)
            .order_by(func.count().desc())
        )
    ).all()
    return {
        "facility": fac.name if fac else None,
        "facility_id": facility_id,
        **metrics,
        "top_ftags": [{"ftag": f, "title": t, "count": n} for f, t, n in ft],
    }


@router.get("/portfolio")
async def portfolio(org_id: int | None = None, db: AsyncSession = Depends(get_db)):
    """Corporate roll-up — ranked facilities with the outlier surfaced."""
    q = select(Facility).order_by(Facility.name)
    if org_id:
        q = q.where(Facility.org_id == org_id)
    facilities = (await db.execute(q)).scalars().all()
    rows = []
    for f in facilities:
        m = await _facility_metrics(db, f.id)
        rows.append(
            {
                "facility_id": f.id,
                "facility": f.name,
                "city": f.city,
                "state": f.state,
                **m,
            }
        )
    rows.sort(key=lambda r: r["readiness_score"])
    avg = round(sum(r["readiness_score"] for r in rows) / len(rows)) if rows else 0
    outlier = rows[0] if rows else None
    return {
        "portfolio_score": avg,
        "facility_count": len(rows),
        "ready_count": sum(1 for r in rows if r["readiness_score"] >= 80),
        "outlier": outlier,
        "facilities": sorted(rows, key=lambda r: r["readiness_score"], reverse=True),
    }

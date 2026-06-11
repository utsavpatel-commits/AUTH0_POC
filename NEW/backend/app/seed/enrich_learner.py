"""Enrich the demo learner with a rich, varied training load so the My Learning
screen shows a realistic experience (multiple statuses, spread due dates, recent
assignment). Idempotent — safe to re-run; it only tops up to the target set."""
import asyncio
from datetime import date, datetime, timedelta

from sqlalchemy import select

from app.core.db import SessionLocal, create_all
from app.modules.lms.models import CourseMaterial, TrainingAssignment, TrainingCourse
from app.shared.models import Facility, Notification, User

TARGET_FACILITIES = [1, 4]  # Cedar Ridge (corporate) + Bayview (independent); Memphis(3) left as the low outlier


async def enrich() -> None:
    await create_all()
    async with SessionLocal() as db:
        today = date.today()
        # status plan: course offset -> (status, due offset days, completed offset)
        # completed dates run today, -1, -2, -3 so the learner has a 4-day streak.
        plan = [
            ("completed", -2, 0),
            ("completed", -5, -1),
            ("completed", -10, -2),
            ("completed", -20, -3),
            ("in_progress", 5, None),
            ("in_progress", 9, None),
            ("assigned", 2, None),   # due very soon -> red
            ("assigned", 6, None),   # due this week -> amber
            ("assigned", 25, None),  # plenty of time -> normal
            ("assigned", 40, None),
            ("overdue", -3, None),
            ("overdue", -8, None),
            ("assigned", 1, None),   # recent assign -> "new this week"
        ]

        for fid in TARGET_FACILITIES:
            learner = (
                await db.execute(
                    select(User)
                    .where(User.facility_id == fid, User.role == "end_user")
                    .order_by(User.name)  # match the frontend's representative-learner pick
                )
            ).scalars().first()
            if not learner:
                learner = (await db.execute(select(User).where(User.facility_id == fid))).scalars().first()
            if not learner:
                continue

            existing = (
                await db.execute(
                    select(TrainingAssignment).where(TrainingAssignment.user_id == learner.id)
                )
            ).scalars().all()
            # If already enriched (>=12 assignments), skip.
            if len(existing) >= 12:
                continue

            # this facility's own course library (tenant-scoped)
            catalog = (
                await db.execute(
                    select(TrainingCourse).where(
                        TrainingCourse.owner_facility_id == fid, TrainingCourse.is_active.is_(True)
                    )
                )
            ).scalars().all()
            if not catalog:
                continue

            for i, (status, due_off, comp_off) in enumerate(plan):
                course = catalog[i % len(catalog)]
                a = TrainingAssignment(
                    course_id=course.id,
                    user_id=learner.id,
                    facility_id=fid,
                    assigned_by="Staff Educator",
                    source="poc" if i % 3 == 0 else "manual",
                    status=status,
                    assigned_date=today - timedelta(days=abs(due_off) + 5),
                    due_date=today + timedelta(days=due_off),
                    completed_date=(today + timedelta(days=comp_off)) if comp_off is not None else None,
                    score=94 if status == "completed" else None,
                )
                db.add(a)

            # Multi-version demo (Cedar Ridge only): one course completed at BOTH v1 and v2,
            # so the learner's Transcript groups two earned certificates under one course.
            if fid == 1:
                hipaa = next((c for c in catalog if c.title == "HIPAA & Privacy"), None)
                if hipaa:
                    hipaa.version = 2
                    await db.flush()
                    # clear any plan-generated HIPAA assignments for this learner so the
                    # multi-version story is clean (only the two completed versions below)
                    for a in (await db.execute(select(TrainingAssignment).where(
                        TrainingAssignment.user_id == learner.id, TrainingAssignment.course_id == hipaa.id
                    ))).scalars().all():
                        await db.delete(a)
                    for m in (await db.execute(select(CourseMaterial).where(CourseMaterial.course_id == hipaa.id))).scalars().all():
                        m.is_active = False
                    db.add(CourseMaterial(course_id=hipaa.id, facility_id=fid, file_name="HIPAA & Privacy (rev 2025).pdf",
                                          file_format="pdf", size_kb=455, version=2, is_active=True, uploaded_by="Staff Educator"))
                    db.add(TrainingAssignment(course_id=hipaa.id, user_id=learner.id, facility_id=fid, course_version=1,
                                              status="completed", assigned_by="Staff Educator", source="manual",
                                              assigned_date=today - timedelta(days=400), due_date=today - timedelta(days=380),
                                              completed_date=today - timedelta(days=385), score=95))
                    db.add(TrainingAssignment(course_id=hipaa.id, user_id=learner.id, facility_id=fid, course_version=2,
                                              status="completed", assigned_by="Staff Educator", source="manual",
                                              assigned_date=today - timedelta(days=20), due_date=today + timedelta(days=10),
                                              completed_date=today - timedelta(days=5), score=97))

            # Keep the VIDEO course (Hand Hygiene & PPE) OPEN for the demo learner so the
            # in-player YouTube experience is immediately demoable.
            if fid == 1:
                hand = next((c for c in catalog if c.title == "Hand Hygiene & PPE"), None)
                if hand:
                    await db.flush()
                    for a in (await db.execute(select(TrainingAssignment).where(
                        TrainingAssignment.user_id == learner.id, TrainingAssignment.course_id == hand.id
                    ))).scalars().all():
                        await db.delete(a)
                    db.add(TrainingAssignment(course_id=hand.id, user_id=learner.id, facility_id=fid, course_version=1,
                                              status="in_progress", assigned_by="Staff Educator", source="manual",
                                              assigned_date=today - timedelta(days=4), due_date=today + timedelta(days=6)))

            # a recent assignment notification ("new this week") — only if absent
            existing_notif = (
                await db.execute(
                    select(Notification).where(
                        Notification.facility_id == fid,
                        Notification.kind == "training_due",
                    )
                )
            ).scalars().first()
            if not existing_notif:
                db.add(Notification(
                    user_id=learner.id, facility_id=fid,
                    title="New training assigned",
                    body="Hand Hygiene & PPE was just assigned to you — due this week.",
                    kind="training_due",
                ))

        await db.commit()
        print("Learner enrichment complete.")


if __name__ == "__main__":
    asyncio.run(enrich())

"""Café -> LMS version propagation.

When a Document Café policy publishes a new version, any course that uses that
policy as its training material must roll forward automatically: a new course
version, open assignments carried to it, and prior completers re-assigned to
re-acknowledge (their earlier completion + certificate are preserved). This mirrors
the in-LMS document-replace behaviour so both authoring paths version identically.
"""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.lms.models import CourseMaterial, TrainingAssignment, TrainingCourse


async def propagate_cafe_version(
    db: AsyncSession, *, document_id: int, new_version: int, doc_title: str, actor: str | None = None
) -> int:
    """Roll every course linked to this Café document onto the new version.
    Returns the number of courses bumped."""
    mats = (await db.execute(
        select(CourseMaterial).where(
            CourseMaterial.cafe_document_id == document_id, CourseMaterial.is_active.is_(True)
        )
    )).scalars().all()
    bumped = 0
    for old in mats:
        course = await db.get(TrainingCourse, old.course_id)
        if not course:
            continue
        version = course.version + 1
        old.is_active = False
        course.version = version
        rows = (await db.execute(
            select(TrainingAssignment).where(TrainingAssignment.course_id == course.id)
        )).scalars().all()
        completed: dict[tuple[int, int | None], str] = {}
        for a in rows:
            if a.status == "completed":
                completed[(a.user_id, a.facility_id)] = a.source or "manual"
            elif a.course_version < version:
                a.course_version = version
        # Re-assign prior completers to re-acknowledge the new version, preserving the
        # original source (Assigned / POC) — the Café update doesn't change who triggered it.
        for (uid, fid), src in completed.items():
            db.add(TrainingAssignment(
                course_id=course.id, user_id=uid, facility_id=fid, course_version=version,
                status="assigned", source=src, assigned_by="Document Café (policy update)",
                due_date=date.today() + timedelta(days=30),
            ))
        db.add(CourseMaterial(
            course_id=course.id, facility_id=old.facility_id, kind="document",
            file_name=f"{doc_title} (v{new_version})", file_format="pdf",
            cafe_document_id=document_id, cafe_version=new_version, version=version,
            is_active=True, uploaded_by=actor or "Document Café",
        ))
        bumped += 1
    return bumped

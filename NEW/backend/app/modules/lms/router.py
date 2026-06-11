import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.modules.lms.models import (
    Certification,
    CourseMaterial,
    LmsProgram,
    TrainingAssignment,
    TrainingCourse,
)
from app.services.tcs_auth_service import lookup_tcs_staff
from app.shared.models import Facility, User

router = APIRouter(prefix="/api/lms", tags=["lms"])


def _s(text: str) -> str:
    """Make any string safe for fpdf's built-in Latin-1 fonts (e.g. em-dashes)."""
    if text is None:
        return ""
    return (
        str(text)
        .replace("—", "-")
        .replace("–", "-")
        .replace("‘", "'")
        .replace("’", "'")
        .replace("“", '"')
        .replace("”", '"')
        .encode("latin-1", "replace")
        .decode("latin-1")
    )


# ---- Courses ------------------------------------------------------------------
@router.get("/courses")
async def list_courses(
    facility_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """The facility's course library. Each facility is a tenant — courses are
    customer-authored and scoped to the facility (no shared/TCS library)."""
    q = select(TrainingCourse).where(TrainingCourse.is_active.is_(True))
    if facility_id:
        q = q.where(TrainingCourse.owner_facility_id == facility_id)
    rows = (await db.execute(q.order_by(TrainingCourse.title))).scalars().all()

    # active-material counts + the active material's kind (document/video) per course.
    active_mats = (await db.execute(
        select(CourseMaterial.course_id, CourseMaterial.kind).where(CourseMaterial.is_active.is_(True))
    )).all()
    mcount: dict[int, int] = {}
    mkind: dict[int, str] = {}
    for cid, kind in active_mats:
        mcount[cid] = mcount.get(cid, 0) + 1
        mkind.setdefault(cid, kind)
    acount = dict(
        (await db.execute(
            select(TrainingAssignment.course_id, func.count()).group_by(TrainingAssignment.course_id)
        )).all()
    )
    return [
        {
            "id": c.id,
            "title": c.title,
            "description": c.description,
            "training_type": c.training_type,
            "duration_hours": c.duration_hours,
            "target_profile": c.target_profile,
            "program": c.program,
            "version": c.version,
            "material_count": mcount.get(c.id, 0),
            "material_kind": mkind.get(c.id),  # 'document' | 'video' | None
            "assignment_count": acount.get(c.id, 0),  # for delete-guard only (not shown as completion)
        }
        for c in rows
    ]


class CourseIn(BaseModel):
    title: str
    description: str | None = None
    training_type: str = "mandatory_annual"
    duration_hours: float = 1.0
    owner_facility_id: int | None = None
    target_profile: str | None = None
    program: str = "uncategorized"


@router.post("/courses")
async def create_course(payload: CourseIn, db: AsyncSession = Depends(get_db)):
    c = TrainingCourse(**payload.model_dump(), owner_type="customer")
    db.add(c)
    await db.flush()
    return {"id": c.id}


@router.delete("/courses/{course_id}")
async def delete_course(course_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a course — only allowed when no training has been assigned from it
    (audit-defense: never orphan a learner's training record)."""
    c = await db.get(TrainingCourse, course_id)
    if not c:
        raise HTTPException(404, "course not found")
    n = (await db.execute(
        select(func.count()).select_from(TrainingAssignment).where(TrainingAssignment.course_id == course_id)
    )).scalar() or 0
    if n > 0:
        raise HTTPException(409, f"course has {n} assignment(s) — cannot delete; deactivate instead")
    # remove its materials, then the course
    for m in (await db.execute(select(CourseMaterial).where(CourseMaterial.course_id == course_id))).scalars().all():
        await db.delete(m)
    await db.delete(c)
    return {"ok": True}


# ---- Learner roster (User Management within LMS) ------------------------------
# Frontline learners don't otherwise use the platform: an admin uploads them, they
# get an email code, sign in, and take their assigned training. Facility-scoped.
@router.get("/learners")
async def list_learners(facility_id: int, db: AsyncSession = Depends(get_db)):
    users = (
        await db.execute(
            select(User)
            .where(User.facility_id == facility_id, User.role == "end_user", User.is_active.is_(True))
            .order_by(User.name)
        )
    ).scalars().all()
    counts = dict(
        (await db.execute(
            select(TrainingAssignment.user_id, func.count())
            .where(TrainingAssignment.facility_id == facility_id)
            .group_by(TrainingAssignment.user_id)
        )).all()
    )
    done = dict(
        (await db.execute(
            select(TrainingAssignment.user_id, func.count())
            .where(TrainingAssignment.facility_id == facility_id, TrainingAssignment.status == "completed")
            .group_by(TrainingAssignment.user_id)
        )).all()
    )
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "job_title": u.job_title,
            "profile": u.profile,
            "status": "invited" if u.temp_token else "active",
            "temp_token": u.temp_token,  # demo only — surfaces the one-time code
            "assigned": counts.get(u.id, 0),
            "completed": done.get(u.id, 0),
        }
        for u in users
    ]


class LearnerIn(BaseModel):
    name: str
    email: str
    job_title: str | None = None
    profile: str = "all"


class LearnerBulkIn(BaseModel):
    facility_id: int
    learners: list[LearnerIn]


@router.post("/learners")
async def add_learners(payload: LearnerBulkIn, db: AsyncSession = Depends(get_db)):
    """Bulk-add frontline learners (roster upload). Each gets a one-time email code."""
    fac = await db.get(Facility, payload.facility_id)
    org_id = fac.org_id if fac else None
    created = []
    for L in payload.learners:
        email = L.email.strip().lower()
        if not email:
            continue
        exists = (await db.execute(
            select(User).where(User.facility_id == payload.facility_id, func.lower(User.email) == email)
        )).scalars().first()
        if exists:
            continue
        u = User(
            org_id=org_id, facility_id=payload.facility_id, name=L.name.strip() or email,
            email=email, role="end_user", profile=L.profile or "all", job_title=L.job_title,
            temp_token=uuid.uuid4().hex[:8].upper(), is_active=True,
        )
        db.add(u)
        created.append(u)
    await db.flush()
    return {"created": [{"id": u.id, "name": u.name, "email": u.email, "temp_token": u.temp_token} for u in created]}


@router.delete("/learners/{user_id}")
async def remove_learner(user_id: int, db: AsyncSession = Depends(get_db)):
    u = await db.get(User, user_id)
    if not u or u.role != "end_user":
        raise HTTPException(404, "learner not found")
    for a in (await db.execute(select(TrainingAssignment).where(TrainingAssignment.user_id == user_id))).scalars().all():
        await db.delete(a)
    await db.delete(u)
    return {"ok": True}


@router.post("/learners/{user_id}/resend")
async def resend_invite(user_id: int, db: AsyncSession = Depends(get_db)):
    u = await db.get(User, user_id)
    if not u or u.role != "end_user":
        raise HTTPException(404, "learner not found")
    u.temp_token = uuid.uuid4().hex[:8].upper()
    await db.flush()
    return {"id": u.id, "temp_token": u.temp_token}


# ---- Demo auth lookup ---------------------------------------------------------
@router.get("/login-lookup")
async def login_lookup(login_id: str, db: AsyncSession = Depends(get_db)):
    """Step 1 of the two-step login: given an email/login id, return how this user
    signs in. Frontline learners → one-time email code; everyone else → password."""
    email = login_id.strip().lower()

    staff = await lookup_tcs_staff(db, email)
    if staff and staff.is_active:
        return {
            "found": True,
            "name": staff.name,
            "role": staff.role,
            "auth_mode": "password",
            "tcs_console": True,
            "auth0_password": True,
        }

    u = (await db.execute(select(User).where(func.lower(User.email) == email))).scalars().first()
    if not u:
        return {"found": False}
    from app.services.tcs_platform_settings import mfa_active, passwordless_active

    pwless_on = await passwordless_active(db, u.org_id)
    mfa_on = await mfa_active(db, u.org_id)
    auth_mode = "code" if u.role == "end_user" else "password"
    return {
        "found": True,
        "user_id": u.id,
        "name": u.name,
        "role": u.role,
        "facility_id": u.facility_id,
        "org_id": u.org_id,
        "auth_mode": auth_mode,
        "temp_token": None if (auth_mode == "code" and pwless_on) else u.temp_token,
        "auth0_otp": auth_mode == "code" and pwless_on,
        "auth0_password": auth_mode == "password",
        "mfa_required": mfa_on and auth_mode == "password",
    }


class PlatformLoginBody(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


@router.post("/auth/login")
async def platform_login(body: PlatformLoginBody, db: AsyncSession = Depends(get_db)):
    from app.services.user_auth_service import login_platform_user

    try:
        user = await login_platform_user(db, body.email, body.password)
    except ValueError as exc:
        raise HTTPException(401, str(exc)) from exc
    if user.role != "end_user":
        user.password_set = True
        if user.org_id:
            from app.shared.models import OrgInvitation

            inv = (
                await db.execute(
                    select(OrgInvitation).where(
                        OrgInvitation.org_id == user.org_id,
                        func.lower(OrgInvitation.email) == body.email,
                        OrgInvitation.status.in_(("pending", "sent")),
                    )
                )
            ).scalars().first()
            if inv:
                inv.status = "accepted"
        await db.commit()
    return {
        "ok": True,
        "user_id": user.id,
        "name": user.name,
        "role": user.role,
        "org_id": user.org_id,
        "facility_id": user.facility_id,
    }


# ---- Course material ----------------------------------------------------------
ALLOWED_MATERIAL = {"pdf", "docx", "pptx", "mp4", "scorm", "zip"}


@router.get("/courses/{course_id}/materials")
async def list_materials(course_id: int, db: AsyncSession = Depends(get_db)):
    """All document versions for a course, newest first. Each row carries its
    version + active flag so the UI can show history and toggle old versions."""
    rows = (
        await db.execute(
            select(CourseMaterial)
            .where(CourseMaterial.course_id == course_id)
            .order_by(CourseMaterial.version.desc(), CourseMaterial.created_at.desc())
        )
    ).scalars().all()
    return [
        {
            "id": m.id,
            "kind": m.kind,
            "file_name": m.file_name,
            "file_format": m.file_format,
            "url": m.url,
            "size_kb": m.size_kb,
            "version": m.version,
            "is_active": m.is_active,
            "uploaded_by": m.uploaded_by,
            "cafe_document_id": m.cafe_document_id,
            "cafe_version": m.cafe_version,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in rows
    ]


async def _next_version(db: AsyncSession, course_id: int) -> int:
    cur = (await db.execute(
        select(func.max(CourseMaterial.version)).where(CourseMaterial.course_id == course_id)
    )).scalar()
    return (cur or 0) + 1


async def _publish_material(db: AsyncSession, course: TrainingCourse, *, kind: str, file_name: str,
                            file_format: str, url: str | None, size_kb: int, replace: bool,
                            uploaded_by: str | None, facility_id: int | None, data: bytes | None = None,
                            cafe_document_id: int | None = None, cafe_version: int | None = None):
    """Create a new material version. With replace=true: supersede current active
    versions, bump the course version, carry open assignments forward, and re-assign
    completers to re-acknowledge (preserving their prior completion + certificate)."""
    version = await _next_version(db, course.id)
    reassigned = 0
    if replace:
        for old in (await db.execute(
            select(CourseMaterial).where(CourseMaterial.course_id == course.id, CourseMaterial.is_active.is_(True))
        )).scalars().all():
            old.is_active = False
        course.version = version
        rows = (await db.execute(
            select(TrainingAssignment).where(TrainingAssignment.course_id == course.id)
        )).scalars().all()
        completed_users: dict[tuple[int, int | None], str] = {}
        for a in rows:
            if a.status == "completed":
                completed_users[(a.user_id, a.facility_id)] = a.source or "manual"
            elif a.course_version < version:
                a.course_version = version
        # Re-assign prior completers to re-acknowledge the new version. Preserve the
        # original source (Assigned / POC); flag the re-acknowledgement via assigned_by.
        for (uid, fid), src in completed_users.items():
            db.add(TrainingAssignment(
                course_id=course.id, user_id=uid, facility_id=fid,
                course_version=version, status="assigned", source=src,
                assigned_by="Document Café (policy update)", due_date=date.today() + timedelta(days=30),
            ))
            reassigned += 1
    m = CourseMaterial(
        course_id=course.id, facility_id=facility_id, kind=kind, file_name=file_name,
        file_format=file_format, url=url, data=data, size_kb=size_kb, version=version, is_active=True,
        uploaded_by=uploaded_by, cafe_document_id=cafe_document_id, cafe_version=cafe_version,
    )
    db.add(m)
    await db.flush()
    return {"id": m.id, "kind": m.kind, "file_name": m.file_name, "url": m.url,
            "version": m.version, "course_version": course.version, "reassigned": reassigned}


@router.post("/courses/{course_id}/materials")
async def upload_material(
    course_id: int,
    file: UploadFile = File(...),
    facility_id: int | None = Form(default=None),
    uploaded_by: str | None = Form(default="Staff Educator"),
    replace: bool = Form(default=False),
    db: AsyncSession = Depends(get_db),
):
    """Attach a DOCUMENT to a course (versioned)."""
    course = await db.get(TrainingCourse, course_id)
    if not course:
        raise HTTPException(404, "course not found")
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    if ext not in ALLOWED_MATERIAL:
        raise HTTPException(400, f"file type .{ext or '?'} not allowed (allowed: {', '.join(sorted(ALLOWED_MATERIAL))})")
    blob = await file.read()
    return await _publish_material(db, course, kind="document", file_name=file.filename or "upload",
                                   file_format=ext, url=None, size_kb=max(1, len(blob) // 1024),
                                   replace=replace, uploaded_by=uploaded_by, facility_id=facility_id,
                                   data=blob if ext == "pdf" else None)


def _youtube_id(url: str) -> str | None:
    """Extract a YouTube video id from common URL forms."""
    import re
    u = url.strip()
    m = re.search(r"(?:youtu\.be/|youtube\.com/(?:watch\?v=|embed/|shorts/|v/))([A-Za-z0-9_-]{11})", u)
    if m:
        return m.group(1)
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", u):  # bare id
        return u
    return None


class VideoIn(BaseModel):
    url: str
    title: str | None = None
    facility_id: int | None = None
    uploaded_by: str | None = "Staff Educator"
    replace: bool = False


@router.post("/courses/{course_id}/materials/video")
async def add_video(course_id: int, payload: VideoIn, db: AsyncSession = Depends(get_db)):
    """Attach a YouTube VIDEO to a course (versioned, same as a document)."""
    course = await db.get(TrainingCourse, course_id)
    if not course:
        raise HTTPException(404, "course not found")
    vid = _youtube_id(payload.url)
    if not vid:
        raise HTTPException(400, "not a recognizable YouTube link")
    canonical = f"https://www.youtube.com/watch?v={vid}"
    return await _publish_material(db, course, kind="video", file_name=payload.title or "Training video",
                                   file_format="youtube", url=canonical, size_kb=0,
                                   replace=payload.replace, uploaded_by=payload.uploaded_by,
                                   facility_id=payload.facility_id)


class MaterialPatch(BaseModel):
    file_name: str | None = None
    is_active: bool | None = None


@router.patch("/courses/{course_id}/materials/{material_id}")
async def update_material(course_id: int, material_id: int, payload: MaterialPatch, db: AsyncSession = Depends(get_db)):
    """Rename a document or toggle an old version active/inactive."""
    m = await db.get(CourseMaterial, material_id)
    if not m or m.course_id != course_id:
        raise HTTPException(404, "material not found")
    if payload.file_name is not None:
        name = payload.file_name.strip()
        if not name:
            raise HTTPException(400, "file name required")
        if "." not in name and "." in m.file_name:
            name = f"{name}.{m.file_name.rsplit('.', 1)[-1]}"
        m.file_name = name
    if payload.is_active is not None:
        m.is_active = payload.is_active
    await db.flush()
    return {"id": m.id, "file_name": m.file_name, "is_active": m.is_active}


@router.delete("/courses/{course_id}/materials/{material_id}")
async def delete_material(course_id: int, material_id: int, db: AsyncSession = Depends(get_db)):
    m = await db.get(CourseMaterial, material_id)
    if not m or m.course_id != course_id:
        raise HTTPException(404, "material not found")
    await db.delete(m)
    return {"ok": True}


def _doc_body(title: str) -> tuple[str, list[str]]:
    """Server-side training content (used to render a real PDF when no file was uploaded)."""
    t = title.lower()
    if "wound" in t or "skin" in t or "pressure" in t:
        return ("This module covers prevention, staging, and treatment of pressure injuries in long-term care, aligned to CMS F-686.",
                ["Reposition at-risk residents every 2 hours and document.", "Stage wounds accurately and reassess weekly.", "Escalate non-healing wounds to the wound nurse within 24h.", "Keep the care plan and treatment record together."])
    if "infection" in t or "hygiene" in t or "ppe" in t:
        return ("Core infection prevention practices: hand hygiene, PPE selection, and transmission-based precautions per CMS F-880.",
                ["Perform hand hygiene before and after every resident contact.", "Select PPE based on the precaution type.", "Report suspected outbreaks to the IP immediately.", "Document surveillance daily."])
    if "medication" in t or "med " in t:
        return ("Safe medication administration: the rights of administration, documentation, and error reporting.",
                ["Verify the resident, drug, dose, route, and time.", "Never leave medications unattended.", "Document immediately after administration.", "Report errors without delay - no blame culture."])
    if "hipaa" in t or "privacy" in t:
        return ("Protecting resident health information under HIPAA - minimum necessary, secure handling, and breach reporting.",
                ["Share PHI only on a need-to-know basis.", "Never share login credentials.", "Secure paper and screens from view.", "Report any suspected breach within the hour."])
    if "rights" in t or "dignity" in t or "abuse" in t:
        return ("Resident rights, dignity, and the facility's zero-tolerance abuse prohibition policy.",
                ["Treat every resident with dignity and respect.", "Recognize and immediately report signs of abuse or neglect.", "Honor resident choice and privacy.", "Know the grievance process."])
    return (f"This training covers the key requirements and best practices for {title}.",
            ["Understand the regulation and why it matters.", "Apply the facility's policy in daily practice.", "Document accurately and on time.", "Escalate concerns through the right channel."])


def _render_doc_pdf(course: TrainingCourse, material: CourseMaterial) -> bytes:
    from fpdf import FPDF
    summary, points = _doc_body(course.title)
    pdf = FPDF()
    pdf.set_auto_page_break(True, margin=18)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(0, 160, 215)
    pdf.cell(0, 7, "THE COMPLIANCE STORE", ln=True)
    pdf.set_text_color(15, 27, 45)
    pdf.set_font("Helvetica", "B", 20)
    pdf.multi_cell(0, 10, _s(course.title))
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(120, 130, 145)
    meta = f"{course.training_type.replace('_', ' ').title()} - {course.duration_hours}h - document v{material.version}"
    pdf.cell(0, 6, _s(meta), ln=True)
    pdf.ln(4)
    pdf.set_draw_color(0, 160, 215)
    pdf.set_line_width(0.6)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(6)
    if course.description:
        pdf.set_text_color(40, 52, 70)
        pdf.set_font("Helvetica", "I", 11)
        pdf.multi_cell(0, 6, _s(course.description))
        pdf.ln(2)
    pdf.set_text_color(30, 41, 59)
    pdf.set_font("Helvetica", "", 12)
    pdf.multi_cell(0, 7, _s(summary))
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 7, "Key requirements", ln=True)
    pdf.set_font("Helvetica", "", 11)
    for i, p in enumerate(points, 1):
        pdf.multi_cell(0, 7, _s(f"{i}.  {p}"))
        pdf.ln(1)
    pdf.ln(6)
    pdf.set_text_color(120, 130, 145)
    pdf.set_font("Helvetica", "I", 9)
    pdf.multi_cell(0, 5, "After reviewing this document, return to the course to acknowledge and sign your completion.")
    return bytes(pdf.output())


# ---- Café-sourced materials --------------------------------------------------
@router.get("/cafe-documents")
async def list_cafe_documents(facility_id: int, db: AsyncSession = Depends(get_db)):
    """Published Document Café policies a Staff Educator can attach as course material."""
    from app.modules.cafe.models import Document as CafeDoc
    rows = (await db.execute(
        select(CafeDoc).where(
            CafeDoc.facility_id == facility_id, CafeDoc.owner_type == "customer",
            CafeDoc.current_version >= 1, CafeDoc.is_archived.is_(False),
        ).order_by(CafeDoc.title)
    )).scalars().all()
    return [{"id": d.id, "title": d.title, "category": d.category, "version": d.current_version} for d in rows]


class FromCafeIn(BaseModel):
    document_id: int
    uploaded_by: str | None = "Staff Educator"
    replace: bool = False


@router.post("/courses/{course_id}/materials/from-cafe")
async def add_cafe_material(course_id: int, payload: FromCafeIn, db: AsyncSession = Depends(get_db)):
    """Attach a published Café policy as this course's training material. The course
    tracks the Café doc + version, so a Café re-publish rolls the course forward too."""
    from app.modules.cafe.models import Document as CafeDoc
    course = await db.get(TrainingCourse, course_id)
    if not course:
        raise HTTPException(404, "course not found")
    doc = await db.get(CafeDoc, payload.document_id)
    if not doc or doc.current_version < 1:
        raise HTTPException(400, "document not found or not yet published")
    has_active = (await db.execute(
        select(CourseMaterial).where(CourseMaterial.course_id == course_id, CourseMaterial.is_active.is_(True))
    )).scalars().first() is not None
    return await _publish_material(
        db, course, kind="document", file_name=doc.title, file_format="pdf", url=None, size_kb=0,
        replace=payload.replace or has_active, uploaded_by=payload.uploaded_by,
        facility_id=course.owner_facility_id, cafe_document_id=doc.id, cafe_version=doc.current_version,
    )


@router.get("/materials/{material_id}/file")
async def material_file(material_id: int, db: AsyncSession = Depends(get_db)):
    """Serve the actual training document as a PDF — the stored upload if present,
    otherwise a generated PDF of the course content (so the player always shows a real doc)."""
    m = await db.get(CourseMaterial, material_id)
    if not m:
        raise HTTPException(404, "material not found")
    if m.kind == "video":
        raise HTTPException(400, "video material has no document file")
    # Café-sourced material → render the linked policy version as a branded PDF.
    if m.cafe_document_id:
        from app.core.pdf import render_document_pdf
        from app.modules.cafe.models import Document as CafeDoc, DocumentVersion as CafeVer
        cdoc = await db.get(CafeDoc, m.cafe_document_id)
        ver = m.cafe_version or (cdoc.current_version if cdoc else 1)
        cv = (await db.execute(
            select(CafeVer).where(CafeVer.document_id == m.cafe_document_id, CafeVer.version == ver)
        )).scalars().first()
        html = (cv.content_html if cv else (cdoc.draft_html if cdoc else "")) or "<p><em>No content.</em></p>"
        pdf = render_document_pdf(title=(cdoc.title if cdoc else m.file_name), html=html,
                                  category=(cdoc.category if cdoc else None), version=ver, status="published")
        return Response(content=pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'inline; filename="{_s(m.file_name)}.pdf"'})
    if m.data:
        return Response(content=bytes(m.data), media_type="application/pdf",
                        headers={"Content-Disposition": f'inline; filename="{_s(m.file_name)}"'})
    course = await db.get(TrainingCourse, m.course_id)
    if not course:
        raise HTTPException(404, "course not found")
    return Response(content=_render_doc_pdf(course, m), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{_s(course.title)}.pdf"'})


class CoursePatch(BaseModel):
    title: str | None = None
    description: str | None = None
    training_type: str | None = None
    duration_hours: float | None = None
    target_profile: str | None = None
    program: str | None = None


@router.patch("/courses/{course_id}")
async def update_course(course_id: int, payload: CoursePatch, db: AsyncSession = Depends(get_db)):
    c = await db.get(TrainingCourse, course_id)
    if not c:
        raise HTTPException(404, "course not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    await db.flush()
    return {"id": c.id, "title": c.title}


# ---- Gamification: points, level, badges (computed from real data) ------------
LEVELS = [
    (0, "Newcomer"),
    (300, "Apprentice"),
    (700, "Practitioner"),
    (1200, "Specialist"),
    (2000, "Compliance Pro"),
    (3000, "Compliance Champion"),
]


# ---- Curricula / programs: configurable course buckets -----------------------
# Programs are now customer-defined and stored in lms_programs (org-scoped). They
# are loaded per request into a small resolver so every persona view groups
# training by the SAME buckets the customer configured.
_UNCATEGORIZED = {"key": "uncategorized", "name": "Uncategorized", "icon": "clipboard", "color": "#64748b"}

# A facility/org may configure at most this many course buckets (programs).
MAX_PROGRAMS_PER_ORG = 10

# Factory defaults — the buckets a brand-new org starts with (and the seed uses).
DEFAULT_PROGRAMS = [
    {"key": "onboarding", "name": "Compliance & Onboarding", "icon": "clipboard", "color": "#0ea5e9"},
    {"key": "infection", "name": "Infection Prevention & Control", "icon": "droplets", "color": "#06b6d4"},
    {"key": "clinical", "name": "Clinical Competencies", "icon": "stethoscope", "color": "#8b5cf6"},
    {"key": "rights", "name": "Resident Rights & Safety", "icon": "users", "color": "#10b981"},
    {"key": "emergency", "name": "Emergency & Environment", "icon": "flame", "color": "#f97316"},
]


async def _org_for_facility(db: AsyncSession, facility_id: int | None) -> int | None:
    if facility_id is None:
        return None
    fac = await db.get(Facility, facility_id)
    return fac.org_id if fac else None


async def _program_index(
    db: AsyncSession, *, facility_id: int | None = None, org_id: int | None = None, all_orgs: bool = False
) -> tuple[dict[str, dict], dict[str, int]]:
    """Load the configurable programs for an org into a resolver.

    Returns (by_key, order):
      by_key[key] -> {key, name, icon, color}   (display metadata)
      order[key]  -> int                          (canonical sort position)
    Pass facility_id to resolve the org automatically, org_id directly, or
    all_orgs=True for the cross-org roll-up."""
    if not all_orgs and org_id is None:
        org_id = await _org_for_facility(db, facility_id)
    q = select(LmsProgram).where(LmsProgram.is_active.is_(True))
    if not all_orgs and org_id is not None:
        q = q.where(LmsProgram.org_id == org_id)
    progs = (await db.execute(q.order_by(LmsProgram.sort_order, LmsProgram.id))).scalars().all()
    by_key = {p.key: {"key": p.key, "name": p.name, "icon": p.icon, "color": p.color} for p in progs}
    order: dict[str, int] = {}
    for p in progs:
        order.setdefault(p.key, len(order))
    return by_key, order


def _resolve(by_key: dict[str, dict], key: str | None) -> dict:
    """Resolve a course's program key to display metadata (Uncategorized fallback)."""
    return by_key.get(key or "", _UNCATEGORIZED)


def _slugify(name: str) -> str:
    s = "".join(ch if ch.isalnum() else "-" for ch in (name or "").lower()).strip("-")
    while "--" in s:
        s = s.replace("--", "-")
    return s or "program"


async def _course_counts_for_org(db: AsyncSession, org_id: int | None) -> dict[str, int]:
    """How many courses (across the org's facilities) sit in each program key."""
    fac_ids = [
        f.id for f in (await db.execute(select(Facility).where(Facility.org_id == org_id))).scalars().all()
    ] if org_id is not None else []
    if not fac_ids:
        return {}
    rows = (await db.execute(
        select(TrainingCourse.program, func.count())
        .where(TrainingCourse.owner_facility_id.in_(fac_ids), TrainingCourse.is_active.is_(True))
        .group_by(TrainingCourse.program)
    )).all()
    return {k: n for k, n in rows}


# ---- Programs (configurable course buckets) -----------------------------------
@router.get("/programs")
async def list_programs(facility_id: int | None = None, org_id: int | None = None, db: AsyncSession = Depends(get_db)):
    """The org's configurable course buckets, in display order, with a course count
    each (used by the catalog grouping and the Manage Programs panel)."""
    if org_id is None:
        org_id = await _org_for_facility(db, facility_id)
    progs = (await db.execute(
        select(LmsProgram).where(LmsProgram.org_id == org_id, LmsProgram.is_active.is_(True))
        .order_by(LmsProgram.sort_order, LmsProgram.id)
    )).scalars().all()
    counts = await _course_counts_for_org(db, org_id)
    return [
        {"id": p.id, "key": p.key, "name": p.name, "icon": p.icon, "color": p.color,
         "sort_order": p.sort_order, "course_count": counts.get(p.key, 0)}
        for p in progs
    ]


class ProgramIn(BaseModel):
    facility_id: int | None = None  # used to resolve the org
    org_id: int | None = None
    name: str
    icon: str = "clipboard"
    color: str = "#64748b"


@router.post("/programs")
async def create_program(payload: ProgramIn, db: AsyncSession = Depends(get_db)):
    org_id = payload.org_id if payload.org_id is not None else await _org_for_facility(db, payload.facility_id)
    name = payload.name.strip()
    if not name:
        raise HTTPException(422, "name is required")
    # enforce the per-facility cap on configured buckets
    active_count = (await db.execute(
        select(func.count()).select_from(LmsProgram)
        .where(LmsProgram.org_id == org_id, LmsProgram.is_active.is_(True))
    )).scalar() or 0
    if active_count >= MAX_PROGRAMS_PER_ORG:
        raise HTTPException(409, f"maximum of {MAX_PROGRAMS_PER_ORG} programs reached — delete one before adding another")
    # unique slug within the org
    existing = {p.key for p in (await db.execute(
        select(LmsProgram).where(LmsProgram.org_id == org_id))).scalars().all()}
    base = _slugify(name)
    key = base
    i = 2
    while key in existing:
        key = f"{base}-{i}"
        i += 1
    nextord = (await db.execute(
        select(func.coalesce(func.max(LmsProgram.sort_order), -1)).where(LmsProgram.org_id == org_id)
    )).scalar()
    p = LmsProgram(org_id=org_id, key=key, name=name, icon=payload.icon or "clipboard",
                   color=payload.color or "#64748b", sort_order=(nextord or 0) + 1, is_active=True)
    db.add(p)
    await db.flush()
    return {"id": p.id, "key": p.key, "name": p.name, "icon": p.icon, "color": p.color, "sort_order": p.sort_order}


class ProgramPatch(BaseModel):
    name: str | None = None
    icon: str | None = None
    color: str | None = None
    sort_order: int | None = None


@router.patch("/programs/{program_id}")
async def update_program(program_id: int, payload: ProgramPatch, db: AsyncSession = Depends(get_db)):
    p = await db.get(LmsProgram, program_id)
    if not p:
        raise HTTPException(404, "program not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    await db.flush()
    return {"id": p.id, "key": p.key, "name": p.name, "icon": p.icon, "color": p.color, "sort_order": p.sort_order}


@router.delete("/programs/{program_id}")
async def delete_program(program_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a bucket — only when no course is filed under it (move courses first)."""
    p = await db.get(LmsProgram, program_id)
    if not p:
        raise HTTPException(404, "program not found")
    counts = await _course_counts_for_org(db, p.org_id)
    n = counts.get(p.key, 0)
    if n > 0:
        raise HTTPException(409, f"{n} course(s) are filed under '{p.name}' — reassign them before deleting")
    await db.delete(p)
    return {"ok": True}


async def _points_for_user(db: AsyncSession, user_id: int) -> int:
    rows = (
        await db.execute(
            select(TrainingAssignment).where(TrainingAssignment.user_id == user_id)
        )
    ).scalars().all()
    pts = 0
    for a in rows:
        if a.status == "completed":
            pts += 100
            if a.completed_date and a.due_date and a.completed_date <= a.due_date:
                pts += 25
    return pts


def _level_for(points: int) -> int:
    idx = 0
    for i, (threshold, _) in enumerate(LEVELS):
        if points >= threshold:
            idx = i
    return idx


def _streak(completed_dates: list) -> int:
    """Consecutive-day streak ending today/yesterday, from completion dates."""
    days = sorted({d for d in completed_dates if d}, reverse=True)
    if not days:
        return 0
    from datetime import date as _date, timedelta as _td
    today = _date.today()
    # streak counts back from the most recent completion if it's today or yesterday
    if (today - days[0]).days > 1:
        return 0
    streak = 1
    for i in range(1, len(days)):
        if (days[i - 1] - days[i]).days == 1:
            streak += 1
        elif (days[i - 1] - days[i]).days == 0:
            continue
        else:
            break
    return streak


@router.get("/gamification")
async def gamification(user_id: int, db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(TrainingAssignment, TrainingCourse)
            .join(TrainingCourse, TrainingAssignment.course_id == TrainingCourse.id)
            .where(TrainingAssignment.user_id == user_id)
        )
    ).all()
    completed = [(a, c) for a, c in rows if a.status == "completed"]
    # Points: 100 / completed course + 25 on-time bonus when completed before due.
    points = 0
    on_time = 0
    for a, c in completed:
        points += 100
        if a.completed_date and a.due_date and a.completed_date <= a.due_date:
            points += 25
            on_time += 1
    total_hours = sum(c.duration_hours for _, c in completed)
    streak = _streak([a.completed_date for a, _ in completed])

    # Level
    level_idx = 0
    for i, (threshold, _) in enumerate(LEVELS):
        if points >= threshold:
            level_idx = i
    level_name = LEVELS[level_idx][1]
    next_threshold = LEVELS[level_idx + 1][0] if level_idx + 1 < len(LEVELS) else None
    cur_threshold = LEVELS[level_idx][0]
    progress = (
        round(100 * (points - cur_threshold) / (next_threshold - cur_threshold))
        if next_threshold else 100
    )

    n_done = len(completed)
    overdue_now = sum(1 for a, _ in rows if a.status == "overdue")
    badges = [
        {"key": "first", "label": "First Step", "icon": "footprints",
         "desc": "Completed your first training", "earned": n_done >= 1},
        {"key": "five", "label": "High Five", "icon": "hand",
         "desc": "Completed 5 trainings", "earned": n_done >= 5},
        {"key": "ten", "label": "Double Digits", "icon": "medal",
         "desc": "Completed 10 trainings", "earned": n_done >= 10},
        {"key": "ontime", "label": "On-Time Hero", "icon": "alarm-clock",
         "desc": "3+ trainings finished before the due date", "earned": on_time >= 3},
        {"key": "spotless", "label": "Spotless", "icon": "sparkles",
         "desc": "No overdue trainings", "earned": overdue_now == 0 and len(rows) > 0},
        {"key": "scholar", "label": "Scholar", "icon": "graduation-cap",
         "desc": "Logged 10+ learning hours", "earned": total_hours >= 10},
    ]
    return {
        "user_id": user_id,
        "points": points,
        "level": level_idx + 1,
        "level_name": level_name,
        "level_progress": progress,
        "points_to_next": (next_threshold - points) if next_threshold else 0,
        "completed": n_done,
        "on_time": on_time,
        "hours": round(total_hours, 1),
        "streak": streak,
        "badges": badges,
        "earned_count": sum(1 for b in badges if b["earned"]),
    }


@router.get("/leaderboard")
async def leaderboard(facility_id: int, user_id: int | None = None, db: AsyncSession = Depends(get_db)):
    """Friendly points ranking among a facility's staff, with the current user flagged."""
    users = (
        await db.execute(
            select(User).where(User.facility_id == facility_id, User.is_active.is_(True))
        )
    ).scalars().all()
    ranked = []
    for u in users:
        pts = await _points_for_user(db, u.id)
        ranked.append({"user_id": u.id, "name": u.name, "job_title": u.job_title or u.role, "points": pts})
    ranked.sort(key=lambda r: r["points"], reverse=True)
    for i, r in enumerate(ranked):
        r["rank"] = i + 1
        r["is_me"] = r["user_id"] == user_id
    me = next((r for r in ranked if r["is_me"]), None)
    return {
        "facility_id": facility_id,
        "total": len(ranked),
        "top": ranked[:5],
        "me": me,
        # include the window around "me" if they're outside the top 5
        "around_me": (ranked[max(0, (me["rank"] - 2)):(me["rank"] + 1)] if me and me["rank"] > 5 else []),
    }


# ---- Per-user training ("My Training") ----------------------------------------
@router.get("/my-training")
async def my_training(user_id: int, db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(TrainingAssignment, TrainingCourse)
            .join(TrainingCourse, TrainingAssignment.course_id == TrainingCourse.id)
            .where(TrainingAssignment.user_id == user_id)
            .order_by(TrainingAssignment.due_date.asc().nulls_last())
        )
    ).all()
    user = await db.get(User, user_id)
    by_key, _order = await _program_index(db, facility_id=user.facility_id if user else None)
    out = []
    for a, c in rows:
        cur = _resolve(by_key, c.program)
        out.append({
            "id": a.id,
            "course_id": a.course_id,
            "course_title": c.title,
            "description": c.description,
            "training_type": c.training_type,
            "duration_hours": c.duration_hours,
            "status": a.status,
            "source": a.source,
            "due_date": a.due_date.isoformat() if a.due_date else None,
            "completed_date": a.completed_date.isoformat() if a.completed_date else None,
            "curriculum_key": cur["key"],
            "curriculum": cur["name"],
        })
    return out


@router.get("/curricula")
async def curricula(user_id: int, db: AsyncSession = Depends(get_db)):
    """The user's training grouped into curricula, with per-curriculum progress.
    A curriculum is 'complete' (consolidated certificate available) when all its
    assigned courses are done. Goal = Fully Compliant when every curriculum is done."""
    rows = (
        await db.execute(
            select(TrainingAssignment, TrainingCourse)
            .join(TrainingCourse, TrainingAssignment.course_id == TrainingCourse.id)
            .where(TrainingAssignment.user_id == user_id)
        )
    ).all()
    user = await db.get(User, user_id)
    by_key, order = await _program_index(db, facility_id=user.facility_id if user else None)
    buckets: dict[str, dict] = {}
    for a, c in rows:
        cur = _resolve(by_key, c.program)
        b = buckets.setdefault(cur["key"], {
            "key": cur["key"], "name": cur["name"], "icon": cur["icon"], "color": cur["color"],
            "total": 0, "completed": 0, "overdue": 0, "courses": [],
        })
        b["total"] += 1
        if a.status == "completed":
            b["completed"] += 1
        if a.status == "overdue":
            b["overdue"] += 1
        b["courses"].append({
            "assignment_id": a.id, "course_id": a.course_id, "title": c.title, "status": a.status,
            "version": a.course_version, "current_version": c.version,
            "due_date": a.due_date.isoformat() if a.due_date else None,
            "completed_date": a.completed_date.isoformat() if a.completed_date else None,
            "source": a.source,
        })
    result = sorted(buckets.values(), key=lambda b: order.get(b["key"], 99))
    for b in result:
        b["progress"] = round(100 * b["completed"] / b["total"]) if b["total"] else 0
        b["status"] = "complete" if b["completed"] == b["total"] else ("in_progress" if b["completed"] > 0 else "not_started")
    done_curricula = sum(1 for b in result if b["status"] == "complete")
    return {
        "user_id": user_id,
        "curricula": result,
        "total_curricula": len(result),
        "done_curricula": done_curricula,
        "fully_compliant": done_curricula == len(result) and len(result) > 0,
    }


@router.get("/facility-curricula")
async def facility_curricula(facility_id: int, db: AsyncSession = Depends(get_db)):
    """Team-level view of the same 5 programs the learner sees — but aggregated
    across the whole facility. Mirror of /curricula for educators/DON/admins:
    per-program completion + how many staff are fully compliant in that program."""
    rows = (
        await db.execute(
            select(TrainingAssignment, TrainingCourse)
            .join(TrainingCourse, TrainingAssignment.course_id == TrainingCourse.id)
            .where(TrainingAssignment.facility_id == facility_id)
        )
    ).all()
    by_key, order = await _program_index(db, facility_id=facility_id)
    buckets: dict[str, dict] = {}
    # track per-(program, user) completion so we can compute "staff compliant"
    per_user: dict[str, dict[int, list[bool]]] = {}
    for a, c in rows:
        cur = _resolve(by_key, c.program)
        b = buckets.setdefault(cur["key"], {
            "key": cur["key"], "name": cur["name"], "icon": cur["icon"], "color": cur["color"],
            "total": 0, "completed": 0, "in_progress": 0, "overdue": 0, "course_titles": set(),
        })
        b["total"] += 1
        b["course_titles"].add(c.title)
        if a.status == "completed":
            b["completed"] += 1
        elif a.status == "overdue":
            b["overdue"] += 1
        elif a.status == "in_progress":
            b["in_progress"] += 1
        per_user.setdefault(cur["key"], {}).setdefault(a.user_id, []).append(a.status == "completed")
    result = sorted(buckets.values(), key=lambda b: order.get(b["key"], 99))
    for b in result:
        users = per_user.get(b["key"], {})
        staff = len(users)
        staff_complete = sum(1 for flags in users.values() if all(flags))
        b["courses"] = len(b.pop("course_titles"))
        b["staff"] = staff
        b["staff_complete"] = staff_complete
        b["progress"] = round(100 * b["completed"] / b["total"]) if b["total"] else 0
        b["coverage"] = round(100 * staff_complete / staff) if staff else 0
        b["status"] = "complete" if b["completed"] == b["total"] and b["total"] else (
            "in_progress" if b["completed"] > 0 else "not_started")
    done = sum(1 for b in result if b["status"] == "complete")
    return {
        "facility_id": facility_id,
        "curricula": result,
        "total_curricula": len(result),
        "done_curricula": done,
    }


@router.get("/completion-matrix")
async def completion_matrix(facility_id: int, db: AsyncSession = Depends(get_db)):
    """Staff × program completion grid for a facility — powers the Completion Records
    heatmap. Each cell summarizes one staff member's standing in one program."""
    rows = (
        await db.execute(
            select(TrainingAssignment, TrainingCourse, User)
            .join(TrainingCourse, TrainingAssignment.course_id == TrainingCourse.id)
            .join(User, TrainingAssignment.user_id == User.id)
            .where(TrainingAssignment.facility_id == facility_id)
        )
    ).all()
    # which programs are present, in canonical order
    present: dict[str, dict] = {}
    # per (user) -> {program_key -> {total, completed, overdue}}
    grid: dict[int, dict] = {}
    users: dict[int, User] = {}
    by_key, order = await _program_index(db, facility_id=facility_id)
    for a, c, u in rows:
        cur = _resolve(by_key, c.program)
        present.setdefault(cur["key"], {"key": cur["key"], "name": cur["name"], "icon": cur["icon"], "color": cur["color"]})
        users[u.id] = u
        cell = grid.setdefault(u.id, {}).setdefault(cur["key"], {"total": 0, "completed": 0, "overdue": 0})
        cell["total"] += 1
        if a.status == "completed":
            cell["completed"] += 1
        elif a.status == "overdue":
            cell["overdue"] += 1
    programs = sorted(present.values(), key=lambda p: order.get(p["key"], 99))

    def cell_status(c):
        if not c or c["total"] == 0:
            return "none"
        if c["completed"] == c["total"]:
            return "complete"
        if c["overdue"] > 0:
            return "overdue"
        if c["completed"] > 0:
            return "in_progress"
        return "not_started"

    staff = []
    for uid, u in users.items():
        cells = {}
        tot = comp = 0
        for p in programs:
            c = grid[uid].get(p["key"])
            cells[p["key"]] = {
                "total": c["total"] if c else 0,
                "completed": c["completed"] if c else 0,
                "overdue": c["overdue"] if c else 0,
                "status": cell_status(c),
                "pct": round(100 * c["completed"] / c["total"]) if c and c["total"] else 0,
            }
            if c:
                tot += c["total"]
                comp += c["completed"]
        staff.append({
            "user_id": uid,
            "user_name": u.name,
            "job_title": u.job_title,
            "profile": u.profile,
            "overall_rate": round(100 * comp / tot) if tot else 0,
            "completed": comp,
            "total": tot,
            "cells": cells,
        })
    staff.sort(key=lambda s: s["overall_rate"])
    return {"facility_id": facility_id, "programs": programs, "staff": staff}


# ---- Compliance Copilot: computed intelligence for a facility -------------------
@router.get("/insights")
async def lms_insights(facility_id: int, db: AsyncSession = Depends(get_db)):
    """A computed 'Compliance Copilot' for one facility: a survey-readiness score
    plus a prioritized list of smart, actionable insights (each with an estimated
    readiness impact and the tab that resolves it)."""
    rows = (
        await db.execute(
            select(TrainingAssignment, TrainingCourse, User)
            .join(TrainingCourse, TrainingAssignment.course_id == TrainingCourse.id)
            .join(User, TrainingAssignment.user_id == User.id)
            .where(TrainingAssignment.facility_id == facility_id)
        )
    ).all()
    total = len(rows)
    completed = sum(1 for a, _, _ in rows if a.status == "completed")
    overdue = sum(1 for a, _, _ in rows if a.status == "overdue")
    comp_rate = round(100 * completed / total) if total else 0

    # per-program coverage (assignment-level) in canonical order
    by_key, order = await _program_index(db, facility_id=facility_id)
    prog: dict[str, dict] = {}
    for a, c, _ in rows:
        p = _resolve(by_key, c.program)
        b = prog.setdefault(p["key"], {"name": p["name"], "total": 0, "completed": 0})
        b["total"] += 1
        if a.status == "completed":
            b["completed"] += 1
    progs = sorted(prog.items(), key=lambda kv: order.get(kv[0], 99))
    prog_cov = [(name_d["name"], round(100 * name_d["completed"] / name_d["total"]) if name_d["total"] else 0)
                for _, name_d in progs]
    avg_cov = round(sum(c for _, c in prog_cov) / len(prog_cov)) if prog_cov else 0
    worst_prog = min(prog_cov, key=lambda x: x[1]) if prog_cov else None

    # staff who completed an OLD version but owe the current one (re-acknowledgement)
    reack_users = {a.user_id for a, c, _ in rows if a.status != "completed" and c.version > 1 and (a.assigned_by or "").startswith("Document Café")}

    # courses with no active document
    fac_courses = (await db.execute(select(TrainingCourse).where(
        TrainingCourse.owner_facility_id == facility_id, TrainingCourse.is_active.is_(True)))).scalars().all()
    active_mat_ids = {m.course_id for m in (await db.execute(select(CourseMaterial).where(CourseMaterial.is_active.is_(True)))).scalars().all()}
    missing_docs = [c for c in fac_courses if c.id not in active_mat_ids]

    pending_invites = (await db.execute(select(func.count()).select_from(User).where(
        User.facility_id == facility_id, User.role == "end_user", User.temp_token.is_not(None)))).scalar() or 0

    # readiness score — explainable weighted composite
    score = max(0, min(100, round(0.7 * comp_rate + 0.3 * avg_cov) - min(15, overdue)))
    label = ("Survey-ready" if score >= 85 else "On track" if score >= 70
             else "Needs attention" if score >= 50 else "At risk")

    def impact(n):  # readiness points freed by resolving n incomplete items
        return round(100 * n / total) if total else 0

    insights = []
    if overdue:
        insights.append({"severity": "high", "icon": "alarm", "title": f"{overdue} training item{'s' if overdue != 1 else ''} overdue",
                         "detail": "Past due — the fastest lift to your readiness score.", "impact": impact(overdue),
                         "action": "Review overdue", "tab": "records"})
    if reack_users:
        n = len(reack_users)
        insights.append({"severity": "high", "icon": "refresh", "title": f"{n} staff owe a policy re-acknowledgement",
                         "detail": "A document was updated — they must acknowledge the new version.", "impact": impact(n),
                         "action": "See who", "tab": "records"})
    if worst_prog and worst_prog[1] < 80:
        insights.append({"severity": "medium", "icon": "target", "title": f"{worst_prog[0]} at {worst_prog[1]}%",
                         "detail": "Your lowest program — drive these to clear survey risk.", "impact": max(1, 80 - worst_prog[1]),
                         "action": "Drill program", "tab": "records"})
    if missing_docs:
        n = len(missing_docs)
        insights.append({"severity": "medium", "icon": "file", "title": f"{n} course{'s' if n != 1 else ''} missing a document",
                         "detail": "Learners can't complete a course with no training material attached.", "impact": 0,
                         "action": "Attach documents", "tab": "catalog"})
    if pending_invites:
        insights.append({"severity": "low", "icon": "mail", "title": f"{pending_invites} learner{'s' if pending_invites != 1 else ''} not yet signed in",
                         "detail": "Invited but haven't used their one-time code.", "impact": 0,
                         "action": "Manage learners", "tab": "learners"})
    if not insights:
        insights.append({"severity": "good", "icon": "check", "title": "Survey-ready",
                         "detail": "Every program is on track and nothing is overdue.", "impact": 0,
                         "action": "View compliance", "tab": "records"})

    sev_rank = {"high": 0, "medium": 1, "low": 2, "good": 3}
    insights.sort(key=lambda i: (sev_rank[i["severity"]], -i["impact"]))
    return {
        "facility_id": facility_id,
        "readiness": {"score": score, "label": label, "completion": comp_rate, "program_avg": avg_cov, "overdue": overdue},
        "insights": insights,
    }


def _due_label(status: str, due, completed):
    if status == "completed":
        return f"Completed {completed.isoformat()}" if completed else "Completed"
    if not due:
        return "No due date"
    days = (due - date.today()).days
    if days < 0:
        return f"{abs(days)}d overdue"
    if days == 0:
        return "Due today"
    return f"Due in {days}d"


@router.get("/courses/{course_id}/roster")
async def course_roster(course_id: int, facility_id: int, db: AsyncSession = Depends(get_db)):
    """Per-staff status for ONE course at a facility — powers the catalog tile
    drill-down ('who has not completed this training')."""
    rows = (
        await db.execute(
            select(TrainingAssignment, User)
            .join(User, TrainingAssignment.user_id == User.id)
            .where(TrainingAssignment.course_id == course_id, TrainingAssignment.facility_id == facility_id)
            .order_by(User.name)
        )
    ).all()
    course = (await db.execute(select(TrainingCourse).where(TrainingCourse.id == course_id))).scalars().first()
    # dedupe per staff member (seed data may double-assign): keep the most-advanced status.
    rank = {"overdue": 0, "assigned": 1, "in_progress": 2, "completed": 3}
    best: dict[int, tuple] = {}
    for a, u in rows:
        cur = best.get(u.id)
        if cur is None or rank.get(a.status, 1) > rank.get(cur[0].status, 1):
            best[u.id] = (a, u)
    staff = [
        {
            "user_id": u.id,
            "user_name": u.name,
            "job_title": u.job_title,
            "profile": u.profile,
            "status": a.status,
            "due_date": a.due_date.isoformat() if a.due_date else None,
            "completed_date": a.completed_date.isoformat() if a.completed_date else None,
            "due_label": _due_label(a.status, a.due_date, a.completed_date),
        }
        for a, u in best.values()
    ]
    # surface incomplete first (overdue, then in_progress, then assigned, then completed)
    weight = {"overdue": 0, "in_progress": 1, "assigned": 2, "completed": 3}
    staff.sort(key=lambda s: (weight.get(s["status"], 2), s["user_name"]))
    return {
        "course_id": course_id,
        "course_title": course.title if course else "",
        "total": len(staff),
        "completed": sum(1 for s in staff if s["status"] == "completed"),
        "incomplete": sum(1 for s in staff if s["status"] != "completed"),
        "staff": staff,
    }


@router.get("/program-roster")
async def program_roster(facility_id: int, program_key: str, db: AsyncSession = Depends(get_db)):
    """Per-staff completion within ONE program at a facility, with each person's
    outstanding courses — powers the Completion Records program drill-down."""
    rows = (
        await db.execute(
            select(TrainingAssignment, TrainingCourse, User)
            .join(TrainingCourse, TrainingAssignment.course_id == TrainingCourse.id)
            .join(User, TrainingAssignment.user_id == User.id)
            .where(TrainingAssignment.facility_id == facility_id)
            .order_by(User.name)
        )
    ).all()
    by_key, _order = await _program_index(db, facility_id=facility_id)
    members = [(a, c, u) for a, c, u in rows if _resolve(by_key, c.program)["key"] == program_key]
    by_user: dict[int, dict] = {}
    for a, c, u in members:
        rec = by_user.setdefault(u.id, {
            "user_id": u.id, "user_name": u.name, "job_title": u.job_title, "profile": u.profile,
            "total": 0, "completed": 0, "outstanding": [],
        })
        rec["total"] += 1
        if a.status == "completed":
            rec["completed"] += 1
        else:
            rec["outstanding"].append({
                "title": c.title, "status": a.status,
                "version": a.course_version, "current_version": c.version,
                "reack": (a.assigned_by or "").startswith("Document Café") and a.course_version > 1,
                "due_date": a.due_date.isoformat() if a.due_date else None,
                "due_label": _due_label(a.status, a.due_date, a.completed_date),
            })
    people = list(by_user.values())
    for p in people:
        p["progress"] = round(100 * p["completed"] / p["total"]) if p["total"] else 0
        p["complete"] = p["completed"] == p["total"] and p["total"] > 0
    # incomplete people first, most-behind first
    people.sort(key=lambda p: (p["complete"], p["progress"]))
    prog = _resolve(by_key, members[0][1].program) if members else {"key": program_key, "name": program_key}
    return {
        "facility_id": facility_id,
        "program_key": program_key,
        "program_name": prog["name"],
        "total_staff": len(people),
        "incomplete_staff": sum(1 for p in people if not p["complete"]),
        "staff": people,
    }


@router.get("/curricula/{curriculum_key}/certificate.pdf")
async def curriculum_certificate(curriculum_key: str, user_id: int, db: AsyncSession = Depends(get_db)):
    """Consolidated certificate for a completed curriculum (what HR/surveyors file)."""
    user = await db.get(User, user_id)
    facility = await db.get(Facility, user.facility_id) if user and user.facility_id else None
    rows = (
        await db.execute(
            select(TrainingAssignment, TrainingCourse)
            .join(TrainingCourse, TrainingAssignment.course_id == TrainingCourse.id)
            .where(TrainingAssignment.user_id == user_id)
        )
    ).all()
    by_key, _order = await _program_index(db, facility_id=user.facility_id if user else None)
    members = [(a, c) for a, c in rows if _resolve(by_key, c.program)["key"] == curriculum_key]
    if not members:
        raise HTTPException(404, "no courses in this curriculum for the user")
    cur_name = _resolve(by_key, members[0][1].program)["name"]
    all_done = all(a.status == "completed" for a, _ in members)

    from fpdf import FPDF
    pdf = FPDF(orientation="L", format="A4")
    pdf.add_page()
    pdf.set_draw_color(0, 160, 215); pdf.set_line_width(1.2)
    pdf.rect(8, 8, pdf.w - 16, pdf.h - 16)
    pdf.ln(12)
    pdf.set_font("Helvetica", "B", 12); pdf.set_text_color(0, 160, 215)
    pdf.cell(0, 8, "THE COMPLIANCE STORE", align="C", ln=True)
    pdf.set_text_color(30, 41, 59); pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 7, "Curriculum Completion Certificate", align="C", ln=True)
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 22)
    pdf.cell(0, 11, _s(cur_name), align="C", ln=True)
    pdf.set_font("Helvetica", "", 12); pdf.set_text_color(100, 116, 139)
    pdf.cell(0, 7, _s(f"Awarded to {user.name if user else '-'} - {facility.name if facility else ''}"), align="C", ln=True)
    if not all_done:
        pdf.set_text_color(202, 138, 4)
        pdf.cell(0, 7, "(IN PROGRESS - not all courses complete)", align="C", ln=True)
    pdf.ln(6)
    pdf.set_text_color(30, 41, 59); pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, _s(f"Courses in this curriculum ({sum(1 for a,_ in members if a.status=='completed')}/{len(members)} complete):"), ln=True)
    pdf.set_font("Helvetica", "", 10)
    for a, c in members:
        mark = "[x]" if a.status == "completed" else "[ ]"
        when = a.completed_date.isoformat() if a.completed_date else "-"
        pdf.cell(0, 6, _s(f"  {mark}  {c.title}   ({when})"), ln=True)
    data = bytes(pdf.output())
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="curriculum_{curriculum_key}.pdf"'})


@router.get("/completion-summary")
async def completion_summary(facility_id: int, db: AsyncSession = Depends(get_db)):
    """Per-staff completion roll-up for a facility (Completion Records view)."""
    users = (
        await db.execute(
            select(User).where(User.facility_id == facility_id, User.is_active.is_(True))
        )
    ).scalars().all()
    out = []
    for u in users:
        counts = {
            s: n
            for s, n in (
                await db.execute(
                    select(TrainingAssignment.status, func.count())
                    .where(TrainingAssignment.user_id == u.id)
                    .group_by(TrainingAssignment.status)
                )
            ).all()
        }
        total = sum(counts.values())
        completed = counts.get("completed", 0)
        out.append(
            {
                "user_id": u.id,
                "user_name": u.name,
                "job_title": u.job_title,
                "profile": u.profile,
                "total": total,
                "completed": completed,
                "overdue": counts.get("overdue", 0),
                "completion_rate": round(100 * completed / total) if total else 0,
            }
        )
    out.sort(key=lambda r: r["completion_rate"])
    return out


@router.get("/seats")
async def seat_utilization(facility_id: int, db: AsyncSession = Depends(get_db)):
    """Seat-based licensing view: active staff vs a per-facility seat allocation."""
    active = (
        await db.execute(
            select(func.count()).select_from(User).where(
                User.facility_id == facility_id, User.is_active.is_(True)
            )
        )
    ).scalar() or 0
    # Demo allocation: round up to the next 25-seat tier above current headcount.
    allocated = max(25, ((active // 25) + 1) * 25)
    return {"facility_id": facility_id, "allocated": allocated, "used": active, "available": allocated - active}


# ---- Assignments --------------------------------------------------------------
@router.get("/assignments")
async def list_assignments(
    facility_id: int | None = None,
    user_id: int | None = None,
    status: str | None = None,
    source: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(TrainingAssignment, TrainingCourse, User)
        .join(TrainingCourse, TrainingAssignment.course_id == TrainingCourse.id)
        .join(User, TrainingAssignment.user_id == User.id)
        .order_by(TrainingAssignment.assigned_date.desc())
    )
    if facility_id:
        q = q.where(TrainingAssignment.facility_id == facility_id)
    if user_id:
        q = q.where(TrainingAssignment.user_id == user_id)
    if status:
        q = q.where(TrainingAssignment.status == status)
    if source:
        q = q.where(TrainingAssignment.source == source)
    rows = (await db.execute(q)).all()
    return [
        {
            "id": a.id,
            "course_id": a.course_id,
            "course_title": c.title,
            "program": c.program,
            "user_id": a.user_id,
            "user_name": u.name,
            "facility_id": a.facility_id,
            "status": a.status,
            "source": a.source,
            "source_ref": a.source_ref,
            "version": a.course_version,
            "current_version": c.version,
            "assigned_date": a.assigned_date.isoformat() if a.assigned_date else None,
            "due_date": a.due_date.isoformat() if a.due_date else None,
            "completed_date": a.completed_date.isoformat() if a.completed_date else None,
            "score": a.score,
        }
        for a, c, u in rows
    ]


class AssignIn(BaseModel):
    course_id: int
    user_ids: list[int]
    facility_id: int | None = None
    due_date: date | None = None
    assigned_by: str | None = "Demo Admin"
    source: str = "manual"
    source_ref: str | None = None


@router.post("/assignments")
async def create_assignments(payload: AssignIn, db: AsyncSession = Depends(get_db)):
    course = await db.get(TrainingCourse, payload.course_id)
    ver = course.version if course else 1
    created = []
    for uid in payload.user_ids:
        a = TrainingAssignment(
            course_id=payload.course_id,
            user_id=uid,
            facility_id=payload.facility_id,
            course_version=ver,
            due_date=payload.due_date,
            assigned_by=payload.assigned_by,
            source=payload.source,
            source_ref=payload.source_ref,
        )
        db.add(a)
        await db.flush()
        created.append(a.id)
    return {"created": created, "count": len(created)}


@router.patch("/assignments/{assignment_id}")
async def update_assignment(
    assignment_id: int, status: str, db: AsyncSession = Depends(get_db)
):
    a = await db.get(TrainingAssignment, assignment_id)
    if not a:
        raise HTTPException(404, "assignment not found")
    a.status = status
    if status == "completed":
        a.completed_date = date.today()
        a.score = a.score or 100
    return {"id": a.id, "status": a.status}


# ---- Stats / roll-up ----------------------------------------------------------
@router.get("/stats")
async def stats(facility_id: int | None = None, db: AsyncSession = Depends(get_db)):
    q = select(TrainingAssignment.status, func.count()).group_by(TrainingAssignment.status)
    if facility_id:
        q = q.where(TrainingAssignment.facility_id == facility_id)
    rows = (await db.execute(q)).all()
    counts = {status: n for status, n in rows}
    total = sum(counts.values()) or 0
    completed = counts.get("completed", 0)
    return {
        "total": total,
        "completed": completed,
        "in_progress": counts.get("in_progress", 0),
        "assigned": counts.get("assigned", 0),
        "overdue": counts.get("overdue", 0),
        "completion_rate": round(100 * completed / total) if total else 0,
    }


@router.get("/rollup")
async def facility_rollup(db: AsyncSession = Depends(get_db)):
    """Multi-facility roll-up — powers the corporate portfolio heatmap.
    Each facility carries overall completion + per-program coverage cells, so a
    Corporate Leader sees the SAME program lens as a facility, but across the org."""
    fac_rows = (await db.execute(select(Facility))).scalars().all()
    rows = (
        await db.execute(
            select(TrainingAssignment, TrainingCourse)
            .join(TrainingCourse, TrainingAssignment.course_id == TrainingCourse.id)
        )
    ).all()
    grid: dict[int, dict[str, dict]] = {}
    present: dict[str, dict] = {}
    fac_totals: dict[int, dict] = {}
    by_key, order = await _program_index(db, all_orgs=True)
    for a, c in rows:
        cur = _resolve(by_key, c.program)
        present.setdefault(cur["key"], {"key": cur["key"], "name": cur["name"], "icon": cur["icon"], "color": cur["color"]})
        cell = grid.setdefault(a.facility_id, {}).setdefault(cur["key"], {"total": 0, "completed": 0, "overdue": 0})
        ft = fac_totals.setdefault(a.facility_id, {"total": 0, "completed": 0, "overdue": 0})
        for bucket in (cell, ft):
            bucket["total"] += 1
            if a.status == "completed":
                bucket["completed"] += 1
            elif a.status == "overdue":
                bucket["overdue"] += 1
    programs = sorted(present.values(), key=lambda p: order.get(p["key"], 99))

    def cstatus(c):
        if not c or c["total"] == 0:
            return "none"
        if c["completed"] == c["total"]:
            return "complete"
        if c["overdue"] > 0:
            return "overdue"
        if c["completed"] > 0:
            return "in_progress"
        return "not_started"

    facilities = []
    for f in fac_rows:
        ft = fac_totals.get(f.id, {"total": 0, "completed": 0, "overdue": 0})
        cells = {}
        for p in programs:
            c = grid.get(f.id, {}).get(p["key"])
            cells[p["key"]] = {
                "pct": round(100 * c["completed"] / c["total"]) if c and c["total"] else 0,
                "completed": c["completed"] if c else 0,
                "total": c["total"] if c else 0,
                "overdue": c["overdue"] if c else 0,
                "status": cstatus(c),
            }
        facilities.append({
            "facility_id": f.id,
            "facility": f.name,
            "org_id": f.org_id,
            "total": ft["total"],
            "completed": ft["completed"],
            "overdue": ft["overdue"],
            "completion_rate": round(100 * ft["completed"] / ft["total"]) if ft["total"] else 0,
            "cells": cells,
        })
    return {"programs": programs, "facilities": facilities}


# ---- Certifications -----------------------------------------------------------
@router.get("/certifications")
async def list_certifications(
    facility_id: int | None = None, db: AsyncSession = Depends(get_db)
):
    q = select(Certification, User).join(User, Certification.user_id == User.id)
    if facility_id:
        q = q.where(User.facility_id == facility_id)
    rows = (await db.execute(q)).all()
    return [
        {
            "id": c.id,
            "user_name": u.name,
            "name": c.name,
            "status": c.status,
            "confirmed_date": c.confirmed_date.isoformat() if c.confirmed_date else None,
            "expiration_date": c.expiration_date.isoformat() if c.expiration_date else None,
        }
        for c, u in rows
    ]


# ---- Facility Training Compliance report PDF ----------------------------------
@router.get("/facility-report.pdf")
async def facility_report(facility_id: int, db: AsyncSession = Depends(get_db)):
    """Surveyor-ready Training Compliance report for a facility: readiness summary,
    program coverage, and per-staff completion."""
    facility = await db.get(Facility, facility_id)
    if not facility:
        raise HTTPException(404, "facility not found")
    rows = (
        await db.execute(
            select(TrainingAssignment, TrainingCourse, User)
            .join(TrainingCourse, TrainingAssignment.course_id == TrainingCourse.id)
            .join(User, TrainingAssignment.user_id == User.id)
            .where(TrainingAssignment.facility_id == facility_id)
        )
    ).all()
    total = completed = overdue = 0
    by_user: dict[int, dict] = {}
    prog: dict[str, dict] = {}
    by_key, order = await _program_index(db, facility_id=facility_id)
    for a, c, u in rows:
        total += 1
        done = a.status == "completed"
        od = a.status == "overdue"
        completed += done
        overdue += od
        ur = by_user.setdefault(u.id, {"name": u.name, "role": u.job_title or u.profile, "total": 0, "completed": 0, "overdue": 0})
        ur["total"] += 1
        ur["completed"] += done
        ur["overdue"] += od
        p = _resolve(by_key, c.program)
        pb = prog.setdefault(p["key"], {"name": p["name"], "total": 0, "completed": 0, "_key": p["key"]})
        pb["total"] += 1
        pb["completed"] += done
    comp_rate = round(100 * completed / total) if total else 0
    progs = sorted(prog.values(), key=lambda b: order.get(b["_key"], 99))
    staff = sorted(by_user.values(), key=lambda r: (100 * r["completed"] / r["total"]) if r["total"] else 0)

    from fpdf import FPDF
    pdf = FPDF()
    pdf.set_auto_page_break(True, margin=15)
    pdf.add_page()
    # brand header
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(0, 160, 215)
    pdf.cell(0, 7, "THE COMPLIANCE STORE", ln=True)
    pdf.set_text_color(15, 27, 45)
    pdf.set_font("Helvetica", "B", 17)
    pdf.cell(0, 9, "Training Compliance Report", ln=True)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(60, 74, 99)
    pdf.cell(0, 6, _s(f"Facility: {facility.name}{(' - ' + facility.state) if facility.state else ''}"), ln=True)
    pdf.cell(0, 6, _s(f"Generated: {date.today().isoformat()}"), ln=True)
    pdf.ln(2)
    # summary line
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(15, 27, 45)
    pdf.cell(0, 7, _s(f"Overall completion: {comp_rate}%   |   Staff: {len(staff)}   |   Overdue: {overdue}"), ln=True)
    pdf.ln(3)

    # program coverage table
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Program coverage", ln=True)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(238, 244, 251)
    pdf.cell(120, 8, "Program", border=1, fill=True)
    pdf.cell(35, 8, "Completion", border=1, fill=True)
    pdf.cell(30, 8, "Done / Total", border=1, ln=True, fill=True)
    pdf.set_font("Helvetica", "", 10)
    for b in progs:
        pct = round(100 * b["completed"] / b["total"]) if b["total"] else 0
        pdf.cell(120, 8, _s(b["name"]), border=1)
        pdf.cell(35, 8, f"{pct}%", border=1)
        pdf.cell(30, 8, f"{b['completed']}/{b['total']}", border=1, ln=True)
    pdf.ln(4)

    # per-staff table
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Completion by staff member", ln=True)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(238, 244, 251)
    pdf.cell(70, 8, "Staff", border=1, fill=True)
    pdf.cell(45, 8, "Role", border=1, fill=True)
    pdf.cell(30, 8, "Completion", border=1, fill=True)
    pdf.cell(25, 8, "Overdue", border=1, ln=True, fill=True)
    pdf.set_font("Helvetica", "", 10)
    for r in staff:
        pct = round(100 * r["completed"] / r["total"]) if r["total"] else 0
        pdf.cell(70, 8, _s(r["name"][:40]), border=1)
        pdf.cell(45, 8, _s(str(r["role"])[:24]), border=1)
        pdf.cell(30, 8, f"{pct}% ({r['completed']}/{r['total']})", border=1)
        pdf.cell(25, 8, str(r["overdue"]) if r["overdue"] else "-", border=1, ln=True)
    if not staff:
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(0, 8, "No training records for this facility.", ln=True)

    data = bytes(pdf.output())
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="training_compliance_{facility_id}.pdf"'},
    )


# ---- Surveyor evidence PDF ----------------------------------------------------
@router.get("/users/{user_id}/evidence.pdf")
async def surveyor_evidence(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "user not found")
    facility = await db.get(Facility, user.facility_id) if user.facility_id else None
    rows = (
        await db.execute(
            select(TrainingAssignment, TrainingCourse)
            .join(TrainingCourse, TrainingAssignment.course_id == TrainingCourse.id)
            .where(TrainingAssignment.user_id == user_id)
        )
    ).all()

    from fpdf import FPDF

    pdf = FPDF()
    pdf.set_auto_page_break(True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "Training History - Surveyor Evidence", ln=True)
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 7, _s(f"Staff: {user.name}  ({user.job_title or user.role})"), ln=True)
    pdf.cell(0, 7, _s(f"Facility: {facility.name if facility else '-'}"), ln=True)
    pdf.cell(0, 7, _s(f"Generated: {date.today().isoformat()}"), ln=True)
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(95, 8, "Course", border=1)
    pdf.cell(35, 8, "Status", border=1)
    pdf.cell(35, 8, "Completed", border=1, ln=True)
    pdf.set_font("Helvetica", "", 10)
    for a, c in rows:
        pdf.cell(95, 8, _s(c.title[:55]), border=1)
        pdf.cell(35, 8, _s(a.status), border=1)
        pdf.cell(35, 8, a.completed_date.isoformat() if a.completed_date else "-", border=1, ln=True)
    if not rows:
        pdf.cell(0, 8, "No training records.", ln=True)

    data = bytes(pdf.output())
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="evidence_{user_id}.pdf"'},
    )


# ---- Per-course completion certificate ----------------------------------------
@router.get("/assignments/{assignment_id}/certificate.pdf")
async def course_certificate(assignment_id: int, db: AsyncSession = Depends(get_db)):
    """A single-course completion certificate for one staff member."""
    a = await db.get(TrainingAssignment, assignment_id)
    if not a:
        raise HTTPException(404, "assignment not found")
    if a.status != "completed":
        raise HTTPException(400, "certificate available only after completion")
    user = await db.get(User, a.user_id)
    course = await db.get(TrainingCourse, a.course_id)
    facility = await db.get(Facility, a.facility_id) if a.facility_id else None

    # If this training came from a Café policy publish, surface the policy version.
    policy_ref = ""
    if a.source == "policy_ack" and a.source_ref and ":v" in a.source_ref:
        policy_ref = a.source_ref.split(":")[-1]  # e.g. "v4"

    from fpdf import FPDF

    pdf = FPDF(orientation="L", format="A4")
    pdf.add_page()
    w = pdf.epw
    # border
    pdf.set_draw_color(0, 160, 215)
    pdf.set_line_width(1.2)
    pdf.rect(8, 8, pdf.w - 16, pdf.h - 16)
    pdf.set_line_width(0.3)
    pdf.rect(11, 11, pdf.w - 22, pdf.h - 22)

    pdf.ln(14)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(0, 160, 215)
    pdf.cell(0, 8, "THE COMPLIANCE STORE", align="C", ln=True)
    pdf.set_text_color(30, 41, 59)
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 7, "Certificate of Completion", align="C", ln=True)
    pdf.ln(8)

    pdf.set_font("Helvetica", "", 12)
    pdf.cell(0, 7, "This certifies that", align="C", ln=True)
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 24)
    pdf.cell(0, 12, _s(user.name if user else "-"), align="C", ln=True)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(0, 6, _s(f"{(user.job_title or user.role) if user else ''} - {facility.name if facility else ''}"), align="C", ln=True)
    pdf.ln(6)

    pdf.set_text_color(30, 41, 59)
    pdf.set_font("Helvetica", "", 12)
    pdf.cell(0, 7, "has successfully completed", align="C", ln=True)
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 9, _s(course.title if course else "-"), align="C", ln=True)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(100, 116, 139)
    meta = f"{course.duration_hours}h - {course.training_type.replace('_', ' ').title()}" if course else ""
    meta += f" - version {a.course_version}"
    if policy_ref:
        meta += f" - policy {policy_ref}"
    pdf.cell(0, 6, _s(meta), align="C", ln=True)
    pdf.ln(10)

    pdf.set_text_color(30, 41, 59)
    pdf.set_font("Helvetica", "", 11)
    completed = a.completed_date.isoformat() if a.completed_date else date.today().isoformat()
    pdf.cell(w / 2, 6, _s(f"Completed: {completed}"), align="C")
    pdf.cell(w / 2, 6, _s(f"Certificate ID: TCS-{a.id:06d}"), align="C", ln=True)

    data = bytes(pdf.output())
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="certificate_{assignment_id}.pdf"'},
    )

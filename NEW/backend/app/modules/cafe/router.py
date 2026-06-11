import io
import zipfile
from datetime import date, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.db import get_db
from app.core.html import sanitize_html
from app.core.pdf import render_document_pdf
from app.llm import generate
from app.modules.cafe.models import (
    STATUS_APPROVED,
    STATUS_DRAFT,
    STATUS_IN_REVIEW,
    STATUS_PUBLISHED,
    CategorySubscription,
    Document,
    DocumentEvent,
    DocumentReview,
    DocumentVersion,
    PolicyAcknowledgement,
)
from app.modules.lms.models import CourseMaterial, TrainingAssignment, TrainingCourse
from app.shared.models import AuditLog, Facility, Notification, User

router = APIRouter(prefix="/api/cafe", tags=["cafe"])

ALLOWED_DOC = {"pdf", "docx", "doc", "xlsx", "pptx", "txt", "png", "jpg", "jpeg", "html"}
EDITABLE_FORMATS = {"html", "docx", "doc", "txt"}  # can be opened in the rich-text editor


# ---- helpers ------------------------------------------------------------------
async def _audit(db, *, actor, action, doc_id, facility_id=None, details=None):
    db.add(AuditLog(actor=actor or "system", action=action, entity_type="cafe_document",
                    entity_id=str(doc_id), facility_id=facility_id, details=details))


def _to_text(html: str | None) -> str:
    """Strip all tags to a plain-text extract (for preview/search)."""
    import nh3
    return nh3.clean(html or "", tags=set()).strip()


def _doc_summary(d: Document) -> dict:
    return {
        "id": d.id,
        "title": d.title,
        "group": d.group,
        "category": d.category,
        "tags": d.tags or [],
        "owner_type": d.owner_type,
        "facility_id": d.facility_id,
        "source_document_id": d.source_document_id,
        "source_version": d.source_version,
        # how this document originated: customized from TCS | uploaded file | authored in-app
        "origin": ("customized" if d.source_document_id else "uploaded" if d.draft_blob_key else "authored"),
        "current_version": d.current_version,
        "status": d.status,
        "is_archived": d.is_archived,
        "author": d.author,
        "draft_format": d.draft_format,
        "editable": d.draft_format in EDITABLE_FORMATS,
        "is_live": d.current_version >= 1,  # has at least one published version
        "effective_date": d.effective_date.isoformat() if d.effective_date else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }


async def _stale_map(db, docs: list) -> dict[int, int]:
    """For customized docs, map document.id -> source's current_version (to flag updates)."""
    src_ids = {d.source_document_id for d in docs if d.source_document_id}
    if not src_ids:
        return {}
    rows = (await db.execute(select(Document.id, Document.current_version).where(Document.id.in_(src_ids)))).all()
    cur = {sid: cv for sid, cv in rows}
    out: dict[int, int] = {}
    for d in docs:
        if d.source_document_id and d.source_document_id in cur:
            out[d.id] = cur[d.source_document_id]
    return out


async def _training_ref_map(db, docs: list) -> dict[int, int]:
    """Map document.id -> count of LMS courses sourcing their active material from it."""
    ids = [d.id for d in docs]
    if not ids:
        return {}
    rows = (await db.execute(
        select(CourseMaterial.cafe_document_id, func.count(func.distinct(CourseMaterial.course_id)))
        .where(CourseMaterial.cafe_document_id.in_(ids), CourseMaterial.is_active.is_(True))
        .group_by(CourseMaterial.cafe_document_id)
    )).all()
    return {did: cnt for did, cnt in rows}


async def _latest_review(db, doc_id: int) -> DocumentReview | None:
    return (await db.execute(
        select(DocumentReview).where(DocumentReview.document_id == doc_id)
        .order_by(DocumentReview.id.desc())
    )).scalars().first()


# ---- list / detail ------------------------------------------------------------
@router.get("/documents")
async def list_documents(
    facility_id: int | None = None,
    owner_type: str | None = None,
    include_archived: bool = False,
    status: str | None = None,
    q: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Document).order_by(Document.updated_at.desc())
    if owner_type:
        query = query.where(Document.owner_type == owner_type)
    if facility_id:
        query = query.where(
            (Document.facility_id == facility_id) | (Document.owner_type == "tcs")
        )
    if status:
        query = query.where(Document.status == status)
    if not include_archived:
        query = query.where(Document.is_archived.is_(False))
    if q:
        query = query.where(Document.title.ilike(f"%{q}%"))
    rows = (await db.execute(query)).scalars().all()
    stale = await _stale_map(db, rows)
    trefs = await _training_ref_map(db, rows)
    out = []
    for d in rows:
        s = _doc_summary(d)
        scur = stale.get(d.id)
        s["source_current_version"] = scur
        s["update_available"] = bool(scur and (d.source_version or 0) < scur)
        s["training_links"] = trefs.get(d.id, 0)
        out.append(s)
    return out


@router.get("/documents/{doc_id}")
async def get_document(doc_id: int, db: AsyncSession = Depends(get_db)):
    d = await db.get(Document, doc_id)
    if not d:
        raise HTTPException(404, "document not found")
    review = await _latest_review(db, doc_id)
    out = _doc_summary(d)
    scur = (await _stale_map(db, [d])).get(d.id)
    out["source_current_version"] = scur
    out["update_available"] = bool(scur and (d.source_version or 0) < scur)
    out["training_links"] = (await _training_ref_map(db, [d])).get(d.id, 0)
    out.update({
        "draft_html": d.draft_html,
        "draft_json": d.draft_json,
        "review": None if not review else {
            "id": review.id, "status": review.status, "version": review.version,
            "submitted_by": review.submitted_by, "reviewer": review.reviewer,
            "note": review.note,
            "submitted_at": review.submitted_at.isoformat() if review.submitted_at else None,
            "decided_at": review.decided_at.isoformat() if review.decided_at else None,
        },
    })
    return out


# ---- create / edit (authoring) ------------------------------------------------
class DocIn(BaseModel):
    title: str
    group: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    facility_id: int | None = None
    org_id: int | None = None
    owner_type: str = "customer"
    source_document_id: int | None = None
    content_html: str | None = None
    content_json: str | None = None
    author: str | None = None


@router.post("/documents")
async def create_document(payload: DocIn, db: AsyncSession = Depends(get_db)):
    """Create a new working draft (not yet published; current_version = 0)."""
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(422, "title is required")
    d = Document(
        title=title,
        group=payload.group,
        category=payload.category,
        tags=payload.tags or [],
        facility_id=payload.facility_id,
        org_id=payload.org_id,
        owner_type=payload.owner_type,
        source_document_id=payload.source_document_id,
        current_version=0,
        status=STATUS_DRAFT,
        author=payload.author,
        draft_html=sanitize_html(payload.content_html),
        draft_json=payload.content_json,
        draft_format="html",
    )
    db.add(d)
    await db.flush()
    await _audit(db, actor=payload.author, action="create", doc_id=d.id,
                 facility_id=d.facility_id, details=f"Created draft '{d.title}'")
    return {"id": d.id}


class DocPatch(BaseModel):
    title: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    content_html: str | None = None
    content_json: str | None = None
    effective_date: str | None = None
    actor: str | None = None


@router.patch("/documents/{doc_id}")
async def update_document(doc_id: int, payload: DocPatch, db: AsyncSession = Depends(get_db)):
    """Autosave / edit the working draft. Editing a published doc starts a new draft
    cycle; editing while in review is blocked (withdraw first)."""
    d = await db.get(Document, doc_id)
    if not d:
        raise HTTPException(404, "document not found")
    if d.owner_type == "tcs":
        raise HTTPException(400, "TCS source library is immutable; customize a Café copy instead")
    touches_content = payload.content_html is not None or payload.content_json is not None or payload.title is not None
    if d.status == STATUS_IN_REVIEW and touches_content:
        raise HTTPException(409, "document is in review — withdraw it before editing")

    if payload.title is not None:
        d.title = payload.title.strip() or d.title
    if payload.category is not None:
        d.category = payload.category
    if payload.tags is not None:
        d.tags = payload.tags
    if payload.content_html is not None:
        d.draft_html = sanitize_html(payload.content_html)
    if payload.content_json is not None:
        d.draft_json = payload.content_json
    if payload.effective_date is not None:
        d.effective_date = date.fromisoformat(payload.effective_date) if payload.effective_date else None
    # editing a live/approved doc reopens the draft cycle for the next version
    if touches_content and d.status in (STATUS_PUBLISHED, STATUS_APPROVED):
        d.status = STATUS_DRAFT
    await db.flush()
    await db.refresh(d)  # load server-side onupdate(updated_at) before serializing
    return _doc_summary(d)


# ---- upload (with .docx -> HTML conversion) -----------------------------------
@router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    facility_id: int | None = Form(default=None),
    org_id: int | None = Form(default=None),
    group: str | None = Form(default=None),
    category: str | None = Form(default=None),
    tags: str | None = Form(default=None),
    uploaded_by: str | None = Form(default="Customer Admin"),
    db: AsyncSession = Depends(get_db),
):
    """Upload a document. Word files are converted to editable HTML (mammoth); the
    original file is retained in storage. Lands as a draft for the approval workflow."""
    name = file.filename or "upload"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in ALLOWED_DOC:
        raise HTTPException(400, f"file type .{ext or '?'} not allowed (allowed: {', '.join(sorted(ALLOWED_DOC))})")
    blob = await file.read()
    title = name.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").strip().title()

    draft_html = None
    if ext in ("docx", "doc"):
        try:
            import mammoth
            draft_html = sanitize_html(mammoth.convert_to_html(io.BytesIO(blob)).value)
        except Exception:
            draft_html = "<p><em>This Word document could not be auto-converted. The original is preserved for download.</em></p>"
    elif ext == "txt":
        draft_html = sanitize_html("<p>" + blob.decode("utf-8", "replace").replace("\n", "<br>") + "</p>")
    elif ext == "html":
        draft_html = sanitize_html(blob.decode("utf-8", "replace"))

    blob_key = await storage.put(db, blob, content_type=file.content_type or "application/octet-stream", filename=name)
    tag_list = [t.strip() for t in (tags or "").split(",") if t.strip()]
    d = Document(
        title=title, group=group, category=category or "Uncategorized", tags=tag_list,
        owner_type="customer", facility_id=facility_id, org_id=org_id,
        current_version=0, status=STATUS_DRAFT, author=uploaded_by,
        draft_html=draft_html, draft_format=ext, draft_blob_key=blob_key,
    )
    db.add(d)
    await db.flush()
    await _audit(db, actor=uploaded_by, action="upload", doc_id=d.id, facility_id=facility_id,
                 details=f"Uploaded {name} ({max(1, len(blob)//1024)}KB)")
    return {"id": d.id, "title": d.title, "draft_format": ext, "editable": ext in EDITABLE_FORMATS,
            "size_kb": max(1, len(blob) // 1024)}


# ---- approval workflow --------------------------------------------------------
class SubmitIn(BaseModel):
    actor: str | None = None


@router.post("/documents/{doc_id}/submit")
async def submit_for_review(doc_id: int, payload: SubmitIn, db: AsyncSession = Depends(get_db)):
    d = await db.get(Document, doc_id)
    if not d:
        raise HTTPException(404, "document not found")
    if d.status not in (STATUS_DRAFT,):
        raise HTTPException(409, f"can only submit a draft (current status: {d.status})")
    target_version = d.current_version + 1
    db.add(DocumentReview(document_id=d.id, version=target_version, status="pending",
                          submitted_by=payload.actor))
    d.status = STATUS_IN_REVIEW
    await db.flush()
    await _audit(db, actor=payload.actor, action="submit", doc_id=d.id, facility_id=d.facility_id,
                 details=f"Submitted v{target_version} for review")
    db.add(Notification(facility_id=d.facility_id, title=f"Review requested: {d.title}",
                        body=f"{payload.actor or 'A colleague'} submitted v{target_version} for approval.",
                        kind="policy_update"))
    return {"id": d.id, "status": d.status, "version": target_version}


@router.post("/documents/{doc_id}/withdraw")
async def withdraw_review(doc_id: int, payload: SubmitIn, db: AsyncSession = Depends(get_db)):
    d = await db.get(Document, doc_id)
    if not d or d.status != STATUS_IN_REVIEW:
        raise HTTPException(409, "no active review to withdraw")
    review = await _latest_review(db, doc_id)
    if review and review.status == "pending":
        review.status = "withdrawn"
        review.decided_at = datetime.utcnow()
    d.status = STATUS_DRAFT
    await db.flush()
    await _audit(db, actor=payload.actor, action="withdraw", doc_id=d.id, facility_id=d.facility_id)
    return {"id": d.id, "status": d.status}


class ReviewIn(BaseModel):
    decision: str           # approve | reject
    reviewer: str
    note: str | None = None


@router.post("/documents/{doc_id}/review")
async def review_document(doc_id: int, payload: ReviewIn, db: AsyncSession = Depends(get_db)):
    """Peer review. A reviewer who is NOT the submitter approves or rejects."""
    d = await db.get(Document, doc_id)
    if not d:
        raise HTTPException(404, "document not found")
    if d.status != STATUS_IN_REVIEW:
        raise HTTPException(409, "document is not awaiting review")
    review = await _latest_review(db, doc_id)
    if not review or review.status != "pending":
        raise HTTPException(409, "no pending review")
    if payload.reviewer and review.submitted_by and payload.reviewer.strip().lower() == review.submitted_by.strip().lower():
        raise HTTPException(403, "a document must be reviewed by someone other than its author")

    review.reviewer = payload.reviewer
    review.decided_at = datetime.utcnow()
    review.note = payload.note
    if payload.decision == "approve":
        review.status = "approved"
        d.status = STATUS_APPROVED
        action, body = "approve", f"v{review.version} approved by {payload.reviewer}."
    else:
        review.status = "rejected"
        d.status = STATUS_DRAFT
        action, body = "reject", f"v{review.version} sent back: {payload.note or 'changes requested'}."
    await db.flush()
    await _audit(db, actor=payload.reviewer, action=action, doc_id=d.id, facility_id=d.facility_id,
                 details=payload.note)
    db.add(Notification(facility_id=d.facility_id, title=f"Review {review.status}: {d.title}",
                        body=body, kind="policy_update"))
    return {"id": d.id, "status": d.status, "review_status": review.status}


@router.get("/review-queue")
async def review_queue(facility_id: int, db: AsyncSession = Depends(get_db)):
    """Documents at this facility awaiting approval."""
    rows = (await db.execute(
        select(Document).where(Document.facility_id == facility_id, Document.status == STATUS_IN_REVIEW)
        .order_by(Document.updated_at.desc())
    )).scalars().all()
    out = []
    for d in rows:
        review = await _latest_review(db, d.id)
        s = _doc_summary(d)
        s["submitted_by"] = review.submitted_by if review else None
        s["submitted_at"] = review.submitted_at.isoformat() if review and review.submitted_at else None
        out.append(s)
    return out


# ---- publish ------------------------------------------------------------------
class PublishIn(BaseModel):
    note: str | None = None
    actor: str | None = None
    assign_profile: str | None = None       # e.g. "clinical"; None = all staff
    link_training_course_id: int | None = None
    effective_date: str | None = None


@router.post("/documents/{doc_id}/publish")
async def publish_new_version(doc_id: int, payload: PublishIn, db: AsyncSession = Depends(get_db)):
    """Publish the approved draft: snapshot an immutable version, notify, and fan out
    policy-acknowledgement tasks (mirrored as LMS assignments) to affected staff."""
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    if doc.owner_type == "tcs":
        raise HTTPException(400, "TCS source library is immutable; customize a Café copy instead")
    if doc.status != STATUS_APPROVED:
        raise HTTPException(409, "only an approved document can be published — submit it for review first")

    new_version = doc.current_version + 1
    db.add(DocumentVersion(
        document_id=doc.id, version=new_version,
        content=_to_text(doc.draft_html), content_html=doc.draft_html, content_json=doc.draft_json,
        blob_key=doc.draft_blob_key, file_format=doc.draft_format,
        note=payload.note or f"Published v{new_version}", created_by=payload.actor or doc.author,
    ))
    doc.current_version = new_version
    doc.status = STATUS_PUBLISHED
    if payload.effective_date:
        doc.effective_date = date.fromisoformat(payload.effective_date)

    # affected staff at the facility — they get a policy acknowledgement (a Café-side
    # sign-off). The Café does NOT create LMS training assignments; training is assigned
    # by a user (or recommended by POC). Linked courses still roll to the new version below.
    uq = select(User).where(User.is_active.is_(True))
    if doc.facility_id:
        uq = uq.where(User.facility_id == doc.facility_id)
    if payload.assign_profile and payload.assign_profile != "all":
        uq = uq.where(User.profile == payload.assign_profile)
    staff = (await db.execute(uq)).scalars().all()

    acks = 0
    for u in staff:
        db.add(PolicyAcknowledgement(document_id=doc.id, document_version=new_version,
                                     user_id=u.id, facility_id=u.facility_id))
        acks += 1

    await db.flush()
    # Roll any LMS course that uses this policy onto the new version automatically.
    from app.modules.lms.cafe_sync import propagate_cafe_version
    courses_bumped = await propagate_cafe_version(
        db, document_id=doc.id, new_version=new_version, doc_title=doc.title, actor=payload.actor)

    await _audit(db, actor=payload.actor, action="publish", doc_id=doc.id, facility_id=doc.facility_id,
                 details=f"Published v{new_version}; {acks} acknowledgement task(s)" +
                         (f"; {courses_bumped} linked course(s) updated" if courses_bumped else ""))
    body = f"Version {new_version} is now in effect. {acks} staff acknowledgement task(s) created."
    if courses_bumped:
        body += f" {courses_bumped} linked course(s) rolled to the new version."
    db.add(Notification(facility_id=doc.facility_id, title=f"Policy published: {doc.title}",
                        body=body, kind="policy_update"))
    return {"document_id": doc.id, "new_version": new_version, "acknowledgements_created": acks,
            "courses_bumped": courses_bumped}


# ---- versions -----------------------------------------------------------------
@router.get("/documents/{doc_id}/versions")
async def list_versions(doc_id: int, db: AsyncSession = Depends(get_db)):
    d = await db.get(Document, doc_id)
    rows = (await db.execute(
        select(DocumentVersion).where(DocumentVersion.document_id == doc_id)
        .order_by(DocumentVersion.version.desc())
    )).scalars().all()
    return [
        {
            "id": v.id, "version": v.version, "note": v.note, "created_by": v.created_by,
            "file_format": v.file_format, "size_kb": v.size_kb,
            "is_current": d is not None and v.version == d.current_version,
            "created_at": v.created_at.isoformat() if v.created_at else None,
        }
        for v in rows
    ]


@router.get("/documents/{doc_id}/versions/{version}")
async def get_version(doc_id: int, version: int, db: AsyncSession = Depends(get_db)):
    v = (await db.execute(
        select(DocumentVersion).where(DocumentVersion.document_id == doc_id, DocumentVersion.version == version)
    )).scalars().first()
    if not v:
        raise HTTPException(404, "version not found")
    return {"version": v.version, "content_html": v.content_html, "content_json": v.content_json,
            "note": v.note, "file_format": v.file_format,
            "created_by": v.created_by, "created_at": v.created_at.isoformat() if v.created_at else None}


# ---- download (PDF for Word/HTML; original for binary) -------------------------
@router.get("/documents/{doc_id}/download")
async def download_document(
    doc_id: int, version: int | None = None, fmt: str = "pdf",
    actor: str | None = None, db: AsyncSession = Depends(get_db),
):
    d = await db.get(Document, doc_id)
    if not d:
        raise HTTPException(404, "document not found")

    # resolve the version (or the working draft if never published)
    v = None
    if d.current_version >= 1:
        target = version or d.current_version
        v = (await db.execute(
            select(DocumentVersion).where(DocumentVersion.document_id == doc_id, DocumentVersion.version == target)
        )).scalars().first()
    html = (v.content_html if v else d.draft_html) or ""
    file_format = (v.file_format if v else d.draft_format)
    blob_key = (v.blob_key if v else d.draft_blob_key)

    db.add(DocumentEvent(document_id=doc_id, version=(v.version if v else None), kind="download", actor=actor))
    await db.flush()

    fac = await db.get(Facility, d.facility_id) if d.facility_id else None
    safe = "".join(c if c.isalnum() or c in " -_" else "_" for c in d.title).strip() or "document"

    # Word/HTML/text -> branded PDF (the "Word downloads as PDF" requirement)
    if fmt == "pdf" and file_format in ("html", "docx", "doc", "txt"):
        pdf = render_document_pdf(title=d.title, html=html, facility_name=fac.name if fac else None,
                                  category=d.category, version=(v.version if v else None), status=d.status)
        return Response(content=pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'inline; filename="{safe}.pdf"'})

    # otherwise serve the original stored file (pdf already-pdf, xlsx, images, ...)
    if blob_key:
        got = await storage.get(db, blob_key)
        if got:
            data, ctype, filename = got
            return Response(content=data, media_type=ctype or "application/octet-stream",
                            headers={"Content-Disposition": f'inline; filename="{filename or safe}"'})
    # fallback: render whatever HTML we have to PDF
    pdf = render_document_pdf(title=d.title, html=html or "<p><em>No content.</em></p>",
                              facility_name=fac.name if fac else None, category=d.category,
                              version=(v.version if v else None), status=d.status)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{safe}.pdf"'})


# ---- metrics + audit + training history ---------------------------------------
class EventIn(BaseModel):
    kind: str = "view"
    actor: str | None = None
    user_id: int | None = None


@router.post("/documents/{doc_id}/events")
async def record_event(doc_id: int, payload: EventIn, db: AsyncSession = Depends(get_db)):
    db.add(DocumentEvent(document_id=doc_id, kind=payload.kind, actor=payload.actor, user_id=payload.user_id))
    return {"ok": True}


@router.get("/documents/{doc_id}/metrics")
async def document_metrics(doc_id: int, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(DocumentEvent.kind, func.count()).where(DocumentEvent.document_id == doc_id)
        .group_by(DocumentEvent.kind)
    )).all()
    counts = {k: n for k, n in rows}
    uniq = (await db.execute(
        select(func.count(func.distinct(DocumentEvent.actor))).where(DocumentEvent.document_id == doc_id)
    )).scalar() or 0
    return {"views": counts.get("view", 0), "downloads": counts.get("download", 0), "unique_viewers": uniq}


@router.get("/documents/{doc_id}/audit")
async def document_audit(doc_id: int, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(AuditLog).where(AuditLog.entity_type == "cafe_document", AuditLog.entity_id == str(doc_id))
        .order_by(AuditLog.created_at.desc()).limit(100)
    )).scalars().all()
    return [{"actor": a.actor, "action": a.action, "details": a.details,
             "created_at": a.created_at.isoformat() if a.created_at else None} for a in rows]


@router.get("/documents/{doc_id}/training")
async def document_training(doc_id: int, db: AsyncSession = Depends(get_db)):
    """Training history for a document: assignments fanned out from its publishes,
    with completion counts. Drives the delete-guard ('completed -> locked')."""
    rows = (await db.execute(
        select(TrainingAssignment).where(TrainingAssignment.source_ref.ilike(f"doc:{doc_id}:%"))
    )).scalars().all()
    total = len(rows)
    completed = sum(1 for a in rows if a.status == "completed")
    # LMS courses whose active material is sourced from this Café document (single-source link)
    linked = (await db.execute(
        select(CourseMaterial).where(CourseMaterial.cafe_document_id == doc_id, CourseMaterial.is_active.is_(True))
    )).scalars().all()
    linked_course_ids = {m.course_id for m in linked}
    linked_courses = []
    if linked_course_ids:
        crows = (await db.execute(
            select(TrainingCourse).where(TrainingCourse.id.in_(linked_course_ids))
        )).scalars().all()
        # how many staff are actively assigned to these courses (will re-acknowledge)
        arows = (await db.execute(
            select(TrainingAssignment).where(TrainingAssignment.course_id.in_(linked_course_ids))
        )).scalars().all()
        assigned_by_course: dict[int, int] = {}
        for a in arows:
            assigned_by_course[a.course_id] = assigned_by_course.get(a.course_id, 0) + 1
        linked_courses = [{"id": c.id, "title": c.title, "assigned": assigned_by_course.get(c.id, 0)} for c in crows]
    return {
        "assigned": total,
        "completed": completed,
        "outstanding": total - completed,
        "deletable": completed == 0,            # cannot delete once anyone has completed
        "removable_training": total > 0 and completed == 0,  # can unlink, then delete
        "linked_courses": linked_courses,
        "linked_assigned": sum(c["assigned"] for c in linked_courses),
    }


# ---- delete (guarded) + unlink training ---------------------------------------
@router.post("/documents/{doc_id}/unlink-training")
async def unlink_training(doc_id: int, db: AsyncSession = Depends(get_db)):
    """Remove the document's outstanding training (only if nobody has completed it)."""
    rows = (await db.execute(
        select(TrainingAssignment).where(TrainingAssignment.source_ref.ilike(f"doc:{doc_id}:%"))
    )).scalars().all()
    if any(a.status == "completed" for a in rows):
        raise HTTPException(409, "training has completions — it cannot be removed (audit protection)")
    for a in rows:
        await db.delete(a)
    for ack in (await db.execute(
        select(PolicyAcknowledgement).where(PolicyAcknowledgement.document_id == doc_id)
    )).scalars().all():
        await db.delete(ack)
    await _audit(db, actor="system", action="unlink_training", doc_id=doc_id, details=f"Removed {len(rows)} assignment(s)")
    return {"ok": True, "removed": len(rows)}


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: int, db: AsyncSession = Depends(get_db)):
    d = await db.get(Document, doc_id)
    if not d:
        raise HTTPException(404, "document not found")
    if d.owner_type == "tcs":
        raise HTTPException(400, "TCS source documents cannot be deleted here")
    assigns = (await db.execute(
        select(TrainingAssignment).where(TrainingAssignment.source_ref.ilike(f"doc:{doc_id}:%"))
    )).scalars().all()
    if any(a.status == "completed" for a in assigns):
        raise HTTPException(409, "this document has completed training — it cannot be deleted (audit protection)")
    if assigns:
        raise HTTPException(409, "remove the linked training before deleting this document")

    # clean up owned rows + blobs
    for ack in (await db.execute(select(PolicyAcknowledgement).where(PolicyAcknowledgement.document_id == doc_id))).scalars().all():
        await db.delete(ack)
    for ev in (await db.execute(select(DocumentEvent).where(DocumentEvent.document_id == doc_id))).scalars().all():
        await db.delete(ev)
    for rv in (await db.execute(select(DocumentReview).where(DocumentReview.document_id == doc_id))).scalars().all():
        await db.delete(rv)
    for v in (await db.execute(select(DocumentVersion).where(DocumentVersion.document_id == doc_id))).scalars().all():
        if v.blob_key:
            await storage.delete(db, v.blob_key)
        await db.delete(v)
    if d.draft_blob_key:
        await storage.delete(db, d.draft_blob_key)
    await _audit(db, actor="system", action="delete", doc_id=doc_id, facility_id=d.facility_id,
                 details=f"Deleted '{d.title}'")
    await db.delete(d)
    return {"ok": True}


# ---- acknowledgements ---------------------------------------------------------
@router.get("/documents/{doc_id}/acknowledgements")
async def ack_status(doc_id: int, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(PolicyAcknowledgement, User)
        .join(User, PolicyAcknowledgement.user_id == User.id)
        .where(PolicyAcknowledgement.document_id == doc_id)
    )).all()
    return [{"id": a.id, "user_name": u.name, "version": a.document_version,
             "acknowledged": a.acknowledged,
             "acknowledged_at": a.acknowledged_at.isoformat() if a.acknowledged_at else None}
            for a, u in rows]


@router.post("/acknowledgements/{ack_id}/confirm")
async def confirm_ack(ack_id: int, db: AsyncSession = Depends(get_db)):
    a = await db.get(PolicyAcknowledgement, ack_id)
    if not a:
        raise HTTPException(404, "acknowledgement not found")
    a.acknowledged = True
    a.acknowledged_at = datetime.utcnow()
    return {"id": a.id, "acknowledged": True}


# ---- AI summary ---------------------------------------------------------------
@router.post("/documents/{doc_id}/summarize")
async def ai_summarize(doc_id: int, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    body = _to_text(doc.draft_html)[:4000]
    text = generate(f"Summarize this long-term-care compliance policy titled '{doc.title}'.\n\n{body}")
    return {"document_id": doc.id, "summary": text}


# ---- taxonomy (categories + tags) ---------------------------------------------
@router.get("/folders")
async def folders(facility_id: int | None = None, db: AsyncSession = Depends(get_db)):
    q = select(Document).where(Document.owner_type == "customer", Document.is_archived.is_(False))
    if facility_id:
        q = q.where(Document.facility_id == facility_id)
    rows = (await db.execute(q)).scalars().all()
    counts: dict[str, int] = {}
    for d in rows:
        c = d.category or "Uncategorized"
        counts[c] = counts.get(c, 0) + 1
    return [{"name": k, "count": v} for k, v in sorted(counts.items())]


@router.get("/taxonomy")
async def taxonomy(facility_id: int | None = None, db: AsyncSession = Depends(get_db)):
    """Distinct categories + tags across the facility's docs and the TCS library —
    powers category/tag pickers and the search facets UX."""
    q = select(Document).where(Document.is_archived.is_(False))
    if facility_id:
        q = q.where((Document.facility_id == facility_id) | (Document.owner_type == "tcs"))
    rows = (await db.execute(q)).scalars().all()
    cats: set[str] = set()
    tags: set[str] = set()
    for d in rows:
        if d.category:
            cats.add(d.category)
        for t in (d.tags or []):
            tags.add(t)
    return {"categories": sorted(cats), "tags": sorted(tags)}


# ---- unified search (customer + TCS) ------------------------------------------
@router.get("/search")
async def search(q: str, facility_id: int | None = None, db: AsyncSession = Depends(get_db)):
    query = select(Document).where(
        Document.is_archived.is_(False),
        or_(Document.title.ilike(f"%{q}%"), Document.category.ilike(f"%{q}%")),
    )
    if facility_id:
        query = query.where((Document.owner_type == "tcs") | (Document.facility_id == facility_id))
    rows = (await db.execute(query.limit(50))).scalars().all()
    out = [{
        "id": d.id, "title": d.title, "category": d.category, "tags": d.tags or [],
        "origin": "TCS Library" if d.owner_type == "tcs" else "Your facility",
        "owner_type": d.owner_type, "current_version": d.current_version,
        "customized": d.source_document_id is not None,
    } for d in rows]
    out.sort(key=lambda r: 0 if r["owner_type"] == "customer" else 1)
    return {"query": q, "count": len(out), "results": out}


# ---- customize a TCS source policy --------------------------------------------
@router.post("/documents/{doc_id}/customize")
async def customize(doc_id: int, facility_id: int, org_id: int | None = None, db: AsyncSession = Depends(get_db)):
    src = await db.get(Document, doc_id)
    if not src or src.owner_type != "tcs":
        raise HTTPException(400, "can only customize a TCS source policy")
    existing = (await db.execute(
        select(Document).where(Document.source_document_id == doc_id, Document.facility_id == facility_id)
    )).scalars().first()
    if existing:
        return {"id": existing.id, "existing": True}
    # bring the TCS content forward as the starting draft
    src_v = (await db.execute(
        select(DocumentVersion).where(DocumentVersion.document_id == src.id)
        .order_by(DocumentVersion.version.desc())
    )).scalars().first()
    copy = Document(
        title=f"{src.title} (Facility version)", group=src.group, category=src.category, tags=list(src.tags or []),
        owner_type="customer", facility_id=facility_id, org_id=org_id, source_document_id=src.id,
        source_version=src.current_version,
        current_version=0, status=STATUS_DRAFT, author="Customer Admin",
        draft_html=(src_v.content_html if src_v else None), draft_format="html",
    )
    db.add(copy)
    await db.flush()
    await _audit(db, actor="Customer Admin", action="customize", doc_id=copy.id, facility_id=facility_id,
                 details=f"Customized from TCS source '{src.title}'")
    return {"id": copy.id, "existing": False}


# ---- archive (surveyor "what was in effect on date X") ------------------------
@router.get("/archive")
async def archive(facility_id: int, as_of: str | None = None, topic: str | None = None,
                  db: AsyncSession = Depends(get_db)):
    as_of_dt = None
    if as_of:
        try:
            as_of_dt = datetime.fromisoformat(as_of)
        except ValueError:
            as_of_dt = None
    dq = select(Document).where(Document.owner_type == "customer", Document.facility_id == facility_id)
    if topic:
        dq = dq.where(or_(Document.title.ilike(f"%{topic}%"), Document.category.ilike(f"%{topic}%")))
    docs = (await db.execute(dq)).scalars().all()
    out = []
    for d in docs:
        versions = (await db.execute(
            select(DocumentVersion).where(DocumentVersion.document_id == d.id)
            .order_by(DocumentVersion.version.desc())
        )).scalars().all()
        eff = None
        for v in versions:
            if as_of_dt is None or (v.created_at and v.created_at.replace(tzinfo=None) <= as_of_dt):
                eff = v
                break
        if eff is None and versions:
            eff = versions[-1]
        if eff:
            out.append({"document_id": d.id, "title": d.title, "category": d.category,
                        "version_in_effect": eff.version, "note": eff.note,
                        "effective_from": eff.created_at.isoformat() if eff.created_at else None,
                        "current_version": d.current_version})
    return {"facility_id": facility_id, "as_of": as_of, "topic": topic, "documents": out}


# ---- bulk ZIP download --------------------------------------------------------
class BulkIn(BaseModel):
    document_ids: list[int]


@router.post("/documents/bulk-download")
async def bulk_download(payload: BulkIn, db: AsyncSession = Depends(get_db)):
    """Bundle selected documents into a ZIP of branded PDFs."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for did in payload.document_ids:
            d = await db.get(Document, did)
            if not d:
                continue
            v = (await db.execute(
                select(DocumentVersion).where(DocumentVersion.document_id == d.id)
                .order_by(DocumentVersion.version.desc())
            )).scalars().first()
            html = (v.content_html if v else d.draft_html) or ""
            safe = "".join(c if c.isalnum() or c in " -_" else "_" for c in d.title).strip() or "document"
            try:
                pdf = render_document_pdf(title=d.title, html=html, category=d.category,
                                          version=(v.version if v else None), status=d.status)
                zf.writestr(f"{safe} (v{d.current_version}).pdf", pdf)
            except Exception:
                zf.writestr(f"{safe}.txt", _to_text(html))
    return Response(content=buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="cafe_export.zip"'})


# ---- Category alert subscriptions ---------------------------------------------
@router.get("/subscriptions")
async def list_subscriptions(facility_id: int, db: AsyncSession = Depends(get_db)):
    """The categories this facility is subscribed to for publish alerts."""
    rows = (await db.execute(
        select(CategorySubscription).where(CategorySubscription.facility_id == facility_id)
    )).scalars().all()
    return {"facility_id": facility_id, "categories": sorted({r.category for r in rows})}


class SubscriptionsIn(BaseModel):
    facility_id: int
    categories: list[str]


@router.put("/subscriptions")
async def set_subscriptions(payload: SubscriptionsIn, db: AsyncSession = Depends(get_db)):
    """Replace the facility's alert subscriptions with the given categories."""
    for r in (await db.execute(
        select(CategorySubscription).where(CategorySubscription.facility_id == payload.facility_id)
    )).scalars().all():
        await db.delete(r)
    for cat in {c.strip() for c in payload.categories if c.strip()}:
        db.add(CategorySubscription(facility_id=payload.facility_id, category=cat))
    await db.flush()
    return {"facility_id": payload.facility_id, "categories": sorted(set(payload.categories))}


# ---- TCS library: taxonomy browse (scales to thousands) -----------------------
@router.get("/tcs/taxonomy")
async def tcs_taxonomy(db: AsyncSession = Depends(get_db)):
    """Group → category tree with document counts for the TCS source library."""
    rows = (await db.execute(
        select(Document.group, Document.category, func.count())
        .where(Document.owner_type == "tcs", Document.is_archived.is_(False))
        .group_by(Document.group, Document.category)
    )).all()
    groups: dict[str, dict] = {}
    total = 0
    for g, c, n in rows:
        gname = g or "Other"
        grp = groups.setdefault(gname, {"group": gname, "count": 0, "categories": {}})
        grp["count"] += n
        if c:
            grp["categories"][c] = grp["categories"].get(c, 0) + n
        total += n
    out = []
    for g in sorted(groups.values(), key=lambda x: x["group"]):
        out.append({"group": g["group"], "count": g["count"],
                    "categories": [{"name": k, "count": v} for k, v in sorted(g["categories"].items())]})
    return {"total": total, "groups": out}


@router.get("/tcs/library")
async def tcs_library(
    facility_id: int | None = None, group: str | None = None, category: str | None = None,
    q: str | None = None, sort: str = "title", dir: str = "asc", page: int = 1, page_size: int = 12,
    db: AsyncSession = Depends(get_db),
):
    """Paginated, filterable, sortable browse over the TCS source library."""
    base = select(Document).where(Document.owner_type == "tcs", Document.is_archived.is_(False))
    if group:
        base = base.where(Document.group == group)
    if category:
        base = base.where(Document.category == category)
    if q:
        base = base.where(or_(Document.title.ilike(f"%{q}%"), Document.category.ilike(f"%{q}%")))
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    page = max(1, page)
    col = {
        "title": Document.title, "category": Document.category,
        "version": Document.current_version, "updated": Document.updated_at,
    }.get(sort, Document.title)
    order_col = col.desc() if dir == "desc" else col.asc()
    rows = (await db.execute(
        base.order_by(order_col, Document.title.asc()).offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    # which of these the facility has already customized
    customized: set[int] = set()
    if facility_id:
        customized = {
            d.source_document_id for d in (await db.execute(
                select(Document).where(Document.facility_id == facility_id, Document.source_document_id.is_not(None))
            )).scalars().all() if d.source_document_id
        }
    return {
        "total": total, "page": page, "page_size": page_size,
        "items": [{
            "id": d.id, "title": d.title, "group": d.group, "category": d.category,
            "current_version": d.current_version, "tags": d.tags or [],
            "updated_at": d.updated_at.isoformat() if d.updated_at else None,
            "customized": d.id in customized,
        } for d in rows],
    }


# ---- Alerts feed: recent TCS releases (esp. subscribed) -----------------------
@router.get("/alerts/feed")
async def alerts_feed(facility_id: int, limit: int = 25, db: AsyncSession = Depends(get_db)):
    subs = {s.category for s in (await db.execute(
        select(CategorySubscription).where(CategorySubscription.facility_id == facility_id)
    )).scalars().all()}
    customized = {
        d.source_document_id for d in (await db.execute(
            select(Document).where(Document.facility_id == facility_id, Document.source_document_id.is_not(None))
        )).scalars().all() if d.source_document_id
    }
    rows = (await db.execute(
        select(Document).where(Document.owner_type == "tcs", Document.is_archived.is_(False))
        .order_by(Document.updated_at.desc()).limit(limit)
    )).scalars().all()
    items = [{
        "id": d.id, "title": d.title, "group": d.group, "category": d.category,
        "current_version": d.current_version,
        "published_at": d.updated_at.isoformat() if d.updated_at else None,
        "subscribed": d.category in subs, "customized": d.id in customized,
    } for d in rows]
    # newest first, then float subscribed items to the top (stable)
    items.sort(key=lambda r: r["published_at"] or "", reverse=True)
    items.sort(key=lambda r: not r["subscribed"])
    return {"facility_id": facility_id, "subscribed_categories": sorted(subs), "items": items}


# ---- TCS library publish (drives the alert fan-out) ---------------------------
class TcsPublishIn(BaseModel):
    document_id: int | None = None      # update an existing TCS doc, or...
    title: str | None = None            # ...create a new one
    category: str
    note: str | None = None
    content_html: str | None = None
    actor: str | None = "TCS R&D"


@router.post("/tcs/publish")
async def tcs_publish(payload: TcsPublishIn, db: AsyncSession = Depends(get_db)):
    """TCS publishes (or updates) a source-library document under a category, then
    alerts every facility subscribed to that category."""
    if payload.document_id:
        doc = await db.get(Document, payload.document_id)
        if not doc or doc.owner_type != "tcs":
            raise HTTPException(400, "not a TCS source document")
        doc.category = payload.category
        new_version = doc.current_version + 1
        doc.current_version = new_version
    else:
        if not payload.title:
            raise HTTPException(422, "title required for a new document")
        doc = Document(title=payload.title.strip(), category=payload.category, owner_type="tcs",
                       current_version=1, status=STATUS_PUBLISHED, author=payload.actor,
                       tags=["TCS source", payload.category])
        db.add(doc)
        await db.flush()
        new_version = 1

    html = sanitize_html(payload.content_html) if payload.content_html else None
    db.add(DocumentVersion(document_id=doc.id, version=new_version,
                           content_html=html, content=_to_text(html) if html else None,
                           note=payload.note or f"TCS release v{new_version}",
                           created_by=payload.actor, file_format="html"))

    # fan out to subscribed facilities
    subs = (await db.execute(
        select(CategorySubscription).where(CategorySubscription.category == payload.category)
    )).scalars().all()
    fac_ids = {s.facility_id for s in subs if s.facility_id}
    for fid in fac_ids:
        db.add(Notification(
            facility_id=fid, kind="regulatory",
            title=f"New TCS guidance: {doc.title}",
            body=f"TCS published v{new_version} under “{payload.category}”. Review and customize it for your facility.",
        ))
    # Facilities that already customized THIS source: tell them an update is available to reconcile.
    if payload.document_id:
        copies = (await db.execute(
            select(Document).where(Document.source_document_id == doc.id, Document.is_archived.is_(False))
        )).scalars().all()
        for c in copies:
            if c.facility_id:
                db.add(Notification(
                    facility_id=c.facility_id, kind="policy_update",
                    title=f"Update available: {c.title}",
                    body=f"TCS released v{new_version} of the source. Reconcile to fold the changes into your facility version.",
                ))
    await db.flush()
    await _audit(db, actor=payload.actor, action="tcs_publish", doc_id=doc.id,
                 details=f"TCS v{new_version} under {payload.category}; alerted {len(fac_ids)} facility(ies)")
    return {"document_id": doc.id, "version": new_version, "facilities_alerted": len(fac_ids)}


# ---- Home dashboard -----------------------------------------------------------
@router.get("/home")
async def home(facility_id: int, db: AsyncSession = Depends(get_db)):
    """KPIs + recent activity + alerts for the facility's policy operations."""
    docs = (await db.execute(
        select(Document).where(Document.owner_type == "customer", Document.facility_id == facility_id,
                               Document.is_archived.is_(False))
    )).scalars().all()
    published = sum(1 for d in docs if d.current_version >= 1)
    drafts = sum(1 for d in docs if d.status == STATUS_DRAFT and d.current_version < 1)
    in_review = sum(1 for d in docs if d.status == STATUS_IN_REVIEW)
    approved = sum(1 for d in docs if d.status == STATUS_APPROVED and d.current_version < 1)

    # Café alerts are TCS/policy-oriented (managed via TCS Library subscriptions).
    # LMS training notifications (e.g. "training assigned") belong to the LMS, not here.
    notifs = (await db.execute(
        select(Notification).where(
            or_(Notification.facility_id == facility_id, Notification.facility_id.is_(None)),
            Notification.kind.in_(["regulatory", "policy_update", "policy_alert", "info"]),
        ).order_by(Notification.created_at.desc()).limit(6)
    )).scalars().all()

    recent = sorted(docs, key=lambda d: d.updated_at or d.created_at, reverse=True)[:5]

    subs = {s.category for s in (await db.execute(
        select(CategorySubscription).where(CategorySubscription.facility_id == facility_id)
    )).scalars().all()}
    # new TCS releases (last 30d) in subscribed categories
    new_tcs = 0
    if subs:
        rows = (await db.execute(
            select(Document).where(Document.owner_type == "tcs", Document.category.in_(subs))
            .order_by(Document.updated_at.desc()).limit(50)
        )).scalars().all()
        new_tcs = len(rows)

    # --- attention: things a manager should act on (distinct from Analytics trends) ---
    stale = await _stale_map(db, docs)
    updates_available = sum(
        1 for d in docs if d.source_document_id and stale.get(d.id) and (d.source_version or 0) < stale[d.id]
    )
    adapted_total = sum(1 for d in docs if d.source_document_id)
    up_to_date = round(100 * (adapted_total - updates_available) / adapted_total) if adapted_total else 100

    # --- training reach: how policies flow into the LMS as a single source ---
    doc_ids = [d.id for d in docs]
    linked_rows = []
    if doc_ids:
        linked_rows = (await db.execute(
            select(CourseMaterial.cafe_document_id, CourseMaterial.course_id)
            .where(CourseMaterial.cafe_document_id.in_(doc_ids), CourseMaterial.is_active.is_(True))
        )).all()
    source_policies = len({did for did, _ in linked_rows})
    linked_course_ids = {cid for _, cid in linked_rows}
    train_assigned = train_completed = 0
    if linked_course_ids:
        arows = (await db.execute(
            select(TrainingAssignment.status).where(TrainingAssignment.course_id.in_(linked_course_ids))
        )).scalars().all()
        train_assigned = len(arows)
        train_completed = sum(1 for s in arows if s == "completed")
    train_rate = round(100 * train_completed / train_assigned) if train_assigned else 0

    acks = (await db.execute(
        select(PolicyAcknowledgement).where(PolicyAcknowledgement.facility_id == facility_id)
    )).scalars().all()
    ack_done = sum(1 for a in acks if a.acknowledged)

    return {
        "kpis": {"total": len(docs), "published": published, "drafts": drafts,
                 "in_review": in_review, "approved": approved, "new_tcs": new_tcs},
        "attention": {
            "pending_approvals": in_review,
            "updates_available": updates_available,
            "drafts": drafts + approved,
            "acks_outstanding": len(acks) - ack_done,
        },
        "policy_currency": {
            "up_to_date": up_to_date,
            "current": adapted_total - updates_available,
            "total": adapted_total,
        },
        "training": {
            "source_policies": source_policies,
            "linked_courses": len(linked_course_ids),
            "assigned": train_assigned,
            "completed": train_completed,
            "completion_rate": train_rate,
            "acks_total": len(acks),
            "acks_done": ack_done,
        },
        "notifications": [{"id": n.id, "title": n.title, "body": n.body, "kind": n.kind,
                           "is_read": n.is_read, "created_at": n.created_at.isoformat() if n.created_at else None}
                          for n in notifs],
        "recent": [_doc_summary(d) for d in recent],
    }


# ---- Analytics ----------------------------------------------------------------
@router.get("/analytics")
async def analytics(facility_id: int, db: AsyncSession = Depends(get_db)):
    docs = (await db.execute(
        select(Document).where(Document.owner_type == "customer", Document.facility_id == facility_id,
                               Document.is_archived.is_(False))
    )).scalars().all()
    doc_ids = [d.id for d in docs]

    by_status = {"Published": 0, "In review": 0, "Approved": 0, "Draft": 0}
    by_category: dict[str, int] = {}
    for d in docs:
        if d.current_version >= 1:
            by_status["Published"] += 1
        elif d.status == STATUS_IN_REVIEW:
            by_status["In review"] += 1
        elif d.status == STATUS_APPROVED:
            by_status["Approved"] += 1
        else:
            by_status["Draft"] += 1
        c = d.category or "Uncategorized"
        by_category[c] = by_category.get(c, 0) + 1

    # publishing timeline — versions per month, as a continuous trailing 8-month
    # series (gaps filled with 0) so the trend line reads smoothly.
    counts: dict[str, int] = {}
    if doc_ids:
        vers = (await db.execute(
            select(DocumentVersion.created_at).where(DocumentVersion.document_id.in_(doc_ids))
        )).scalars().all()
        for ts in vers:
            if ts:
                counts[ts.strftime("%Y-%m")] = counts.get(ts.strftime("%Y-%m"), 0) + 1
    now = datetime.utcnow()
    months: list[str] = []
    y, m = now.year, now.month
    for _ in range(8):
        months.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    months = list(reversed(months))
    timeline = {mo: counts.get(mo, 0) for mo in months}

    # usage
    views = downloads = 0
    if doc_ids:
        urows = (await db.execute(
            select(DocumentEvent.kind, func.count()).where(DocumentEvent.document_id.in_(doc_ids))
            .group_by(DocumentEvent.kind)
        )).all()
        um = {k: n for k, n in urows}
        views, downloads = um.get("view", 0), um.get("download", 0)

    acks = (await db.execute(
        select(PolicyAcknowledgement).where(PolicyAcknowledgement.facility_id == facility_id)
    )).scalars().all()
    ack_done = sum(1 for a in acks if a.acknowledged)

    return {
        "by_status": [{"name": k, "value": v} for k, v in by_status.items()],
        "by_category": sorted([{"name": k, "value": v} for k, v in by_category.items()],
                              key=lambda x: x["value"], reverse=True)[:8],
        "timeline": [{"month": m, "published": timeline[m]} for m in months],
        "usage": {"views": views, "downloads": downloads},
        "acknowledgement": {"total": len(acks), "done": ack_done,
                            "rate": round(100 * ack_done / len(acks)) if acks else 0},
        "totals": {"documents": len(docs), "published": by_status["Published"]},
    }


# ---- Full backup (ZIP of all facility policies as PDFs) -----------------------
@router.get("/backup")
async def backup(facility_id: int, db: AsyncSession = Depends(get_db)):
    docs = (await db.execute(
        select(Document).where(Document.owner_type == "customer", Document.facility_id == facility_id,
                               Document.is_archived.is_(False))
    )).scalars().all()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for d in docs:
            v = (await db.execute(
                select(DocumentVersion).where(DocumentVersion.document_id == d.id)
                .order_by(DocumentVersion.version.desc())
            )).scalars().first()
            html = (v.content_html if v else d.draft_html) or ""
            folder = (d.category or "Uncategorized").replace("/", "-")
            safe = "".join(c if c.isalnum() or c in " -_" else "_" for c in d.title).strip() or "document"
            try:
                pdf = render_document_pdf(title=d.title, html=html, category=d.category,
                                         version=(v.version if v else None), status=d.status)
                zf.writestr(f"{folder}/{safe} (v{d.current_version}).pdf", pdf)
            except Exception:
                zf.writestr(f"{folder}/{safe}.txt", _to_text(html))
    await _audit(db, actor="system", action="backup", doc_id=0, facility_id=facility_id,
                 details=f"Backup export of {len(docs)} document(s)")
    return Response(content=buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="policy_backup.zip"'})


# ---- Reconcile: fold a TCS source update into a customized facility policy -----
import re as _re
from app.llm import generate as _llm_generate, is_live as _llm_live

_BLOCK_RE = _re.compile(r'<(h1|h2|h3|p|ul|ol|table|blockquote)\b[^>]*>.*?</\1>', _re.DOTALL | _re.IGNORECASE)


def _blocks(html: str | None) -> list[str]:
    return [m.group(0).strip() for m in _BLOCK_RE.finditer(html or "")]


def _norm(b: str) -> str:
    return " ".join(_to_text(b).lower().split())


def _added_blocks(base_html: str | None, new_html: str | None) -> list[str]:
    base = {_norm(b) for b in _blocks(base_html)}
    return [b for b in _blocks(new_html) if _norm(b) and _norm(b) not in base]


def _deterministic_merge(base_html, new_html, current_html, new_version) -> str:
    added = _added_blocks(base_html, new_html)
    if not added:
        return current_html or ""
    block = f'<hr><h2>TCS v{new_version} updates (reconciled)</h2>' + "".join(added)
    return (current_html or "") + block


def _change_summary(base_html, new_html, new_version) -> str:
    added = _added_blocks(base_html, new_html)
    if not added:
        return "No substantive textual changes detected in the TCS update."
    items = "".join(f"<li>{_to_text(b)[:180]}</li>" for b in added[:8])
    return f"<p>TCS v{new_version} adds {len(added)} new/changed section(s):</p><ul>{items}</ul>"


def _ai_merge(base_html, new_html, current_html, new_version) -> tuple[str, str, bool]:
    """Return (merged_html, summary_html, used_ai)."""
    if _llm_live():
        try:
            merged = _llm_generate(
                "You are reconciling a long-term-care compliance policy. Three HTML documents follow.\n"
                "Produce a single MERGED policy in clean HTML that PRESERVES the facility's customizations "
                "while folding in the changes TCS made between the OLD source and the NEW source. "
                "Do not invent content; output only the HTML body.\n\n"
                f"--- TCS OLD SOURCE ---\n{base_html}\n\n--- TCS NEW SOURCE ---\n{new_html}\n\n"
                f"--- FACILITY CURRENT (preserve these edits) ---\n{current_html}",
                max_tokens=2000,
            )
            summary = _llm_generate(
                "Summarize, as concise HTML bullet points, what changed between the OLD and NEW TCS source.\n\n"
                f"--- OLD ---\n{base_html}\n\n--- NEW ---\n{new_html}",
                max_tokens=400,
            )
            if merged and len(merged) > 80:
                return sanitize_html(merged), sanitize_html(summary), True
        except Exception:
            pass
    return _deterministic_merge(base_html, new_html, current_html, new_version), _change_summary(base_html, new_html, new_version), False


async def _reconcile_sources(db, doc_id: int):
    d = await db.get(Document, doc_id)
    if not d or not d.source_document_id:
        raise HTTPException(400, "not a customized document")
    src = await db.get(Document, d.source_document_id)
    if not src:
        raise HTTPException(404, "source document not found")
    base_ver = d.source_version or 1
    base_v = (await db.execute(select(DocumentVersion).where(
        DocumentVersion.document_id == src.id, DocumentVersion.version == base_ver))).scalars().first()
    new_v = (await db.execute(select(DocumentVersion).where(
        DocumentVersion.document_id == src.id, DocumentVersion.version == src.current_version))).scalars().first()
    return d, src, base_v, new_v


@router.get("/documents/{doc_id}/reconcile")
async def reconcile_proposal(doc_id: int, db: AsyncSession = Depends(get_db)):
    d, src, base_v, new_v = await _reconcile_sources(db, doc_id)
    base_html = base_v.content_html if base_v else ""
    new_html = new_v.content_html if new_v else ""
    current_html = d.draft_html or ""
    merged, summary, used_ai = _ai_merge(base_html, new_html, current_html, src.current_version)
    return {
        "document_id": d.id, "title": d.title,
        "source_version": d.source_version, "source_current_version": src.current_version,
        "tcs_new_html": new_html, "current_html": current_html,
        "proposed_html": merged, "summary_html": summary, "used_ai": used_ai,
    }


class ReconcileApply(BaseModel):
    content_html: str
    actor: str | None = None


@router.post("/documents/{doc_id}/reconcile")
async def reconcile_apply(doc_id: int, payload: ReconcileApply, db: AsyncSession = Depends(get_db)):
    d = await db.get(Document, doc_id)
    if not d or not d.source_document_id:
        raise HTTPException(400, "not a customized document")
    src = await db.get(Document, d.source_document_id)
    d.draft_html = sanitize_html(payload.content_html)
    d.source_version = src.current_version if src else d.source_version
    d.status = STATUS_DRAFT
    await db.flush()
    await _audit(db, actor=payload.actor, action="reconcile", doc_id=d.id, facility_id=d.facility_id,
                 details=f"Reconciled to TCS v{d.source_version}")
    return {"ok": True, "source_version": d.source_version}

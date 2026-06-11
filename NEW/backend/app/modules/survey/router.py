from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.llm import generate
from app.modules.lms.models import TrainingAssignment, TrainingCourse
from app.modules.survey.models import (
    AuditFinding,
    AuditRun,
    AuditSchedule,
    AuditTemplate,
    Case,
    CaseAnswer,
    CaseFinding,
    Pathway,
    PathwayNode,
    PlanOfCorrection,
)
from app.shared.models import Facility, Notification, User

CADENCE_DAYS = {"daily": 1, "weekly": 7, "monthly": 30, "quarterly": 90}

router = APIRouter(prefix="/api/survey", tags=["survey"])


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


# ---- CEP catalog --------------------------------------------------------------
@router.get("/pathways")
async def list_pathways(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Pathway).where(Pathway.is_active.is_(True)))).scalars().all()
    return [
        {"id": p.id, "code": p.code, "slug": p.slug, "title": p.title, "description": p.description}
        for p in rows
    ]


@router.get("/pathways/{slug}")
async def get_pathway(slug: str, db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(Pathway).where(Pathway.slug == slug))).scalars().first()
    if not p:
        raise HTTPException(404, "pathway not found")
    nodes = (
        await db.execute(
            select(PathwayNode)
            .where(PathwayNode.pathway_id == p.id)
            .order_by(PathwayNode.display_order)
        )
    ).scalars().all()
    return {
        "id": p.id,
        "code": p.code,
        "slug": p.slug,
        "title": p.title,
        "description": p.description,
        "nodes": [
            {
                "id": n.id,
                "code": n.code,
                "section": n.section,
                "prompt": n.prompt,
                "deficiency_value": n.deficiency_value,
                "ftag": n.ftag,
                "ftag_title": n.ftag_title,
                "default_severity": n.default_severity,
            }
            for n in nodes
        ],
    }


# ---- Cases (mock survey runs) -------------------------------------------------
class CaseIn(BaseModel):
    facility_id: int
    pathway_id: int
    title: str | None = None
    resident_sample: str | None = None
    surveyor: str | None = "Demo Surveyor"


@router.post("/cases")
async def create_case(payload: CaseIn, db: AsyncSession = Depends(get_db)):
    p = await db.get(Pathway, payload.pathway_id)
    if not p:
        raise HTTPException(404, "pathway not found")
    case = Case(
        facility_id=payload.facility_id,
        pathway_id=payload.pathway_id,
        title=payload.title or f"Mock Survey - {p.title}",
        resident_sample=payload.resident_sample,
        surveyor=payload.surveyor,
    )
    db.add(case)
    await db.flush()
    return {"id": case.id}


@router.get("/cases")
async def list_cases(facility_id: int | None = None, db: AsyncSession = Depends(get_db)):
    q = select(Case, Pathway, Facility).join(Pathway, Case.pathway_id == Pathway.id).join(
        Facility, Case.facility_id == Facility.id
    ).order_by(Case.created_at.desc())
    if facility_id:
        q = q.where(Case.facility_id == facility_id)
    rows = (await db.execute(q)).all()
    return [
        {
            "id": c.id,
            "title": c.title,
            "pathway": p.title,
            "facility": f.name,
            "facility_id": c.facility_id,
            "status": c.status,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c, p, f in rows
    ]


class AnswerIn(BaseModel):
    node_id: int
    value: str  # yes | no | na
    note: str | None = None
    evidence: str | None = None


@router.post("/cases/{case_id}/answers")
async def submit_answer(case_id: int, payload: AnswerIn, db: AsyncSession = Depends(get_db)):
    case = await db.get(Case, case_id)
    if not case:
        raise HTTPException(404, "case not found")
    node = await db.get(PathwayNode, payload.node_id)
    if not node:
        raise HTTPException(404, "node not found")

    # Upsert the answer.
    existing = (
        await db.execute(
            select(CaseAnswer).where(
                CaseAnswer.case_id == case_id, CaseAnswer.node_id == payload.node_id
            )
        )
    ).scalars().first()
    if existing:
        existing.value = payload.value
        existing.note = payload.note
        existing.evidence = payload.evidence
    else:
        db.add(
            CaseAnswer(
                case_id=case_id,
                node_id=payload.node_id,
                value=payload.value,
                note=payload.note,
                evidence=payload.evidence,
            )
        )

    # Reconcile finding for this node: a deficiency value raises (or keeps) a finding;
    # any other value clears it.
    finding = (
        await db.execute(
            select(CaseFinding).where(
                CaseFinding.case_id == case_id, CaseFinding.node_id == payload.node_id
            )
        )
    ).scalars().first()
    created_finding = None
    if payload.value == node.deficiency_value and node.ftag:
        if not finding:
            finding = CaseFinding(
                case_id=case_id,
                node_id=node.id,
                facility_id=case.facility_id,
                ftag=node.ftag,
                ftag_title=node.ftag_title,
                severity=node.default_severity,
                summary=node.prompt,
            )
            db.add(finding)
            await db.flush()
            created_finding = finding.id
    elif finding and finding.status == "open":
        await db.delete(finding)

    return {"ok": True, "finding_created": created_finding}


@router.get("/cases/{case_id}/findings")
async def case_findings(case_id: int, db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(select(CaseFinding).where(CaseFinding.case_id == case_id))
    ).scalars().all()
    return [
        {
            "id": fnd.id,
            "ftag": fnd.ftag,
            "ftag_title": fnd.ftag_title,
            "severity": fnd.severity,
            "summary": fnd.summary,
            "status": fnd.status,
        }
        for fnd in rows
    ]


@router.post("/cases/{case_id}/complete")
async def complete_case(case_id: int, db: AsyncSession = Depends(get_db)):
    case = await db.get(Case, case_id)
    if not case:
        raise HTTPException(404, "case not found")
    case.status = "completed"
    case.completed_at = datetime.utcnow()
    n = (
        await db.execute(
            select(func.count()).select_from(CaseFinding).where(CaseFinding.case_id == case_id)
        )
    ).scalar()
    return {"id": case.id, "status": "completed", "findings": n}


# ---- AI assist (pre-fill + F-tag suggestion) ----------------------------------
@router.post("/cases/{case_id}/nodes/{node_id}/suggest")
async def ai_suggest(case_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    node = await db.get(PathwayNode, node_id)
    if not node:
        raise HTTPException(404, "node not found")
    text = generate(
        f"For this CEP survey element: '{node.prompt}'. Suggest the probable F-tag and a "
        f"one-line observation note a surveyor might record."
    )
    return {"node_id": node_id, "suggestion": text, "likely_ftag": node.ftag}


# ---- CMS-2567 PDF -------------------------------------------------------------
@router.get("/cases/{case_id}/report.pdf")
async def cms_2567(case_id: int, db: AsyncSession = Depends(get_db)):
    case = await db.get(Case, case_id)
    if not case:
        raise HTTPException(404, "case not found")
    facility = await db.get(Facility, case.facility_id)
    pathway = await db.get(Pathway, case.pathway_id)
    findings = (
        await db.execute(select(CaseFinding).where(CaseFinding.case_id == case_id))
    ).scalars().all()

    from fpdf import FPDF

    pdf = FPDF()
    pdf.set_auto_page_break(True, margin=15)
    pdf.add_page()
    w = pdf.epw  # effective page width
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 9, _s("CMS-2567 - Statement of Deficiencies (Mock)"), ln=True)
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 7, _s(f"Facility: {facility.name if facility else '-'}"), ln=True)
    pdf.cell(0, 7, _s(f"Pathway: {pathway.title if pathway else '-'} ({pathway.code if pathway else ''})"), ln=True)
    pdf.cell(0, 7, _s(f"Resident sample: {case.resident_sample or '-'}"), ln=True)
    pdf.cell(0, 7, _s(f"Surveyor: {case.surveyor or '-'}"), ln=True)
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Deficiencies", ln=True)
    pdf.set_font("Helvetica", "", 10)
    if not findings:
        pdf.cell(0, 7, "No deficiencies cited.", ln=True)
    for fnd in findings:
        pdf.set_x(pdf.l_margin)
        pdf.set_font("Helvetica", "B", 10)
        pdf.multi_cell(w, 6, _s(f"{fnd.ftag} - {fnd.ftag_title}  [{fnd.severity}]"))
        pdf.set_x(pdf.l_margin)
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(w, 6, _s(f"  {fnd.summary}"))
        pdf.ln(1)

    data = bytes(pdf.output())
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="cms2567_case{case_id}.pdf"'},
    )


# ---- Finding -> POC -> LMS handoff --------------------------------------------
class PocFromFindingIn(BaseModel):
    assign_training: bool = True
    target_profile: str | None = "clinical"


@router.post("/findings/{finding_id}/create-poc")
async def create_poc(
    finding_id: int, payload: PocFromFindingIn, db: AsyncSession = Depends(get_db)
):
    finding = await db.get(CaseFinding, finding_id)
    if not finding:
        raise HTTPException(404, "finding not found")

    corrective = generate(
        f"Draft a Plan of Correction for F-tag {finding.ftag} ({finding.ftag_title}). "
        f"Cover: what went wrong, how it was assessed across the facility, how staff will be "
        f"educated, and how ongoing monitoring will occur."
    )
    poc = PlanOfCorrection(
        finding_id=finding.id,
        facility_id=finding.facility_id,
        ftag=finding.ftag,
        corrective_action=corrective,
    )
    db.add(poc)
    finding.status = "poc_created"
    await db.flush()

    assigned = 0
    if payload.assign_training:
        # POC Education step -> LMS auto-assignment payload for affected staff.
        uq = select(User).where(
            User.is_active.is_(True), User.facility_id == finding.facility_id
        )
        if payload.target_profile and payload.target_profile != "all":
            uq = uq.where(User.profile == payload.target_profile)
        staff = (await db.execute(uq)).scalars().all()
        course = (
            await db.execute(
                select(TrainingCourse).where(TrainingCourse.title.ilike("%competency%"))
            )
        ).scalars().first()
        if not course:
            course = (await db.execute(select(TrainingCourse))).scalars().first()
        for u in staff:
            db.add(
                TrainingAssignment(
                    course_id=course.id,
                    user_id=u.id,
                    facility_id=u.facility_id,
                    assigned_by="POC Education step",
                    source="poc",
                    source_ref=f"poc:{poc.id}:{finding.ftag}",
                )
            )
            assigned += 1
        poc.training_assigned = True

    db.add(
        Notification(
            facility_id=finding.facility_id,
            title=f"POC created for {finding.ftag}",
            body=f"Corrective action drafted; {assigned} training assignment(s) created.",
            kind="regulatory",
        )
    )
    return {
        "poc_id": poc.id,
        "ftag": finding.ftag,
        "corrective_action": corrective,
        "training_assigned": assigned,
    }


@router.get("/pocs")
async def list_pocs(facility_id: int | None = None, db: AsyncSession = Depends(get_db)):
    q = select(PlanOfCorrection).order_by(PlanOfCorrection.created_at.desc())
    if facility_id:
        q = q.where(PlanOfCorrection.facility_id == facility_id)
    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "id": p.id,
            "finding_id": p.finding_id,
            "ftag": p.ftag,
            "status": p.status,
            "training_assigned": p.training_assigned,
            "corrective_action": p.corrective_action,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in rows
    ]


# ---- Audit Toolkit + QA outcomes ----------------------------------------------
@router.get("/audit/templates")
async def audit_templates(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(AuditTemplate))).scalars().all()
    return [
        {"id": t.id, "name": t.name, "cadence": t.cadence, "owner_type": t.owner_type}
        for t in rows
    ]


@router.get("/audit/runs")
async def audit_runs(facility_id: int | None = None, db: AsyncSession = Depends(get_db)):
    q = (
        select(AuditRun, AuditTemplate, Facility)
        .join(AuditTemplate, AuditRun.template_id == AuditTemplate.id)
        .join(Facility, AuditRun.facility_id == Facility.id)
        .order_by(AuditRun.run_date.desc())
    )
    if facility_id:
        q = q.where(AuditRun.facility_id == facility_id)
    rows = (await db.execute(q)).all()
    return [
        {
            "id": r.id,
            "template": t.name,
            "facility": f.name,
            "run_date": r.run_date.isoformat() if r.run_date else None,
            "passed": r.passed,
            "finding_summary": r.finding_summary,
        }
        for r, t, f in rows
    ]


@router.get("/qa/outcomes")
async def qa_outcomes(facility_id: int | None = None, db: AsyncSession = Depends(get_db)):
    """By-F-tag finding trend across mock surveys + audits."""
    q = select(CaseFinding.ftag, CaseFinding.ftag_title, func.count()).group_by(
        CaseFinding.ftag, CaseFinding.ftag_title
    )
    if facility_id:
        q = q.where(CaseFinding.facility_id == facility_id)
    rows = (await db.execute(q)).all()
    return [{"ftag": ft, "title": title, "count": n} for ft, title, n in rows]


# ---- AI resident-sample suggestion (Mock Survey assist) -----------------------
@router.post("/cases/{case_id}/suggest-sample")
async def suggest_sample(case_id: int, db: AsyncSession = Depends(get_db)):
    case = await db.get(Case, case_id)
    if not case:
        raise HTTPException(404, "case not found")
    pathway = await db.get(Pathway, case.pathway_id)
    text = generate(
        f"For a CMS Mock Survey on '{pathway.title if pathway else 'this pathway'}', recommend 5 "
        f"residents to sample by risk. Give a one-line rationale per resident."
    )
    # Deterministic structured sample so the UI always has rows to show.
    sample = [
        {"resident": "Resident 14 (Room 203B)", "risk": "high", "reason": "Stage 3 pressure injury, recent decline"},
        {"resident": "Resident 27 (Room 211A)", "risk": "high", "reason": "New admission, multiple wounds on intake"},
        {"resident": "Resident 8 (Room 118)", "risk": "medium", "reason": "History of falls + skin integrity flags"},
        {"resident": "Resident 33 (Room 224B)", "risk": "medium", "reason": "Incontinence care, moisture risk"},
        {"resident": "Resident 41 (Room 230A)", "risk": "low", "reason": "Routine review, stable"},
    ]
    return {"case_id": case_id, "narrative": text, "sample": sample}


# ---- Audit Toolkit: schedules -------------------------------------------------
class ScheduleIn(BaseModel):
    template_id: int
    facility_id: int
    cadence: str = "monthly"
    assigned_to: str | None = "DON"


@router.get("/audit/schedules")
async def list_schedules(facility_id: int, db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(AuditSchedule, AuditTemplate)
            .join(AuditTemplate, AuditSchedule.template_id == AuditTemplate.id)
            .where(AuditSchedule.facility_id == facility_id, AuditSchedule.active.is_(True))
            .order_by(AuditSchedule.next_due.asc().nulls_last())
        )
    ).all()
    return [
        {
            "id": s.id,
            "template": t.name,
            "cadence": s.cadence,
            "assigned_to": s.assigned_to,
            "next_due": s.next_due.isoformat() if s.next_due else None,
        }
        for s, t in rows
    ]


@router.post("/audit/schedules")
async def create_schedule(payload: ScheduleIn, db: AsyncSession = Depends(get_db)):
    s = AuditSchedule(
        template_id=payload.template_id,
        facility_id=payload.facility_id,
        cadence=payload.cadence,
        assigned_to=payload.assigned_to,
        next_due=datetime.utcnow() + timedelta(days=CADENCE_DAYS.get(payload.cadence, 30)),
    )
    db.add(s)
    await db.flush()
    return {"id": s.id, "next_due": s.next_due.isoformat()}


# ---- BYO audit template (customer upload) -------------------------------------
@router.post("/audit/templates")
async def create_audit_template(
    name: str = Form(...),
    cadence: str = Form(default="monthly"),
    facility_id: int | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    db: AsyncSession = Depends(get_db),
):
    desc = None
    if file is not None:
        blob = await file.read()
        desc = f"BYO upload: {file.filename} ({max(1, len(blob)//1024)}KB)"
    t = AuditTemplate(name=name, cadence=cadence, owner_type="customer", description=desc)
    db.add(t)
    await db.flush()
    return {"id": t.id, "name": t.name, "owner_type": "customer"}


# ---- Execute an audit run with follow-up automation ---------------------------
class ExecuteAuditIn(BaseModel):
    template_id: int
    facility_id: int
    passed: bool = True
    finding: str | None = None
    severity: str = "low"
    ftag: str | None = None
    assign_training: bool = False
    target_profile: str | None = "clinical"


@router.post("/audit/runs")
async def execute_audit(payload: ExecuteAuditIn, db: AsyncSession = Depends(get_db)):
    """Execute a recurring audit. A failed check fans out follow-ups:
    (1) training assignment via LMS, (2) policy-review flag, (3) dashboard alert,
    (4) a follow-up audit scheduled in 14 days."""
    run = AuditRun(
        template_id=payload.template_id,
        facility_id=payload.facility_id,
        passed=payload.passed,
        finding_summary=payload.finding,
    )
    db.add(run)
    await db.flush()

    follow_ups = {"training": 0, "policy_review": False, "follow_up_audit": False, "alert": False}
    if not payload.passed and payload.finding:
        finding = AuditFinding(
            run_id=run.id,
            facility_id=payload.facility_id,
            description=payload.finding,
            severity=payload.severity,
            ftag=payload.ftag,
        )
        db.add(finding)

        # (1) training assignment
        if payload.assign_training:
            uq = select(User).where(
                User.is_active.is_(True), User.facility_id == payload.facility_id
            )
            if payload.target_profile and payload.target_profile != "all":
                uq = uq.where(User.profile == payload.target_profile)
            staff = (await db.execute(uq)).scalars().all()
            course = (
                await db.execute(
                    select(TrainingCourse).where(TrainingCourse.title.ilike("%competency%"))
                )
            ).scalars().first() or (await db.execute(select(TrainingCourse))).scalars().first()
            for u in staff:
                db.add(
                    TrainingAssignment(
                        course_id=course.id, user_id=u.id, facility_id=u.facility_id,
                        assigned_by="Audit follow-up", source="audit",
                        source_ref=f"audit:{run.id}",
                    )
                )
            follow_ups["training"] = len(staff)
            finding.training_assigned = True

        # (2) policy review flag
        finding.policy_review = True
        follow_ups["policy_review"] = True

        # (4) follow-up audit in 14 days
        db.add(
            AuditSchedule(
                template_id=payload.template_id,
                facility_id=payload.facility_id,
                cadence="follow_up",
                assigned_to="DON",
                next_due=datetime.utcnow() + timedelta(days=14),
            )
        )
        finding.follow_up_audit = True
        follow_ups["follow_up_audit"] = True

        # (3) dashboard alert
        db.add(
            Notification(
                facility_id=payload.facility_id,
                title="Audit finding requires action",
                body=payload.finding,
                kind="regulatory",
            )
        )
        follow_ups["alert"] = True

    return {"run_id": run.id, "passed": payload.passed, "follow_ups": follow_ups}


# ---- Comprehensive QA report --------------------------------------------------
@router.get("/qa/report")
async def qa_report(facility_id: int, db: AsyncSession = Depends(get_db)):
    """Board-ready QA outcomes: by-CEP/F-tag trend, by-staff training completion,
    repeat-offender F-tags, audit pass rate."""
    # by F-tag
    ftags = [
        {"ftag": ft, "title": title, "count": n, "repeat": n > 1}
        for ft, title, n in (
            await db.execute(
                select(CaseFinding.ftag, CaseFinding.ftag_title, func.count())
                .where(CaseFinding.facility_id == facility_id)
                .group_by(CaseFinding.ftag, CaseFinding.ftag_title)
                .order_by(func.count().desc())
            )
        ).all()
    ]
    # by severity
    sev = {
        s: n
        for s, n in (
            await db.execute(
                select(CaseFinding.severity, func.count())
                .where(CaseFinding.facility_id == facility_id)
                .group_by(CaseFinding.severity)
            )
        ).all()
    }
    # audit pass rate
    runs = (
        await db.execute(select(AuditRun).where(AuditRun.facility_id == facility_id))
    ).scalars().all()
    passed = sum(1 for r in runs if r.passed)
    # training completion (reuse LMS assignment rollup)
    tcounts = {
        s: n
        for s, n in (
            await db.execute(
                select(TrainingAssignment.status, func.count())
                .where(TrainingAssignment.facility_id == facility_id)
                .group_by(TrainingAssignment.status)
            )
        ).all()
    }
    t_total = sum(tcounts.values())
    t_done = tcounts.get("completed", 0)
    return {
        "facility_id": facility_id,
        "by_ftag": ftags,
        "repeat_ftags": [f for f in ftags if f["repeat"]],
        "by_severity": sev,
        "audit_runs": len(runs),
        "audit_pass_rate": round(100 * passed / len(runs)) if runs else None,
        "training_completion": round(100 * t_done / t_total) if t_total else 0,
        "open_findings": (
            await db.execute(
                select(func.count()).select_from(CaseFinding).where(
                    CaseFinding.facility_id == facility_id, CaseFinding.status != "resolved"
                )
            )
        ).scalar(),
    }

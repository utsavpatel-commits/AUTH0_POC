from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


# ----- CEP definition (seeded content) -----------------------------------------
class Pathway(Base):
    """A Critical Element Pathway (CEP), e.g. Skin & Wound (CMS-20068)."""

    __tablename__ = "survey_pathways"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40))  # CMS form code
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    nodes: Mapped[list["PathwayNode"]] = relationship(
        back_populates="pathway", order_by="PathwayNode.display_order"
    )


class PathwayNode(Base):
    """A single observation/interview/record-review question in a CEP.
    Binary (Yes/No). A 'No' may raise a finding carrying an F-tag citation."""

    __tablename__ = "survey_nodes"

    id: Mapped[int] = mapped_column(primary_key=True)
    pathway_id: Mapped[int] = mapped_column(ForeignKey("survey_pathways.id"))
    code: Mapped[str] = mapped_column(String(60))
    section: Mapped[str] = mapped_column(String(60))  # Observations | Interviews | Record Review | Decisions
    prompt: Mapped[str] = mapped_column(Text)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    # The answer value that signals a deficiency (usually "no").
    deficiency_value: Mapped[str] = mapped_column(String(10), default="no")
    ftag: Mapped[str | None] = mapped_column(String(20))         # e.g. F686
    ftag_title: Mapped[str | None] = mapped_column(String(200))
    default_severity: Mapped[str] = mapped_column(String(20), default="potential")  # potential|actual|immediate_jeopardy

    pathway: Mapped["Pathway"] = relationship(back_populates="nodes")


# ----- A mock survey run -------------------------------------------------------
class Case(Base):
    __tablename__ = "survey_cases"

    id: Mapped[int] = mapped_column(primary_key=True)
    facility_id: Mapped[int] = mapped_column(ForeignKey("facilities.id"))
    pathway_id: Mapped[int] = mapped_column(ForeignKey("survey_pathways.id"))
    title: Mapped[str] = mapped_column(String(200))
    resident_sample: Mapped[str | None] = mapped_column(String(200))
    surveyor: Mapped[str | None] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(20), default="in_progress")  # in_progress|completed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    answers: Mapped[list["CaseAnswer"]] = relationship(back_populates="case")
    findings: Mapped[list["CaseFinding"]] = relationship(back_populates="case")


class CaseAnswer(Base):
    __tablename__ = "survey_answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("survey_cases.id"))
    node_id: Mapped[int] = mapped_column(ForeignKey("survey_nodes.id"))
    value: Mapped[str] = mapped_column(String(10))  # yes | no | na
    note: Mapped[str | None] = mapped_column(Text)
    evidence: Mapped[str | None] = mapped_column(Text)
    answered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    case: Mapped["Case"] = relationship(back_populates="answers")


class CaseFinding(Base):
    """A deficiency surfaced by the workflow — carries the F-tag citation + severity."""

    __tablename__ = "survey_findings"

    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("survey_cases.id"))
    node_id: Mapped[int | None] = mapped_column(ForeignKey("survey_nodes.id"))
    facility_id: Mapped[int] = mapped_column(ForeignKey("facilities.id"))
    ftag: Mapped[str | None] = mapped_column(String(20))
    ftag_title: Mapped[str | None] = mapped_column(String(200))
    severity: Mapped[str] = mapped_column(String(20), default="potential")
    summary: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | poc_created | resolved
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    case: Mapped["Case"] = relationship(back_populates="findings")


# ----- Audit Toolkit -----------------------------------------------------------
class AuditTemplate(Base):
    __tablename__ = "survey_audit_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    cadence: Mapped[str] = mapped_column(String(30), default="monthly")  # daily|weekly|monthly|quarterly
    owner_type: Mapped[str] = mapped_column(String(20), default="tcs")  # tcs | customer (BYO)
    description: Mapped[str | None] = mapped_column(Text)


class AuditRun(Base):
    __tablename__ = "survey_audit_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("survey_audit_templates.id"))
    facility_id: Mapped[int] = mapped_column(ForeignKey("facilities.id"))
    run_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    passed: Mapped[bool] = mapped_column(Boolean, default=True)
    finding_summary: Mapped[str | None] = mapped_column(Text)


class AuditSchedule(Base):
    """A recurring audit configured for a facility (Customer Admin / DON)."""

    __tablename__ = "survey_audit_schedules"

    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("survey_audit_templates.id"))
    facility_id: Mapped[int] = mapped_column(ForeignKey("facilities.id"))
    cadence: Mapped[str] = mapped_column(String(30), default="monthly")
    assigned_to: Mapped[str | None] = mapped_column(String(160))
    next_due: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditFinding(Base):
    """A deficiency captured during an audit run — drives follow-up automation."""

    __tablename__ = "survey_audit_findings"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("survey_audit_runs.id"))
    facility_id: Mapped[int] = mapped_column(ForeignKey("facilities.id"))
    description: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20), default="low")
    ftag: Mapped[str | None] = mapped_column(String(20))
    # follow-ups triggered
    training_assigned: Mapped[bool] = mapped_column(Boolean, default=False)
    policy_review: Mapped[bool] = mapped_column(Boolean, default=False)
    follow_up_audit: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ----- Plan of Correction (light surface; full POC Advanced is a stub) ----------
class PlanOfCorrection(Base):
    __tablename__ = "survey_pocs"

    id: Mapped[int] = mapped_column(primary_key=True)
    finding_id: Mapped[int] = mapped_column(ForeignKey("survey_findings.id"))
    facility_id: Mapped[int] = mapped_column(ForeignKey("facilities.id"))
    ftag: Mapped[str | None] = mapped_column(String(20))
    corrective_action: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft|submitted|monitoring|closed
    training_assigned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

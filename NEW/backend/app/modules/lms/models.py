from datetime import datetime, date

from sqlalchemy import Date, DateTime, ForeignKey, LargeBinary, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class LmsProgram(Base):
    """A configurable course bucket (curriculum/program). Customer-defined and
    shared org-wide so every facility in the org groups training the same way and
    the corporate roll-up compares facilities on the same programs."""
    __tablename__ = "lms_programs"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int | None] = mapped_column(ForeignKey("orgs.id"))
    key: Mapped[str] = mapped_column(String(60))  # stable slug courses reference
    name: Mapped[str] = mapped_column(String(120))
    icon: Mapped[str] = mapped_column(String(40), default="clipboard")  # icon key (see frontend PROGRAM_ICON)
    color: Mapped[str] = mapped_column(String(16), default="#64748b")
    sort_order: Mapped[int] = mapped_column(default=0)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TrainingCourse(Base):
    __tablename__ = "lms_courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    training_type: Mapped[str] = mapped_column(String(40), default="mandatory_annual")
    duration_hours: Mapped[float] = mapped_column(default=1.0)
    # All courses are customer-authored and facility-scoped (tenant). owner_type kept
    # for compatibility but always "customer" now (no TCS-curated library).
    owner_type: Mapped[str] = mapped_column(String(20), default="customer")
    owner_facility_id: Mapped[int | None] = mapped_column(ForeignKey("facilities.id"))
    target_profile: Mapped[str | None] = mapped_column(String(40))  # clinical, dietary, ...
    program: Mapped[str] = mapped_column(String(40), default="uncategorized")  # explicit bucket chosen at creation
    version: Mapped[int] = mapped_column(default=1)  # bumped when the document is replaced
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TrainingAssignment(Base):
    __tablename__ = "lms_assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("lms_courses.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    facility_id: Mapped[int | None] = mapped_column(ForeignKey("facilities.id"))
    course_version: Mapped[int] = mapped_column(default=1)  # which course version this assignment is for
    assigned_by: Mapped[str | None] = mapped_column(String(160))
    # source: manual | policy_ack | mock_survey | audit | poc
    source: Mapped[str] = mapped_column(String(30), default="manual")
    source_ref: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(20), default="assigned")  # assigned|in_progress|completed|overdue
    assigned_date: Mapped[date] = mapped_column(Date, server_default=func.now())
    due_date: Mapped[date | None] = mapped_column(Date)
    completed_date: Mapped[date | None] = mapped_column(Date)
    score: Mapped[int | None] = mapped_column()


class CourseMaterial(Base):
    """Customer-uploaded training document for a course. Versioned: replacing the
    document adds a new version and (optionally) marks prior versions inactive."""

    __tablename__ = "lms_course_materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("lms_courses.id"))
    facility_id: Mapped[int | None] = mapped_column(ForeignKey("facilities.id"))
    kind: Mapped[str] = mapped_column(String(20), default="document")  # document | video
    file_name: Mapped[str] = mapped_column(String(260))
    file_format: Mapped[str] = mapped_column(String(20), default="pdf")  # pdf/docx/... or 'youtube'
    file_path: Mapped[str | None] = mapped_column(String(400))
    url: Mapped[str | None] = mapped_column(String(500))  # for video materials (YouTube link)
    data: Mapped[bytes | None] = mapped_column(LargeBinary)  # stored uploaded file bytes (documents)
    # When sourced from a Document Café policy: the link + the version in use, so a
    # Café re-publish can propagate a new version into this course automatically.
    cafe_document_id: Mapped[int | None] = mapped_column(ForeignKey("cafe_documents.id"))
    cafe_version: Mapped[int | None] = mapped_column()
    size_kb: Mapped[int | None] = mapped_column()
    version: Mapped[int] = mapped_column(default=1)
    is_active: Mapped[bool] = mapped_column(default=True)
    uploaded_by: Mapped[str | None] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Certification(Base):
    __tablename__ = "lms_certifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(20), default="confirmed")  # confirmed|expired|not_confirmed
    confirmed_date: Mapped[date | None] = mapped_column(Date)
    expiration_date: Mapped[date | None] = mapped_column(Date)
    certificate_number: Mapped[str | None] = mapped_column(String(80))

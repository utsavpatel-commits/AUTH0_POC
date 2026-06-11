from datetime import datetime, date

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


# Document lifecycle (the working draft's state). A document is "live" — available
# for LMS training and global search — once it has at least one published version
# (current_version >= 1); `status` tracks the editing pipeline for the NEXT version.
#   draft -> in_review -> approved -> published   (reject sends it back to draft)
STATUS_DRAFT = "draft"
STATUS_IN_REVIEW = "in_review"
STATUS_APPROVED = "approved"
STATUS_PUBLISHED = "published"
STATUS_ARCHIVED = "archived"


class Document(Base):
    """A Document Café document. owner_type segregates customer IP from the
    TCS source library. The *working draft* lives on this row; immutable published
    history lives in DocumentVersion."""

    __tablename__ = "cafe_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(240))
    group: Mapped[str | None] = mapped_column(String(120))     # taxonomy top-level (esp. TCS library)
    category: Mapped[str | None] = mapped_column(String(120))  # taxonomy leaf
    tags: Mapped[list] = mapped_column(JSON, default=list)  # free-form labels
    owner_type: Mapped[str] = mapped_column(String(20), default="customer")  # customer | tcs
    facility_id: Mapped[int | None] = mapped_column(ForeignKey("facilities.id"))
    org_id: Mapped[int | None] = mapped_column(ForeignKey("orgs.id"))
    # If this customer doc was customized from a TCS source policy, link it +
    # remember which TCS version it was based on (drives the "update available" flow).
    source_document_id: Mapped[int | None] = mapped_column(ForeignKey("cafe_documents.id"))
    source_version: Mapped[int | None] = mapped_column(Integer)

    current_version: Mapped[int] = mapped_column(Integer, default=0)  # 0 = never published
    status: Mapped[str] = mapped_column(String(20), default=STATUS_DRAFT)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    author: Mapped[str | None] = mapped_column(String(160))
    effective_date: Mapped[date | None] = mapped_column(Date)  # optional "takes effect on"

    # Working draft (the in-progress next version). On publish this is snapshotted
    # into a DocumentVersion row.
    draft_html: Mapped[str | None] = mapped_column(Text)        # sanitized rendered HTML
    draft_json: Mapped[str | None] = mapped_column(Text)        # tiptap JSON (canonical)
    draft_format: Mapped[str] = mapped_column(String(20), default="html")  # html | docx | pdf ...
    draft_blob_key: Mapped[str | None] = mapped_column(String(64))  # original uploaded file, if any

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DocumentVersion(Base):
    """Immutable published version history — surveyor evidence ("what was in effect
    on date X"). Each row is a frozen snapshot of the document at publish time."""

    __tablename__ = "cafe_document_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("cafe_documents.id"))
    version: Mapped[int] = mapped_column(Integer)
    content: Mapped[str | None] = mapped_column(Text)          # plain-text extract (preview/search)
    content_html: Mapped[str | None] = mapped_column(Text)     # sanitized HTML body
    content_json: Mapped[str | None] = mapped_column(Text)     # tiptap JSON snapshot
    blob_key: Mapped[str | None] = mapped_column(String(64))   # original source file, if uploaded
    file_format: Mapped[str] = mapped_column(String(20), default="html")
    size_kb: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(String(300))
    created_by: Mapped[str | None] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DocumentReview(Base):
    """One approval cycle. Author submits a draft for a target version; a peer
    (any OTHER facility manager) approves or rejects with a note."""

    __tablename__ = "cafe_document_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("cafe_documents.id"))
    version: Mapped[int] = mapped_column(Integer)  # the version this submission would become
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | approved | rejected
    submitted_by: Mapped[str | None] = mapped_column(String(160))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewer: Mapped[str | None] = mapped_column(String(160))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(Text)  # reviewer comment (esp. on reject)


class DocumentEvent(Base):
    """Append-only usage event — powers view/download metrics. Aggregated on read."""

    __tablename__ = "cafe_document_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("cafe_documents.id"))
    version: Mapped[int | None] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(20))  # view | download
    actor: Mapped[str | None] = mapped_column(String(160))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CategorySubscription(Base):
    """A facility's alert preference: notify us when a document is published under
    this category (especially TCS library releases). Facility-scoped in this build;
    user_id is reserved so production can make alerts per-user without a migration."""

    __tablename__ = "cafe_category_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    facility_id: Mapped[int | None] = mapped_column(ForeignKey("facilities.id"))
    category: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PolicyAcknowledgement(Base):
    """The policy-to-training acknowledgement loop. A Café publish creates these for
    affected staff; completion is tracked back here (and mirrored as an LMS assignment)."""

    __tablename__ = "cafe_acknowledgements"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("cafe_documents.id"))
    document_version: Mapped[int] = mapped_column(Integer)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    facility_id: Mapped[int | None] = mapped_column(ForeignKey("facilities.id"))
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

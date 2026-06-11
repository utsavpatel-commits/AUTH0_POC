from datetime import datetime, date

from sqlalchemy import Date, DateTime, ForeignKey, LargeBinary, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class StoredBlob(Base):
    """Content-addressed binary store. Today blobs live in Postgres; the storage
    accessor (app.core.storage) is the only thing that touches this table, so a
    production deployment can swap it for S3/GCS without changing call sites."""

    __tablename__ = "stored_blobs"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    data: Mapped[bytes] = mapped_column(LargeBinary)
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    filename: Mapped[str | None] = mapped_column(String(300))
    size: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Org(Base):
    """A customer organization or sub-organization (parent_org_id set)."""

    __tablename__ = "orgs"

    id: Mapped[int] = mapped_column(primary_key=True)
    parent_org_id: Mapped[int | None] = mapped_column(ForeignKey("orgs.id"))
    name: Mapped[str] = mapped_column(String(200))
    address_line1: Mapped[str | None] = mapped_column(String(200))
    address_line2: Mapped[str | None] = mapped_column(String(200))
    city: Mapped[str | None] = mapped_column(String(120))
    state: Mapped[str | None] = mapped_column(String(40))
    postal_code: Mapped[str | None] = mapped_column(String(20))
    country: Mapped[str] = mapped_column(String(2), default="US")
    phone: Mapped[str | None] = mapped_column(String(40))
    contact_email: Mapped[str | None] = mapped_column(String(200))
    is_corporate: Mapped[bool] = mapped_column(default=False)
    tier: Mapped[str] = mapped_column(String(40), default="essentials")  # essentials | professional | enterprise
    mfa_override: Mapped[bool | None] = mapped_column(default=None)  # null = inherit platform default
    passwordless_override: Mapped[bool | None] = mapped_column(default=None)
    auth0_org_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    parent: Mapped["Org | None"] = relationship(remote_side="Org.id", back_populates="children")
    children: Mapped[list["Org"]] = relationship(back_populates="parent")
    facilities: Mapped[list["Facility"]] = relationship(back_populates="org")
    groups: Mapped[list["OrgGroup"]] = relationship(back_populates="org")
    invitations: Mapped[list["OrgInvitation"]] = relationship(back_populates="org")
    role_permissions: Mapped[list["OrgRolePermission"]] = relationship(back_populates="org")


class RoleDefinition(Base):
    """Platform-wide or organization-scoped role with permissions."""

    __tablename__ = "role_definitions"

    id: Mapped[int] = mapped_column(primary_key=True)
    scope: Mapped[str] = mapped_column(String(20))  # platform | organization
    org_id: Mapped[int | None] = mapped_column(ForeignKey("orgs.id"))
    slug: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(String(400))
    permissions: Mapped[str] = mapped_column(Text)  # JSON array
    is_system: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    org: Mapped["Org | None"] = relationship()


class OrgRolePermission(Base):
    """Per-organization permission overrides for built-in role slugs."""

    __tablename__ = "org_role_permissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("orgs.id"))
    role: Mapped[str] = mapped_column(String(40))
    permissions: Mapped[str] = mapped_column(Text)  # JSON array of area ids
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    org: Mapped["Org"] = relationship(back_populates="role_permissions")


class OrgGroup(Base):
    __tablename__ = "org_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("orgs.id"))
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(String(400))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    org: Mapped["Org"] = relationship(back_populates="groups")


class OrgInvitation(Base):
    __tablename__ = "org_invitations"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("orgs.id"))
    email: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(40), default="end_user")
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | sent | accepted
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    org: Mapped["Org"] = relationship(back_populates="invitations")


class Facility(Base):
    __tablename__ = "facilities"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int | None] = mapped_column(ForeignKey("orgs.id"))
    name: Mapped[str] = mapped_column(String(200))
    city: Mapped[str | None] = mapped_column(String(120))
    state: Mapped[str | None] = mapped_column(String(2))
    beds: Mapped[int | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    org: Mapped["Org | None"] = relationship(back_populates="facilities")
    users: Mapped[list["User"]] = relationship(back_populates="facility")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int | None] = mapped_column(ForeignKey("orgs.id"))
    facility_id: Mapped[int | None] = mapped_column(ForeignKey("facilities.id"))
    name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(40), default="end_user")
    profile: Mapped[str] = mapped_column(String(40), default="all")  # business profile (clinical, dietary, ...)
    job_title: Mapped[str | None] = mapped_column(String(120))
    hire_date: Mapped[date | None] = mapped_column(Date)
    # demo auth: frontline learners sign in with a one-time email code (this token)
    # instead of a password. Staff/admins use a password (mock). null = not invited.
    temp_token: Mapped[str | None] = mapped_column(String(80))
    custom_permissions: Mapped[str | None] = mapped_column(Text)  # JSON array; overrides org role defaults
    demo_password: Mapped[str | None] = mapped_column(String(80))  # demo credentials for POC staff login
    password_set: Mapped[bool] = mapped_column(default=False)  # False until first Auth0 password login
    is_active: Mapped[bool] = mapped_column(default=True)

    facility: Mapped["Facility | None"] = relationship(back_populates="users")


class TcsStaff(Base):
    """TCS internal team — Auth0 password login; org/role management stays in local DB."""

    __tablename__ = "tcs_staff"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    role: Mapped[str] = mapped_column(String(40), default="tcs_admin")
    auth0_sub: Mapped[str | None] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TcsPlatformSettings(Base):
    """Platform-wide security toggles managed from the TCS admin console."""

    __tablename__ = "tcs_platform_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    mfa_enabled: Mapped[bool] = mapped_column(default=False)
    passwordless_enabled: Mapped[bool] = mapped_column(default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int | None] = mapped_column(ForeignKey("orgs.id"))
    actor: Mapped[str | None] = mapped_column(String(160))
    action: Mapped[str] = mapped_column(String(60))
    entity_type: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[str | None] = mapped_column(String(60))
    facility_id: Mapped[int | None] = mapped_column(ForeignKey("facilities.id"))
    details: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    facility_id: Mapped[int | None] = mapped_column(ForeignKey("facilities.id"))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(40), default="info")  # info | training_due | policy_update | regulatory
    is_read: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

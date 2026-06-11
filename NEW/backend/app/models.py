"""Aggregator that imports every model so they register on Base.metadata.
Import this module (not the individual model modules) when you need all tables."""

from app.shared.models import (  # noqa: F401
    AuditLog,
    Facility,
    Notification,
    Org,
    OrgGroup,
    OrgInvitation,
    OrgRolePermission,
    RoleDefinition,
    StoredBlob,
    TcsPlatformSettings,
    TcsStaff,
    User,
)
from app.modules.lms.models import (  # noqa: F401
    Certification,
    CourseMaterial,
    TrainingAssignment,
    TrainingCourse,
)
from app.modules.cafe.models import (  # noqa: F401
    CategorySubscription,
    Document,
    DocumentEvent,
    DocumentReview,
    DocumentVersion,
    PolicyAcknowledgement,
)
from app.modules.survey.models import (  # noqa: F401
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

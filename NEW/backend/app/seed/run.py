"""Multi-facility corporate seed.

Creates: one 12-facility corporate org (Iowa Healthcare Assoc) with Memphis as the
behind-on-everything outlier, plus 2 independent facilities; staff per facility with
business profiles; an LMS catalog + assignments (varied completion); Document Café
(TCS source library + customer-customized docs with versions); two CEP pathways with
F-tagged nodes; audit templates + runs; and seed findings at Memphis.

Idempotent: skips if orgs already exist.
"""
import asyncio
from datetime import date, datetime, timedelta

from sqlalchemy import func, select

from app.core.db import SessionLocal, create_all
from app.modules.cafe.models import (
    CategorySubscription, Document, DocumentEvent, DocumentReview, DocumentVersion,
    PolicyAcknowledgement,
)
from app.modules.lms.models import Certification, CourseMaterial, LmsProgram, TrainingAssignment, TrainingCourse
from app.modules.lms.router import DEFAULT_PROGRAMS
from app.modules.survey.models import (
    AuditRun,
    AuditTemplate,
    Case,
    CaseFinding,
    Pathway,
    PathwayNode,
)
from app.shared.models import Facility, Notification, Org, User

PROFILES = ["clinical", "dietary", "activities", "housekeeping", "admin"]

FACILITIES = [
    ("Cedar Ridge Care Center", "Des Moines", "IA", 92),
    ("Lakeside SNF", "Cedar Rapids", "IA", 110),
    ("Memphis Care Center", "Memphis", "TN", 130),  # the outlier
]
INDEPENDENT = [
    ("Bayview Nursing & Rehab", "Tampa", "FL", 95),
    ("Sierra Vista Care", "Reno", "NV", 60),
]

# Customer-authored course templates copied into each facility (tenant) at seed.
# (title, training_type, target_profile, hours, program-bucket)
COURSE_TEMPLATES = [
    ("Policy Acknowledgement", "mandatory_annual", None, 0.5, "onboarding"),
    ("HIPAA & Privacy", "mandatory_annual", "all", 0.75, "onboarding"),
    ("Hand Hygiene & PPE", "mandatory_annual", "clinical", 0.5, "infection"),
    ("Infection Control Annual", "mandatory_annual", "clinical", 1.0, "infection"),
    ("Skin & Wound Competency", "competency", "clinical", 1.5, "clinical"),
    ("Fall Prevention", "competency", "clinical", 1.0, "clinical"),
    ("Medication Administration", "competency", "clinical", 1.5, "clinical"),
    ("Resident Rights & Dignity", "mandatory_annual", "all", 1.0, "rights"),
    ("Abuse Prevention & Reporting", "mandatory_annual", "all", 1.0, "rights"),
    ("Emergency Preparedness", "mandatory_annual", "all", 1.0, "emergency"),
    ("Dietary Sanitation", "competency", "dietary", 1.0, "emergency"),
]

# Single-source rule: these LMS courses draw their training material directly from a
# published Document Café policy (no separately-uploaded file). Maps course title -> Café doc title.
CAFE_COURSE_LINKS = {
    "Resident Rights & Dignity": "Resident Rights & Dignity",
    "Emergency Preparedness": "Emergency Preparedness Plan",
    "Skin & Wound Competency": "Skin & Wound Management Policy (Facility version)",
    "Infection Control Annual": "Infection Prevention & Control Program (Facility version)",
}

FIRST = ["Mary", "James", "Linda", "Robert", "Patricia", "John", "Jennifer", "David",
         "Susan", "Michael", "Karen", "Daniel", "Nancy", "Paul", "Lisa", "Mark"]
LAST = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
        "Rodriguez", "Martinez", "Wilson", "Anderson", "Taylor", "Thomas", "Moore"]


def staff_for(fac_idx: int, facility_id: int, count: int) -> list[User]:
    users = []
    for i in range(count):
        fn = FIRST[(fac_idx + i) % len(FIRST)]
        ln = LAST[(fac_idx * 3 + i) % len(LAST)]
        profile = PROFILES[i % len(PROFILES)]
        role = "don" if i == 0 else ("administrator" if i == 1 else "end_user")
        title = {"clinical": "RN", "dietary": "Dietary Aide", "activities": "Activities Lead",
                 "housekeeping": "Housekeeping", "admin": "Office Mgr"}[profile]
        users.append(
            User(
                facility_id=facility_id,
                name=f"{fn} {ln}",
                email=f"{fn.lower()}.{ln.lower()}{i}@example.com",
                role=role,
                profile=profile,
                job_title=("DON" if i == 0 else ("Administrator" if i == 1 else title)),
                hire_date=date(2022, 1, 1) + timedelta(days=i * 37),
            )
        )
    return users


async def seed() -> None:
    await create_all()
    async with SessionLocal() as db:
        existing = (await db.execute(select(Org))).scalars().first()
        if existing:
            print("Seed skipped: data already present.")
            return

        # ----- Orgs + facilities + users -----
        corp = Org(name="Iowa Healthcare Assoc", is_corporate=True, tier="enterprise")
        db.add(corp)
        await db.flush()

        all_facilities: list[Facility] = []
        all_orgs: list[Org] = [corp]
        for name, city, st, beds in FACILITIES:
            f = Facility(org_id=corp.id, name=name, city=city, state=st, beds=beds)
            db.add(f)
            all_facilities.append(f)
        for name, city, st, beds in INDEPENDENT:
            org = Org(name=name, is_corporate=False, tier="essentials")
            db.add(org)
            await db.flush()
            all_orgs.append(org)
            f = Facility(org_id=org.id, name=name, city=city, state=st, beds=beds)
            db.add(f)
            all_facilities.append(f)
        await db.flush()

        # ----- Configurable course buckets (programs), seeded per org from defaults -----
        for org in all_orgs:
            for i, p in enumerate(DEFAULT_PROGRAMS):
                db.add(LmsProgram(org_id=org.id, key=p["key"], name=p["name"],
                                  icon=p["icon"], color=p["color"], sort_order=i, is_active=True))
        await db.flush()

        users_by_fac: dict[int, list[User]] = {}
        for idx, f in enumerate(all_facilities):
            us = staff_for(idx, f.id, 10)
            for u in us:
                db.add(u)
            users_by_fac[f.id] = us
        await db.flush()

        # ----- LMS course library (per-facility tenant; all customer-authored) -----
        memphis = next(f for f in all_facilities if f.name.startswith("Memphis"))
        courses_by_fac: dict[int, list[TrainingCourse]] = {}
        for f in all_facilities:
            cs = []
            for title, ttype, profile, hours, program in COURSE_TEMPLATES:
                c = TrainingCourse(
                    title=title, training_type=ttype, target_profile=profile,
                    duration_hours=hours, program=program,
                    owner_type="customer", owner_facility_id=f.id, version=1, is_active=True,
                )
                db.add(c)
                cs.append(c)
            courses_by_fac[f.id] = cs
        await db.flush()

        # v1 training material per course — a document, EXCEPT Hand Hygiene & PPE which
        # ships as a YouTube training video (demonstrates the video format end-to-end).
        VIDEO_URL = "https://www.youtube.com/watch?v=LZapz2L6J1Q"  # training video
        for f in all_facilities:
            for c in courses_by_fac[f.id]:
                if c.title == "Hand Hygiene & PPE":
                    db.add(CourseMaterial(
                        course_id=c.id, facility_id=f.id, kind="video",
                        file_name="Hand Hygiene & PPE — training video", file_format="youtube",
                        url=VIDEO_URL, size_kb=0, version=1, is_active=True, uploaded_by="Staff Educator",
                    ))
                elif c.title in CAFE_COURSE_LINKS:
                    # sourced from a Document Café policy — linked later, once Café docs exist
                    pass
                else:
                    db.add(CourseMaterial(
                        course_id=c.id, facility_id=f.id, kind="document", file_name=f"{c.title}.pdf",
                        file_format="pdf", size_kb=420, version=1, is_active=True, uploaded_by="Staff Educator",
                    ))
        await db.flush()

        # Assignments spread across all 5 programs. Most facilities ~85% complete; Memphis ~40%.
        spread = [0, 2, 3, 4, 7, 9]  # incl. the Café-linked courses (Infection Control, Skin & Wound, Resident Rights, Emergency)
        for f in all_facilities:
            is_outlier = f.id == memphis.id
            cs = courses_by_fac[f.id]
            us = users_by_fac[f.id]
            for j, u in enumerate(us):
                for ci in spread:
                    c = cs[ci]
                    completed = (j % 10 < (4 if is_outlier else 9))
                    overdue = is_outlier and not completed and (j % 3 == 0)
                    status = "completed" if completed else ("overdue" if overdue else "assigned")
                    db.add(
                        TrainingAssignment(
                            course_id=c.id, user_id=u.id, facility_id=f.id,
                            assigned_by="Seed", source="manual",
                            status=status,
                            due_date=date.today() + timedelta(days=14),
                            completed_date=date.today() - timedelta(days=3) if completed else None,
                            score=92 if completed else None,
                        )
                    )
            # A couple of POC-recommended trainings (remediation from a survey citation).
            # Showcases the Source column differentiating user-assigned vs POC-recommended.
            for k, ci in enumerate([3, 4]):  # Infection Control Annual, Skin & Wound Competency
                u = us[k]
                db.add(TrainingAssignment(
                    course_id=cs[ci].id, user_id=u.id, facility_id=f.id,
                    assigned_by="POC: F880 remediation plan", source="poc", status="assigned",
                    due_date=date.today() + timedelta(days=21),
                ))

        # A few certifications.
        for f in all_facilities[:4]:
            for u in users_by_fac[f.id][:2]:
                db.add(
                    Certification(
                        user_id=u.id, name="CPR / BLS", status="confirmed",
                        confirmed_date=date.today() - timedelta(days=120),
                        expiration_date=date.today() + timedelta(days=245),
                        certificate_number=f"BLS-{u.id:05d}",
                    )
                )

        # ----- Document Café: TCS source library + customer copies -----
        # Taxonomy mirrors The Compliance Store's real library: the two top-level
        # branches the customer actually browses — Policies & Procedures and
        # Tools & Templates — with their real sub-categories.
        TCS_TAXONOMY = {
            "Policies & Procedures": {
                "Activities": ["Activities Program Policy", "Activity Assessment Procedure"],
                "Administration": ["Administration Policy", "Governing Body Procedure"],
                "Business Office": ["Business Office Policy", "Billing & Collections Procedure"],
                "Compliance and Ethics": ["Code of Conduct Policy", "Compliance Program Procedure"],
                "Emergency Preparedness": ["Emergency Preparedness Plan", "Evacuation Procedure"],
                "Environmental Services": ["Environmental Services Policy", "Housekeeping Procedure"],
                "Food and Nutrition": ["Food & Nutrition Policy", "Therapeutic Diet Procedure"],
                "HIPAA": ["HIPAA Privacy Policy", "Breach Notification Procedure"],
                "Human Resources": ["Human Resources Policy", "Progressive Discipline Procedure"],
                "Infection Control": ["Infection Prevention & Control Program", "Hand Hygiene Procedure", "Isolation Precautions Procedure"],
                "Information Technology": ["Information Technology Policy", "Acceptable Use Procedure"],
                "Life Safety Code": ["Life Safety Code Policy", "Fire Drill Procedure"],
                "Maintenance": ["Maintenance Policy", "Preventive Maintenance Procedure"],
                "Minimum Data Set (MDS)": ["MDS Policy", "Assessment Scheduling Procedure"],
                "Nursing": ["Skin & Wound Management Policy", "Medication Administration Procedure", "Fall Prevention Procedure", "Clinical Documentation Policy"],
                "Social Services": ["Social Services Policy", "Discharge Planning Procedure"],
                "Therapy": ["Therapy Services Policy", "Restorative Program Procedure"],
            },
            "Tools & Templates": {
                "Activities": ["Activity Calendar Template", "Activity Assessment Form", "Volunteer Program Toolkit"],
                "Administrative": ["Admission Checklist", "Facility Assessment Template", "QAPI Toolkit"],
                "Environmental Services": ["EVS Competency Checklist", "Cleaning Schedule Template"],
                "Food and Nutrition Service": ["Meal Service Audit Form", "Diet Card Template"],
                "Human Resources": ["New Hire Checklist", "Job Description Template"],
                "Maintenance": ["Life Safety Inspection Log", "Preventive Maintenance Log"],
                "MDS": ["Care Plan Template", "MDS Supplemental Tool"],
                "Nursing": ["Falls Risk Assessment Form", "Pressure Injury Assessment Tool", "Antibiotic Stewardship Toolkit"],
                "Social Services": ["Care Plan Template", "Grievance Log Template"],
                "Staff Development": ["Inservice Sign-In Sheet", "Competency Skills Checklist", "Annual Education Plan"],
                "Survey Management": ["Plan of Correction Packet", "Immediate Jeopardy Removal Plan", "Survey Binder Checklist"],
            },
        }
        def _policy_html(title: str, cat: str) -> str:
            return (
                f"<h1>{title}</h1>"
                f"<p><strong>Purpose.</strong> This policy establishes the {cat.lower()} standards and "
                f"procedures that all staff must follow to ensure resident safety and regulatory compliance.</p>"
                "<h2>Scope</h2><p>Applies to all clinical and support staff at the facility.</p>"
                "<h2>Procedure</h2><ol>"
                "<li>Staff review this policy during orientation and at each annual update.</li>"
                "<li>Department leads verify adherence during routine rounds.</li>"
                "<li>Deviations are reported to the DON and documented in the QAPI log.</li>"
                "</ol>"
                "<h2>Responsibilities</h2><table><thead><tr><th>Role</th><th>Responsibility</th></tr></thead>"
                "<tbody><tr><td>DON</td><td>Owns the policy and approves revisions.</td></tr>"
                "<tr><td>Staff Educator</td><td>Trains staff and tracks acknowledgements.</td></tr>"
                "<tr><td>All staff</td><td>Follow the procedure and report concerns.</td></tr></tbody></table>"
                "<blockquote>Reviewed against current CMS guidance and state overlay requirements.</blockquote>"
            )

        tcs_by_title: dict[str, Document] = {}
        days = 0
        for grp, cats in TCS_TAXONOMY.items():
            for cat, titles in cats.items():
                for title in titles:
                    days = (days + 17) % 900
                    d = Document(title=title, group=grp, category=cat, owner_type="tcs", current_version=1,
                                 status="published", author="TCS R&D", tags=["TCS source", cat])
                    db.add(d)
                    await db.flush()
                    db.add(DocumentVersion(document_id=d.id, version=1, content_html=_policy_html(title, cat),
                                           content=f"TCS source policy: {title}", note="TCS source release",
                                           created_by="TCS R&D", file_format="html",
                                           created_at=datetime.utcnow() - timedelta(days=days)))
                    tcs_by_title[title] = d

        # Every facility gets a working Café out of the box: customized TCS copies (published,
        # with history) + a couple of locally-authored published policies + a draft + an
        # in-review item. This way the demo never lands on an empty facility.
        seed_copies = ["Skin & Wound Management Policy", "Infection Prevention & Control Program"]
        local_pubs = [("Resident Rights & Dignity", "Resident Rights"), ("Emergency Preparedness Plan", "Safety")]
        now = datetime.utcnow()
        for fidx, f in enumerate(all_facilities):
            fac_staff = users_by_fac.get(f.id, [])
            pub_docs: list[Document] = []  # published docs → seed usage + acknowledgements
            cafe_by_title: dict[str, Document] = {}  # for LMS single-source linking
            for ci, src_title in enumerate(seed_copies):
                src = tcs_by_title[src_title]
                title = f"{src.title} (Facility version)"
                d = Document(title=title, group=src.group, category=src.category, owner_type="customer",
                             facility_id=f.id, org_id=f.org_id, source_document_id=src.id,
                             source_version=1,  # customized from TCS v1
                             current_version=2, status="published", author="Staff Educator",
                             tags=[src.category, "facility policy"],
                             draft_html=_policy_html(title, src.category), draft_format="html")
                db.add(d)
                await db.flush()
                db.add(DocumentVersion(document_id=d.id, version=1, content_html=_policy_html(src.title, src.category),
                                       content="Initial customization", note="Initial customization",
                                       created_by="Staff Educator", file_format="html",
                                       created_at=now - timedelta(days=400)))
                # spread v2 publish dates across the trailing months so the trend reads smoothly
                db.add(DocumentVersion(document_id=d.id, version=2, content_html=_policy_html(title, src.category),
                                       content="Updated for state overlay", note="v2 - state overlay",
                                       created_by="Staff Educator", file_format="html",
                                       created_at=now - timedelta(days=30 * ((fidx + ci * 2) % 7) + 8)))
                pub_docs.append(d)
                cafe_by_title[title] = d
            # locally-authored published policies (no TCS source)
            for li, (lt, lc) in enumerate(local_pubs):
                d = Document(title=lt, group="Policies & Procedures", category=lc, owner_type="customer",
                             facility_id=f.id, org_id=f.org_id, current_version=1, status="published",
                             author="DON", tags=[lc, "facility policy"],
                             draft_html=_policy_html(lt, lc), draft_format="html")
                db.add(d)
                await db.flush()
                db.add(DocumentVersion(document_id=d.id, version=1, content_html=_policy_html(lt, lc),
                                       content="Initial release", note="Initial release",
                                       created_by="DON", file_format="html",
                                       created_at=now - timedelta(days=30 * ((fidx + 3 + li * 2) % 7) + 15)))
                pub_docs.append(d)
                cafe_by_title[lt] = d

            # ----- usage events + acknowledgements (powers the Analytics tab) -----
            for di, d in enumerate(pub_docs):
                n_views = 14 + ((fidx * 7 + di * 11) % 30)       # 14..43 views
                n_downloads = 3 + ((fidx * 3 + di * 5) % 9)      # 3..11 downloads
                for vi in range(n_views):
                    u = fac_staff[vi % len(fac_staff)] if fac_staff else None
                    db.add(DocumentEvent(document_id=d.id, version=d.current_version, kind="view",
                                         actor=(u.name if u else "Staff"),
                                         user_id=(u.id if u else None),
                                         created_at=now - timedelta(days=(vi * 2) % 110, hours=vi % 24)))
                for wi in range(n_downloads):
                    u = fac_staff[wi % len(fac_staff)] if fac_staff else None
                    db.add(DocumentEvent(document_id=d.id, version=d.current_version, kind="download",
                                         actor=(u.name if u else "Staff"),
                                         user_id=(u.id if u else None),
                                         created_at=now - timedelta(days=(wi * 5) % 100)))
                # acknowledgements: assign to all staff, ~78% signed off
                for ui, u in enumerate(fac_staff):
                    signed = ((fidx + di + ui) % 9) >= 2  # ~78%
                    db.add(PolicyAcknowledgement(
                        document_id=d.id, document_version=d.current_version, user_id=u.id,
                        facility_id=f.id, acknowledged=signed,
                        acknowledged_at=(now - timedelta(days=(ui * 3) % 40)) if signed else None,
                    ))

            # one draft + one in-review at every facility to drive the approval workflow
            f_draft = Document(title="Wandering & Elopement Response (Draft)", category="Safety",
                               group="Policies & Procedures", owner_type="customer",
                               facility_id=f.id, org_id=f.org_id, current_version=0, status="draft",
                               author="Staff Educator", tags=["Safety", "resident rights"],
                               draft_html=_policy_html("Wandering & Elopement Response", "Safety"),
                               draft_format="html")
            f_review = Document(title="Medication Error Reporting (Pending Approval)", category="Clinical",
                                group="Policies & Procedures", owner_type="customer",
                                facility_id=f.id, org_id=f.org_id, current_version=0, status="in_review",
                                author="Staff Educator", tags=["Clinical", "QAPI"],
                                draft_html=_policy_html("Medication Error Reporting", "Clinical"),
                                draft_format="html")
            db.add_all([f_draft, f_review])
            await db.flush()
            db.add(DocumentReview(document_id=f_review.id, version=1, status="pending",
                                  submitted_by="Staff Educator"))

            # additional published policies (fuller Policies library)
            extra_pubs = [
                ("Fire Safety & Evacuation Plan", "Safety", "Policies & Procedures"),
                ("HIPAA Privacy Practices", "HIPAA", "Policies & Procedures"),
                ("Pressure Injury Prevention", "Nursing", "Policies & Procedures"),
                ("Medication Storage & Security", "Clinical", "Policies & Procedures"),
                ("Grievance & Complaint Procedure", "Resident Rights", "Policies & Procedures"),
            ]
            for ei, (et, ec, eg) in enumerate(extra_pubs):
                d = Document(title=et, group=eg, category=ec, owner_type="customer",
                             facility_id=f.id, org_id=f.org_id, current_version=1, status="published",
                             author="DON", tags=[ec, "facility policy"],
                             draft_html=_policy_html(et, ec), draft_format="html")
                db.add(d)
                await db.flush()
                db.add(DocumentVersion(document_id=d.id, version=1, content_html=_policy_html(et, ec),
                                       content="Initial release", note="Initial release", created_by="DON",
                                       file_format="html", created_at=now - timedelta(days=20 * ((fidx + ei) % 7) + 9)))

            # additional in-review submissions (fuller Approvals queue, varied submitters)
            extra_reviews = [
                ("Hand Hygiene Compliance Audit", "Infection Control", "DON"),
                ("Visitor & Vendor Access Control", "Safety", "Compliance Officer"),
                ("Antibiotic Stewardship Protocol", "Clinical", "Staff Educator"),
            ]
            for et, ec, by in extra_reviews:
                d = Document(title=f"{et} (Pending Approval)", category=ec, group="Policies & Procedures",
                             owner_type="customer", facility_id=f.id, org_id=f.org_id,
                             current_version=0, status="in_review", author=by, tags=[ec],
                             draft_html=_policy_html(et, ec), draft_format="html")
                db.add(d)
                await db.flush()
                db.add(DocumentReview(document_id=d.id, version=1, status="pending", submitted_by=by))

            # each facility subscribes to a few TCS alert categories
            db.add_all([
                CategorySubscription(facility_id=f.id, category="Infection Control"),
                CategorySubscription(facility_id=f.id, category="Nursing"),
                CategorySubscription(facility_id=f.id, category="HIPAA"),
            ])
            # TCS / regulatory alerts (the kind managed via TCS Library subscriptions)
            db.add_all([
                Notification(facility_id=f.id, kind="regulatory",
                             title="New TCS guidance: Infection Prevention & Control Program",
                             body="TCS published an updated source under “Infection Control”. Review and customize it for your facility.",
                             created_at=now - timedelta(days=2)),
                Notification(facility_id=f.id, kind="policy_update",
                             title="Update available: Infection Prevention & Control Program (Facility version)",
                             body="A newer TCS source version is available. Reconcile to fold the changes into your facility version.",
                             created_at=now - timedelta(days=2, hours=3)),
                Notification(facility_id=f.id, kind="regulatory",
                             title="CMS reminder: annual policy review window open",
                             body="Facilities should re-attest infection-control and resident-rights policies this quarter.",
                             created_at=now - timedelta(days=6)),
            ])

            # ----- Single-source link: LMS courses sourced from Café policies -----
            for course in courses_by_fac[f.id]:
                cafe_title = CAFE_COURSE_LINKS.get(course.title)
                if not cafe_title:
                    continue
                cdoc = cafe_by_title.get(cafe_title)
                if not cdoc:
                    continue
                db.add(CourseMaterial(
                    course_id=course.id, facility_id=f.id, kind="document",
                    file_name=cdoc.title, file_format="html", size_kb=0, version=1, is_active=True,
                    uploaded_by="Staff Educator",
                    cafe_document_id=cdoc.id, cafe_version=cdoc.current_version,
                ))

        # TCS releases a NEW version of one source policy → facility copies (source_version=1)
        # become stale and surface "Update available" / the AI reconcile flow out of the box.
        upstream = tcs_by_title["Infection Prevention & Control Program"]
        v2_html = (
            _policy_html(upstream.title, upstream.category)
            + "<h2>Respiratory Pathogen Surveillance (2026 CMS update)</h2>"
              "<p>Facilities must screen for respiratory pathogens on admission and during outbreaks, "
              "log results in the surveillance line list, and report clusters to public health within 24 hours.</p>"
            + "<h2>Antibiotic Stewardship Review</h2>"
              "<p>The IP and medical director review antibiotic starts weekly and document indication, "
              "dose, duration, and a planned stop date for every order.</p>"
        )
        upstream.current_version = 2
        db.add(DocumentVersion(document_id=upstream.id, version=2, content_html=v2_html,
                               content=f"TCS source policy: {upstream.title} (v2)",
                               note="2026 CMS update — surveillance + stewardship",
                               created_by="TCS R&D", file_format="html"))

        # ----- CEP pathways -----
        skin = Pathway(code="CMS-20068", slug="skin-wound",
                       title="Skin Care & Wound Care",
                       description="Critical Element Pathway for pressure injury / wound care.")
        infx = Pathway(code="CMS-20054", slug="infection-control",
                       title="Infection Prevention & Control",
                       description="Critical Element Pathway for infection prevention.")
        db.add_all([skin, infx])
        await db.flush()

        skin_nodes = [
            ("sw_obs_1", "Observations", "Is the resident's wound care provided per the care plan?", "F686", "Treatment/Svcs to Prevent/Heal Pressure Ulcers", "actual"),
            ("sw_obs_2", "Observations", "Are pressure-relieving devices in use as ordered?", "F686", "Treatment/Svcs to Prevent/Heal Pressure Ulcers", "potential"),
            ("sw_int_1", "Interviews", "Does staff describe correct repositioning schedule?", None, None, "potential"),
            ("sw_rec_1", "Record Review", "Are weekly skin assessments documented?", "F842", "Resident Records - Identifiable Information", "potential"),
            ("sw_dec_1", "Decisions", "Was the facility's response to the wound adequate and timely?", "F686", "Treatment/Svcs to Prevent/Heal Pressure Ulcers", "actual"),
        ]
        infx_nodes = [
            ("inf_obs_1", "Observations", "Is hand hygiene performed per protocol?", "F880", "Infection Prevention & Control", "actual"),
            ("inf_obs_2", "Observations", "Is PPE used appropriately?", "F880", "Infection Prevention & Control", "potential"),
            ("inf_rec_1", "Record Review", "Is the infection surveillance log current?", "F880", "Infection Prevention & Control", "potential"),
            ("inf_dec_1", "Decisions", "Was the IPC program followed for this resident?", "F880", "Infection Prevention & Control", "actual"),
        ]
        for order, (code, section, prompt, ftag, fttl, sev) in enumerate(skin_nodes):
            db.add(PathwayNode(pathway_id=skin.id, code=code, section=section, prompt=prompt,
                               display_order=order, ftag=ftag, ftag_title=fttl, default_severity=sev))
        for order, (code, section, prompt, ftag, fttl, sev) in enumerate(infx_nodes):
            db.add(PathwayNode(pathway_id=infx.id, code=code, section=section, prompt=prompt,
                               display_order=order, ftag=ftag, ftag_title=fttl, default_severity=sev))

        # ----- Audit Toolkit -----
        templates = [
            AuditTemplate(name="Monthly Skin & Wound Audit", cadence="monthly", owner_type="tcs"),
            AuditTemplate(name="Weekly Infection Control Round", cadence="weekly", owner_type="tcs"),
            AuditTemplate(name="Dietary Sanitation Check", cadence="weekly", owner_type="customer"),
        ]
        db.add_all(templates)
        await db.flush()
        for f in all_facilities[:6]:
            db.add(AuditRun(template_id=templates[0].id, facility_id=f.id,
                            passed=(f.id != memphis.id),
                            finding_summary=("3 residents missing weekly skin check"
                                             if f.id == memphis.id else "No deficiencies")))

        # ----- Memphis seed findings (make it the outlier on the dashboard) -----
        m_case = Case(facility_id=memphis.id, pathway_id=skin.id,
                      title="Mock Survey — Skin & Wound", resident_sample="5 residents",
                      surveyor="Seed Surveyor", status="completed",
                      completed_at=datetime.utcnow() - timedelta(days=5))
        db.add(m_case)
        await db.flush()
        db.add_all([
            CaseFinding(case_id=m_case.id, facility_id=memphis.id, ftag="F686",
                        ftag_title="Treatment/Svcs to Prevent/Heal Pressure Ulcers",
                        severity="actual", summary="Wound care not provided per care plan for 2 residents."),
            CaseFinding(case_id=m_case.id, facility_id=memphis.id, ftag="F842",
                        ftag_title="Resident Records - Identifiable Information",
                        severity="potential", summary="Weekly skin assessments not consistently documented."),
        ])

        db.add(Notification(facility_id=memphis.id, title="Survey readiness alert",
                            body="Memphis Care Center is trending below portfolio average.",
                            kind="regulatory"))

        await db.commit()
        print(f"Seed complete: 1 corporate org ({len(FACILITIES)} facilities) + "
              f"{len(INDEPENDENT)} independent, {len(all_facilities)} facilities total.")


# Extra frontline learners for Auth0 passwordless demo (idempotent).
AUTH0_LEARNERS = [
  {
    "name": "Utsav Patel",
    "email": "utsavpatel8696@gmail.com",
    "facility_name": "Cedar Ridge Care Center",
    "profile": "activities",
    "job_title": "Activities Lead",
  },
]


async def ensure_auth0_learners() -> None:
    """Ensure Auth0 OTP demo learners exist even when main seed was skipped."""
    from datetime import date

    async with SessionLocal() as db:
        for spec in AUTH0_LEARNERS:
            email = spec["email"].strip().lower()
            exists = (
                await db.execute(select(User).where(func.lower(User.email) == email))
            ).scalars().first()
            if exists:
                continue
            fac = (
                await db.execute(select(Facility).where(Facility.name == spec["facility_name"]))
            ).scalars().first()
            if not fac:
                print(f"ensure_auth0_learners: facility not found: {spec['facility_name']}")
                continue
            db.add(
                User(
                    org_id=fac.org_id,
                    facility_id=fac.id,
                    name=spec["name"],
                    email=email,
                    role="end_user",
                    profile=spec["profile"],
                    job_title=spec["job_title"],
                    hire_date=date(2023, 6, 1),
                    is_active=True,
                )
            )
        await db.commit()


if __name__ == "__main__":
    asyncio.run(seed())

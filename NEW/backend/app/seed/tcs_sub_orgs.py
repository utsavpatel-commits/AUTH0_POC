"""Demo sub-organizations under corporate parents (idempotent)."""
from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.shared.models import Org

SUB_ORGS = [
    {
        "parent_name": "Iowa Healthcare Assoc",
        "children": [
            ("Cedar Ridge Care Center", "essentials"),
            ("Lakeside SNF", "professional"),
            ("Memphis Care Center", "essentials"),
        ],
    },
]


async def ensure_demo_sub_orgs() -> None:
    async with SessionLocal() as db:
        for spec in SUB_ORGS:
            parent = (
                await db.execute(select(Org).where(Org.name == spec["parent_name"], Org.parent_org_id.is_(None)))
            ).scalars().first()
            if not parent:
                continue
            for child_name, tier in spec["children"]:
                exists = (
                    await db.execute(
                        select(Org).where(Org.parent_org_id == parent.id, func.lower(Org.name) == child_name.lower())
                    )
                ).scalars().first()
                if exists:
                    continue
                db.add(Org(name=child_name, parent_org_id=parent.id, tier=tier, is_corporate=False))
        await db.commit()

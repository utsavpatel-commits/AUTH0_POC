from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.shared.models import TcsStaff

TCS_STAFF_SEED = [
    {"email": "utsav.patel@ignitedata.ai", "name": "Utsav Patel", "role": "tcs_admin"},
]


async def ensure_tcs_staff() -> None:
    async with SessionLocal() as db:
        for spec in TCS_STAFF_SEED:
            email = spec["email"].strip().lower()
            if (await db.execute(select(TcsStaff).where(func.lower(TcsStaff.email) == email))).scalars().first():
                continue
            db.add(TcsStaff(email=email, name=spec["name"], role=spec["role"], is_active=True))
        await db.commit()

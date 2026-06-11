"""Persona resolution for the demo.

The frontend sends an `X-Role` header (and optional `X-Facility-Id` / `X-Org-Id`)
chosen via the in-app persona switcher. There is no real auth in this prototype;
these headers drive the data scope and dashboard lens.
"""
from dataclasses import dataclass

from fastapi import Header

# Customer-side subscriber personas + TCS-internal personas.
CUSTOMER_ROLES = {
    "customer_admin",
    "administrator",
    "don",
    "staff_educator",
    "corporate_leader",
    "end_user",
    "partner",
}
TCS_ROLES = {"tcs_admin", "tcs_sales_cs", "tcs_rd"}
ALL_ROLES = CUSTOMER_ROLES | TCS_ROLES


@dataclass
class Persona:
    role: str
    facility_id: int | None
    org_id: int | None

    @property
    def is_tcs(self) -> bool:
        return self.role in TCS_ROLES

    @property
    def is_corporate(self) -> bool:
        return self.role in {"corporate_leader", "customer_admin"} or self.is_tcs


def get_persona(
    x_role: str = Header(default="administrator"),
    x_facility_id: int | None = Header(default=None),
    x_org_id: int | None = Header(default=None),
) -> Persona:
    role = (x_role or "administrator").lower()
    if role not in ALL_ROLES:
        role = "administrator"
    return Persona(role=role, facility_id=x_facility_id, org_id=x_org_id)

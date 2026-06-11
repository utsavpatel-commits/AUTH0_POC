from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.shared.models import Facility, Org, User

router = APIRouter(prefix="/api/command-center", tags=["command_center"])


@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db)):
    """Executive Command Center — top numbers leadership sees at sign-in.
    Customer/facility/user counts are real (from seed); financials are demo figures."""
    orgs = (await db.execute(select(func.count()).select_from(Org))).scalar() or 0
    facilities = (await db.execute(select(func.count()).select_from(Facility))).scalar() or 0
    users = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    return {
        "arr": 5_750_000,
        "customers": orgs,
        "facilities": facilities,
        "subscribers": users,
        "net_retention": 95,
        "ai_cost_mtd": 18_400,
        "ai_revenue_mtd": 61_200,
        "margin_pct": round(100 * (61_200 - 18_400) / 61_200),
    }


@router.get("/ai-economics")
async def ai_economics():
    """Daily AI spend vs AI revenue with margin trend (demo series)."""
    base_cost = 520
    base_rev = 1850
    series = []
    for i in range(14):
        cost = base_cost + (i * 9) + (40 if i % 5 == 0 else 0)
        rev = base_rev + (i * 38)
        series.append(
            {
                "day": f"D-{14 - i}",
                "ai_cost": cost,
                "ai_revenue": rev,
                "margin": rev - cost,
            }
        )
    return {"series": series}


@router.get("/sales-cs")
async def sales_cs():
    """Sales/CS morning view — at-risk, upsell, renewals (demo signals)."""
    return {
        "at_risk": [
            {"account": "Memphis Care Center", "signal": "Usage declining + 4 open POCs", "owner": "Mary Smith"},
            {"account": "Lakeside SNF", "signal": "Support tickets spiking", "owner": "J. Patel"},
            {"account": "Cedar Ridge", "signal": "Champion left (admin change)", "owner": "Mary Smith"},
        ],
        "upsell": [
            {"account": "Capitol Hill Health", "signal": "Hitting AI cap consistently", "play": "AI Assistant upgrade"},
            {"account": "Iowa Healthcare Assoc", "signal": "Adding 6 facilities", "play": "Enterprise expansion"},
        ],
        "renewals": [
            {"account": "Riverside Living", "date": "in 6 days", "arr": 84_000},
            {"account": "Summit Care Group", "date": "in 12 days", "arr": 210_000},
        ],
    }


@router.get("/search-analytics")
async def search_analytics():
    """AI Search/Chat usage analytics (demo data, mirrors tcs-command-center)."""
    return {
        "kpis": {
            "total_searches": 48230,
            "success_rate": 91,
            "zero_result_rate": 6,
            "avg_relevance": 4.4,
        },
        "trend": [
            {"week": f"W{i+1}", "searches": 9000 + i * 850, "chats": 2100 + i * 240}
            for i in range(8)
        ],
        "top_queries": [
            {"query": "skin and wound policy", "count": 1820, "trend": "up"},
            {"query": "infection control 2026 update", "count": 1410, "trend": "up"},
            {"query": "F686 pressure injury", "count": 980, "trend": "flat"},
            {"query": "abuse reporting timeline", "count": 760, "trend": "up"},
            {"query": "medication administration", "count": 640, "trend": "down"},
        ],
        "content_gaps": [
            {"query": "ALF state overlay templates", "demand": "high", "action": "Author new content"},
            {"query": "hospice CoP crosswalk", "demand": "medium", "action": "Expand library"},
        ],
    }

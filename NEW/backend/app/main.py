from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.core.config import settings
from app.core.db import create_all
from app.core.ensure_org_schema import ensure_org_parent_column
from app.core.ensure_user_schema import ensure_user_permission_columns
from app.llm import is_live
from app.seed.run import ensure_auth0_learners
from app.seed.tcs_staff import ensure_tcs_staff
from app.seed.tcs_platform_roles import ensure_platform_roles
from app.seed.tcs_settings import ensure_tcs_platform_bootstrap
from app.seed.tcs_sub_orgs import ensure_demo_sub_orgs


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_all()
    await ensure_org_parent_column()
    await ensure_user_permission_columns()
    await ensure_auth0_learners()
    await ensure_tcs_staff()
    await ensure_demo_sub_orgs()
    await ensure_platform_roles()
    await ensure_tcs_platform_bootstrap()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=settings.secret_key, same_site="lax")

_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins if _origins != ["*"] else ["http://localhost:5180", "http://127.0.0.1:5180"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.app_name, "llm_live": is_live()}


# Mount module routers.
from app.shared.router import router as shared_router  # noqa: E402
from app.modules.lms.router import router as lms_router  # noqa: E402
from app.modules.cafe.router import router as cafe_router  # noqa: E402
from app.modules.survey.router import router as survey_router  # noqa: E402
from app.modules.dashboard.router import router as dashboard_router  # noqa: E402
from app.modules.command_center.router import router as cc_router  # noqa: E402
from app.stubs_router import router as stubs_router  # noqa: E402
from app.routers.passwordless_auth import router as passwordless_router  # noqa: E402
from app.modules.tcs_admin.router import router as tcs_admin_router  # noqa: E402
from app.routers.auth_redirect import router as auth_redirect_router  # noqa: E402

app.include_router(auth_redirect_router)
app.include_router(passwordless_router)
app.include_router(tcs_admin_router)
app.include_router(shared_router)
app.include_router(lms_router)
app.include_router(cafe_router)
app.include_router(survey_router)
app.include_router(dashboard_router)
app.include_router(cc_router)
app.include_router(stubs_router)

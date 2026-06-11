from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database — async URL for the app, sync URL for Alembic
    database_url: str = (
        "postgresql+asyncpg://tcs:tcs_password@postgres:5432/web3_platform"
    )

    app_name: str = "TCS Web 3.0 Platform"
    cors_origins: str = "*"
    frontend_url: str = Field("http://localhost:5180", validation_alias="FRONTEND_URL")
    backend_public_url: str = Field("http://localhost:8010", validation_alias="BACKEND_PUBLIC_URL")

    post_password_redirect_url: str = Field(
        "http://localhost:5180/invite/complete",
        validation_alias="POST_PASSWORD_REDIRECT_URL",
    )

    @property
    def platform_login_url(self) -> str:
        return f"{self.frontend_url.rstrip('/')}/login"

    # Auth0 passwordless OTP (end-user / frontline learner login)
    auth0_domain: Optional[str] = Field(None, validation_alias="AUTH0_DOMAIN")
    auth0_client_id: Optional[str] = Field(None, validation_alias="AUTH0_CLIENT_ID")
    auth0_client_secret: Optional[str] = Field(None, validation_alias="AUTH0_CLIENT_SECRET")
    auth0_passwordless_client_id: Optional[str] = Field(
        None, validation_alias="AUTH0_PASSWORDLESS_CLIENT_ID"
    )
    auth0_passwordless_client_secret: Optional[str] = Field(
        None, validation_alias="AUTH0_PASSWORDLESS_CLIENT_SECRET"
    )
    auth0_mgmt_client_id: Optional[str] = Field(None, validation_alias="AUTH0_MGMT_CLIENT_ID")
    auth0_mgmt_client_secret: Optional[str] = Field(None, validation_alias="AUTH0_MGMT_CLIENT_SECRET")
    passwordless_mode: str = Field("auth0", validation_alias="PASSWORDLESS_MODE")
    secret_key: str = Field("tcs-web3-demo-secret", validation_alias="SECRET_KEY")
    tcs_session_cookie: str = "tcs_session"
    # Demo fallback when Auth0 Password grant is not enabled on the app
    tcs_demo_password: str = Field("Utsav@123", validation_alias="TCS_DEMO_PASSWORD")

    # LLM — optional. When no key is present the app uses deterministic stubs.
    llm_provider: str = "stub"  # "anthropic" | "openai" | "stub"
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    anthropic_model: str = "claude-opus-4-8"
    openai_model: str = "gpt-4o"

    # Local file storage for uploads (documents, evidence, certificates)
    upload_dir: str = "/app/uploads"

    @property
    def auth0_issuer(self) -> str:
        return f"https://{self.auth0_domain}/"

    @property
    def auth0_token_url(self) -> str:
        return f"https://{self.auth0_domain}/oauth/token"

    @property
    def passwordless_client_id(self) -> str | None:
        return self.auth0_passwordless_client_id or self.auth0_client_id

    @property
    def passwordless_client_secret(self) -> str | None:
        return self.auth0_passwordless_client_secret or self.auth0_client_secret

    @property
    def auth0_mgmt_base(self) -> str:
        return f"https://{self.auth0_domain}/api/v2"

    @property
    def auth0_mgmt_configured(self) -> bool:
        return bool(self.auth0_domain and self.auth0_mgmt_client_id and self.auth0_mgmt_client_secret)

    @property
    def passwordless_enabled(self) -> bool:
        return (
            self.passwordless_mode.lower() == "auth0"
            and bool(self.auth0_domain)
            and bool(self.passwordless_client_id)
            and bool(self.passwordless_client_secret)
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

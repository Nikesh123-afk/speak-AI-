from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    app_origin: str = "http://localhost:5173"
    database_url: str = ""
    session_days: int = Field(30, ge=1, le=90)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    static_dir: str = ""
    gemini_api_key: str = ""
    gemini_model: str = Field("gemini-2.5-flash", pattern=r"^[A-Za-z0-9.-]+$")
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_standard_price_id: str = ""
    stripe_premium_price_id: str = ""

    @field_validator("database_url")
    @classmethod
    def async_driver(cls, value: str) -> str:
        # Hosting providers hand out plain postgres:// URLs; SQLAlchemy needs the async driver named.
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+asyncpg://" + value[len(prefix):]
        return value

    @model_validator(mode="after")
    def check(self) -> "Settings":
        parts = urlsplit(self.app_origin)
        if f"{parts.scheme}://{parts.netloc}" != self.app_origin:
            raise ValueError("APP_ORIGIN must be an origin without a path or trailing slash")
        if self.app_env == "production":
            if not self.database_url.startswith("postgresql+asyncpg://"):
                raise ValueError("Production requires DATABASE_URL for PostgreSQL")
            if parts.scheme != "https":
                raise ValueError("Production requires an HTTPS APP_ORIGIN")
        return self

    @property
    def production(self) -> bool:
        return self.app_env == "production"

    @property
    def billing_available(self) -> bool:
        return all((self.stripe_secret_key, self.stripe_webhook_secret, self.stripe_standard_price_id, self.stripe_premium_price_id))


@lru_cache
def get_settings() -> Settings:
    return Settings()

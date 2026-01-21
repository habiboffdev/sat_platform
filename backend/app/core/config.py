from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_name: str = "SAT Platform API"
    app_version: str = "0.1.0"
    debug: bool = False
    environment: Literal["development", "staging", "production"] = "development"

    # API
    api_v1_prefix: str = "/api/v1"

    # CORS - comma-separated list of origins
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:3000"

    @computed_field
    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    # Database
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"
    postgres_db: str = "sat_platform"

    # Full database URL from environment variable (e.g. Heroku DATABASE_URL)
    database_url_env: str | None = Field(default=None, alias="DATABASE_URL")

    @computed_field
    @property
    def database_url(self) -> str:
        """Asynchronous database URL."""
        if self.database_url_env:
            url = self.database_url_env
            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql+asyncpg://", 1)
            elif url.startswith("postgresql://") and "+asyncpg" not in url:
                url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
            return url

        return str(
            PostgresDsn.build(
                scheme="postgresql+asyncpg",
                username=self.postgres_user,
                password=self.postgres_password,
                host=self.postgres_host,
                port=self.postgres_port,
                path=self.postgres_db,
            )
        )

    @computed_field
    @property
    def database_url_sync(self) -> str:
        """Synchronous database URL."""
        if self.database_url_env:
            url = self.database_url_env
            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql://", 1)
            elif "+asyncpg" in url:
                url = url.replace("+asyncpg", "", 1)
            return url

        return str(
            PostgresDsn.build(
                scheme="postgresql",
                username=self.postgres_user,
                password=self.postgres_password,
                host=self.postgres_host,
                port=self.postgres_port,
                path=self.postgres_db,
            )
        )

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    jwt_secret_key: str = Field(default="change-me-in-production-use-openssl-rand-hex-32")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 43200  # 30 days
    refresh_token_expire_days: int = 60  # 60 days

    # File Storage (S3-compatible)
    s3_endpoint_url: str | None = None
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_bucket_name: str = "sat-platform"
    s3_region: str = "us-east-1"

    # File upload limits
    max_image_size_mb: int = 5
    max_pdf_size_mb: int = 100  # PDFs can be large
    allowed_image_types: str = "image/png,image/jpeg,image/gif,image/webp"

    @computed_field
    @property
    def allowed_image_types_list(self) -> list[str]:
        return [t.strip() for t in self.allowed_image_types.split(",")]

    # ===== OCR Processing Settings =====

    # API Keys
    deepinfra_api_key: str | None = None
    openai_api_key: str | None = None
    replicate_api_key: str | None = None
    openrouter_api_key: str | None = None

    # Default OCR provider (deepinfra, openai, hybrid, replicate, openrouter)
    ocr_default_provider: str = "hybrid"

    # Model configurations
    ocr_vision_model: str = "gpt-4o-mini"  # For OCR extraction
    ocr_structuring_model: str = "deepseek-ai/DeepSeek-V3.1"  # For JSON structuring

    # Parallel processing settings
    # OpenRouter: ~50 concurrent, OpenAI: ~3-5 concurrent, DeepInfra: ~10 concurrent
    ocr_max_concurrent_pages: int = 10  # Max parallel API calls (increase for OpenRouter)
    ocr_batch_size: int = 10  # Pages per batch for checkpointing

    # Timeouts (in seconds)
    ocr_api_timeout: int = 120  # Per-page API timeout
    ocr_structuring_timeout: int = 180  # JSON structuring timeout

    # Retry settings
    ocr_max_retries: int = 3
    ocr_retry_delay: int = 2  # Base delay for exponential backoff

    # Cost tracking (in USD cents per 1000 tokens)
    ocr_cost_per_1k_input: float = 0.015  # gpt-4o-mini input
    ocr_cost_per_1k_output: float = 0.060  # gpt-4o-mini output

    # File storage
    ocr_upload_dir: str = "ocr_uploads"  # S3 prefix for PDF uploads
    ocr_cache_dir: str = ".ocr_cache"  # Local cache for intermediate results


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

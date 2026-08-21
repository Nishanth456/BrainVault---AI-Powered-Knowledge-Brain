from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

# Always resolve .env relative to this file (backend/.env), regardless of cwd
_ENV_FILE = Path(__file__).parent / ".env"


class Settings(BaseSettings):
    DATABASE_URL: str
    DATABASE_URL_SYNC: str = ""
    REDIS_URL: str
    CELERY_BROKER_URL: str = ""
    CELERY_RESULT_BACKEND: str = ""

    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_API_KEY: str = ""
    QDRANT_COLLECTION_NAME: str = "brainvault"

    ENV_MODE: str = "local"
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET_NAME: str = "brainvault-files"
    MINIO_SECURE: bool = False

    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "auto"
    AWS_ENDPOINT_URL_S3: str = ""
    S3_BUCKET_NAME: str = ""

    GROQ_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    OPENROUTER_API_KEYS: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_EMBED_MODEL: str = "nomic-embed-text"
    EMBED_DIMENSION: int = 768

    APP_ENV: str = "development"
    FRONTEND_URL: str = "http://localhost:3000"

    # LinkedIn credentials for authenticated scraping
    LINKEDIN_EMAIL: str = ""
    LINKEDIN_PASSWORD: str = ""

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

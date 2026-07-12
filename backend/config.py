from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

# Always resolve .env relative to this file (backend/.env), regardless of cwd
_ENV_FILE = Path(__file__).parent / ".env"


class Settings(BaseSettings):
    DATABASE_URL: str
    DATABASE_URL_SYNC: str
    REDIS_URL: str
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str

    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_COLLECTION_NAME: str = "brainvault"

    MINIO_ENDPOINT: str
    MINIO_ACCESS_KEY: str
    MINIO_SECRET_KEY: str
    MINIO_BUCKET_NAME: str = "brainvault-files"
    MINIO_SECURE: bool = False

    GROQ_API_KEY: str
    GEMINI_API_KEY: str = ""
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

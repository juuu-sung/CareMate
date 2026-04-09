from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "CareMate API"
    APP_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api/v1"

    DATABASE_URL: str

    OPENAI_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None
    STT_API_KEY: str | None = None
    TTS_API_KEY: str | None = None
    MAP_API_KEY: str | None = None
    LOCATION_RETENTION_DAYS: int = 30

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
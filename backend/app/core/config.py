from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CareMate"
    api_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://caremate:caremate@localhost:5432/caremate"
    openai_api_key: str = ""
    gemini_api_key: str = ""
    stt_api_key: str = ""
    tts_api_key: str = ""
    map_api_key: str = ""
    location_retention_days: int = 30

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

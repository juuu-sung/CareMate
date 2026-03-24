from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Donghang AI"
    api_prefix: str = "/api/v1"
    database_url: str = "postgresql://USER:PASSWORD@HOST:5432/DB_NAME"
    openai_api_key: str = ""
    gemini_api_key: str = ""
    stt_api_key: str = ""
    tts_api_key: str = ""
    map_api_key: str = ""
    location_retention_days: int = 30

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "CareMate API"
    APP_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api/v1"

    DATABASE_URL: str = "postgresql+psycopg://caremate:caremate@localhost:5433/caremate"

    OPENAI_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None
    STT_API_KEY: str | None = None
    TTS_API_KEY: str | None = None
    MAP_API_KEY: str | None = None
    LOCATION_RETENTION_DAYS: int = 30
    LLM_PROVIDER: str = "stub"
    LLM_MODEL: str = "gpt-5.4-mini"
    LLM_TIMEOUT_SECONDS: int = 20
    STT_PROVIDER: str = "stub"
    STT_MODEL: str = "gpt-4o-mini-transcribe"
    STT_TIMEOUT_SECONDS: int = 30
    STT_LANGUAGE: str = "ko"
    STT_PROMPT: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def app_name(self) -> str:
        return self.APP_NAME

    @property
    def api_prefix(self) -> str:
        return self.API_PREFIX

    @property
    def database_url(self) -> str:
        return self.DATABASE_URL

    @property
    def openai_api_key(self) -> str:
        return self.OPENAI_API_KEY or ""

    @property
    def gemini_api_key(self) -> str:
        return self.GEMINI_API_KEY or ""

    @property
    def stt_api_key(self) -> str:
        return self.STT_API_KEY or ""

    @property
    def tts_api_key(self) -> str:
        return self.TTS_API_KEY or ""

    @property
    def map_api_key(self) -> str:
        return self.MAP_API_KEY or ""

    @property
    def location_retention_days(self) -> int:
        return self.LOCATION_RETENTION_DAYS

    @property
    def llm_provider(self) -> str:
        return self.LLM_PROVIDER

    @property
    def llm_model(self) -> str:
        return self.LLM_MODEL

    @property
    def llm_timeout_seconds(self) -> int:
        return self.LLM_TIMEOUT_SECONDS

    @property
    def stt_provider(self) -> str:
        return self.STT_PROVIDER

    @property
    def stt_model(self) -> str:
        return self.STT_MODEL

    @property
    def stt_timeout_seconds(self) -> int:
        return self.STT_TIMEOUT_SECONDS

    @property
    def stt_language(self) -> str:
        return self.STT_LANGUAGE

    @property
    def stt_prompt(self) -> str | None:
        return self.STT_PROMPT


settings = Settings()

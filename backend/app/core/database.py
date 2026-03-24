from dataclasses import dataclass

from app.core.config import settings


@dataclass
class DatabaseConfig:
    url: str


db_config = DatabaseConfig(url=settings.database_url)

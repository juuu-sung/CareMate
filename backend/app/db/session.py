from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

# ----------------------------------------
# DB 엔진 생성
# ----------------------------------------
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,  # 연결 끊김 방지
    echo=False,          # True면 SQL 로그 출력
)

# ----------------------------------------
# 세션 생성기
# ----------------------------------------
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# ----------------------------------------
# Base (모델 공통 부모)
# ----------------------------------------
Base = declarative_base()


# ----------------------------------------
# FastAPI Dependency (핵심)
# ----------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
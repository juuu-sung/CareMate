# Backend

FastAPI 기반 서버 골격입니다.

- `api/routers`: 엔드포인트 정의
- `services`: 외부 연동과 비즈니스 로직 연결
- `rules`: 안전 판단용 규칙 로직
- `schemas`: 요청 및 응답 스키마
- `core`: 설정과 데이터베이스 연결

## Local Run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
DATABASE_URL=postgresql+psycopg://caremate:caremate@localhost:5433/caremate python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

## Docker

루트 디렉터리에서 실행:

```bash
docker compose up -d db
docker compose up backend
```

로컬에서 직접 접속할 때는 Docker Postgres가 `localhost:5433`에 열립니다.

## Alembic

초기 마이그레이션 적용:

```bash
source .venv/bin/activate
DATABASE_URL=postgresql+psycopg://caremate:caremate@localhost:5433/caremate alembic upgrade head
```

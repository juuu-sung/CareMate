# Backend

FastAPI 기반 서버 골격입니다.

- `api/routers`: 엔드포인트 정의
- `services`: 외부 연동과 비즈니스 로직 연결
- `rules`: 안전 판단용 규칙 로직
- `schemas`: 요청 및 응답 스키마
- `core`: 설정과 데이터베이스 연결

## Local Run

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Docker

루트 디렉터리에서 실행:

```bash
docker compose up -d db
docker compose up backend
```

## Alembic

초기 마이그레이션 적용:

```bash
alembic upgrade head
```

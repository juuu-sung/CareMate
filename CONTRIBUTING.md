# Contributing

CareMate는 노인 돌봄 시나리오를 다루기 때문에 기능 추가보다 동작 안정성과 문서 정합성을 우선합니다.

## 기본 원칙

- 안전 판단은 규칙 기반 로직을 우선합니다.
- 건강 관련 기능은 진단처럼 보이지 않도록 표현을 제한합니다.
- UI 변경은 고령층 친화성을 해치지 않아야 합니다.
- API 계약이나 DB 스키마를 바꾸면 관련 문서를 함께 수정합니다.

## 작업 순서

1. 이슈를 만들고 범위를 명확히 합니다.
2. 화면과 API 계약을 먼저 확인합니다.
3. 구현 후 수동 검증 또는 테스트를 수행합니다.
4. 문서와 실행 방법을 같이 업데이트합니다.

## 브랜치와 커밋

- 브랜치는 작업 목적이 드러나게 작성합니다.
- 커밋 메시지는 짧고 명확하게 작성합니다.
- 큰 작업은 화면, API, 문서 변경을 분리해 커밋하는 편이 좋습니다.

예시:

- `feat: connect guardian dashboard to backend`
- `docs: update API and DB schema draft`
- `chore: add docker compose and alembic setup`

## Pull Request 체크리스트

- [ ] 기능 범위가 이슈와 일치함
- [ ] API 변경 시 문서 반영 완료
- [ ] DB 변경 시 마이그레이션 반영 완료
- [ ] UI 변경 시 고령층 친화성 확인
- [ ] 민감 정보나 실제 키가 커밋되지 않음

## 로컬 실행

### 앱

```bash
cd mobile
npm install
npx expo start
```

### 백엔드

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
DATABASE_URL=postgresql+psycopg://caremate:caremate@localhost:5433/caremate python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

### DB와 마이그레이션

```bash
docker compose up -d db
cd backend
source .venv/bin/activate
DATABASE_URL=postgresql+psycopg://caremate:caremate@localhost:5433/caremate alembic upgrade head
```

# Mobile

Expo Router 기반 모바일 앱 골격입니다.

- `(user)`: 노인 사용자용 화면
- `(guardian)`: 보호자용 화면
- `components/common`: 공통 UI
- `services`: API 호출 계층
- `types`: 공통 타입

## Local API

실기기에서 테스트할 때는 `localhost` 대신 개발용 PC의 로컬 IP를 사용해야 합니다.

예시:

```bash
cp .env.example .env
```

`.env`:

```env
EXPO_PUBLIC_API_BASE_URL=http://<PRIVATE_IP>:8001/api/v1
```

백엔드는 다음처럼 외부 접근 가능하게 실행합니다.

```bash
cd ../backend
source .venv/bin/activate
DATABASE_URL=postgresql+psycopg://caremate:caremate@localhost:5433/caremate python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

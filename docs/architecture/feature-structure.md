# Feature Structure

현재 프로젝트 구조를 기능 기준으로 정리한 문서입니다.
폴더 자체는 기술 계층별로 나뉘어 있지만, 실제 개발은 아래 기능 단위로 보면 더 이해하기 쉽습니다.

## 1. 사용자 앱 기능

대상:

- 노인 사용자
- 큰 버튼, 단순한 화면 흐름, 음성 중심 인터페이스

관련 파일:

- [`mobile/app/(user)/home.tsx`](mobile/app/(user)/home.tsx)
- [`mobile/app/(user)/chat.tsx`](mobile/app/(user)/chat.tsx)
- [`mobile/app/(user)/medication.tsx`](mobile/app/(user)/medication.tsx)
- [`mobile/app/(user)/schedule.tsx`](mobile/app/(user)/schedule.tsx)
- [`mobile/app/(user)/sos.tsx`](mobile/app/(user)/sos.tsx)
- [`mobile/app/(user)/settings.tsx`](mobile/app/(user)/settings.tsx)

세부 기능:

- 홈 화면 진입
- 대화형 AI
- 복약 조회
- 일정 조회
- SOS 요청
- 기본 설정

## 2. 보호자 앱 기능

대상:

- 보호자
- 상태 요약, 알림 확인, 위치 확인, 모드 제어

관련 파일:

- [`mobile/app/(guardian)/dashboard.tsx`](mobile/app/(guardian)/dashboard.tsx)
- [`mobile/app/(guardian)/alerts.tsx`](mobile/app/(guardian)/alerts.tsx)
- [`mobile/app/(guardian)/location.tsx`](mobile/app/(guardian)/location.tsx)
- [`mobile/app/(guardian)/modes.tsx`](mobile/app/(guardian)/modes.tsx)
- [`mobile/app/(guardian)/profile.tsx`](mobile/app/(guardian)/profile.tsx)

세부 기능:

- 상태 요약 대시보드
- 이상 징후 알림 이력
- 상시 위치 확인
- 돌봄 모드 및 세부 옵션 설정
- 보호자 프로필 및 연결 정보

## 3. 공통 모바일 UI 계층

목적:

- 사용자 앱과 보호자 앱이 공통으로 쓰는 화면 레이아웃과 카드 UI

관련 파일:

- [`mobile/app/_layout.tsx`](mobile/app/_layout.tsx)
- [`mobile/app/index.tsx`](mobile/app/index.tsx)
- [`mobile/components/common/SeniorScreen.tsx`](mobile/components/common/SeniorScreen.tsx)
- [`mobile/components/common/SectionCard.tsx`](mobile/components/common/SectionCard.tsx)

역할:

- 라우팅 루트 구성
- 공통 화면 컨테이너
- 카드형 정보 섹션 UI

## 4. 모바일 데이터 접근 계층

목적:

- 앱 화면과 백엔드 API를 연결

관련 파일:

- [`mobile/services/api.ts`](mobile/services/api.ts)
- [`mobile/services/chat.ts`](mobile/services/chat.ts)
- [`mobile/services/guardian.ts`](mobile/services/guardian.ts)
- [`mobile/types/care.ts`](mobile/types/care.ts)
- [`mobile/types/guardian.ts`](mobile/types/guardian.ts)

역할:

- `api.ts`: 공통 HTTP 요청 함수
- `chat.ts`: 대화 API 연동
- `guardian.ts`: 보호자 대시보드 API 연동
- `types/`: 화면과 API가 공유하는 타입 정의

## 5. 백엔드 API 기능

목적:

- 앱에서 호출하는 REST API 제공

관련 파일:

- [`backend/app/main.py`](backend/app/main.py)
- [`backend/app/api/router.py`](backend/app/api/router.py)
- [`backend/app/api/routers/health.py`](backend/app/api/routers/health.py)
- [`backend/app/api/routers/chat.py`](backend/app/api/routers/chat.py)
- [`backend/app/api/routers/medication.py`](backend/app/api/routers/medication.py)
- [`backend/app/api/routers/schedule.py`](backend/app/api/routers/schedule.py)
- [`backend/app/api/routers/alerts.py`](backend/app/api/routers/alerts.py)
- [`backend/app/api/routers/location.py`](backend/app/api/routers/location.py)
- [`backend/app/api/routers/modes.py`](backend/app/api/routers/modes.py)
- [`backend/app/api/routers/guardians.py`](backend/app/api/routers/guardians.py)

기능별 분류:

- 대화: `chat.py`
- 복약: `medication.py`
- 일정: `schedule.py`
- 알림: `alerts.py`
- 위치: `location.py`
- 돌봄 모드: `modes.py`
- 보호자 대시보드: `guardians.py`
- 상태 확인: `health.py`

## 6. 백엔드 비즈니스 로직 계층

목적:

- 라우터가 직접 모든 로직을 처리하지 않도록 분리

관련 파일:

- [`backend/app/services/llm_service.py`](backend/app/services/llm_service.py)
- [`backend/app/services/alert_service.py`](backend/app/services/alert_service.py)
- [`backend/app/services/location_service.py`](backend/app/services/location_service.py)
- [`backend/app/services/mode_service.py`](backend/app/services/mode_service.py)
- [`backend/app/services/guardian_service.py`](backend/app/services/guardian_service.py)

기능별 역할:

- `llm_service.py`: 대화 응답 생성
- `alert_service.py`: 알림 목록 처리
- `location_service.py`: 상시 위치 최신값 처리
- `mode_service.py`: 돌봄 모드 조회 및 수정
- `guardian_service.py`: 보호자 대시보드 집계

## 7. 규칙 기반 안전 판단 기능

목적:

- LLM이 아니라 규칙으로 이상 징후를 판단

관련 파일:

- [`backend/app/rules/anomaly_rules.py`](backend/app/rules/anomaly_rules.py)

현재 규칙 입력:

- 체크인 미응답 여부
- 복약 미응답 횟수
- 일정 미응답 횟수
- SOS 요청 여부
- 장시간 활동 없음

현재 규칙 출력:

- 사용자 확인 필요 여부
- 보호자 알림 여부
- 판단 사유

## 8. 백엔드 데이터 계약 계층

목적:

- API 요청과 응답 스키마를 고정

관련 파일:

- [`backend/app/schemas/chat.py`](backend/app/schemas/chat.py)
- [`backend/app/schemas/alerts.py`](backend/app/schemas/alerts.py)
- [`backend/app/schemas/location.py`](backend/app/schemas/location.py)
- [`backend/app/schemas/modes.py`](backend/app/schemas/modes.py)
- [`backend/app/schemas/guardians.py`](backend/app/schemas/guardians.py)

역할:

- 요청 데이터 검증
- 응답 형식 고정
- 모바일 타입과 맞춰서 API 계약 유지

## 9. 설정 및 인프라 준비 계층

목적:

- 앱 설정, 환경 변수, DB 연결 준비

관련 파일:

- [`backend/app/core/config.py`](backend/app/core/config.py)
- [`backend/app/core/database.py`](backend/app/core/database.py)
- [`backend/.env.example`](backend/.env.example)
- [`backend/requirements.txt`](backend/requirements.txt)
- [`mobile/package.json`](mobile/package.json)
- [`mobile/tsconfig.json`](mobile/tsconfig.json)

## 10. 문서 기능별 분류

기획 및 명세 문서:

- [`README.md`](README.md): 전체 프로젝트 개요와 MVP 범위
- [`docs/proposal/README.md`](docs/proposal/README.md): 제안서 정리 공간
- [`docs/api-spec/README.md`](docs/api-spec/README.md): API 계약
- [`docs/architecture/database-schema.md`](docs/architecture/database-schema.md): DB 스키마 초안
- [`docs/test-scenarios/README.md`](docs/test-scenarios/README.md): 테스트 시나리오

## 11. 지금 기준으로 가장 중요한 흐름

현재 가장 먼저 구현을 이어가기 좋은 기능 축은 아래 순서입니다.

1. 보호자 대시보드
2. 돌봄 모드 설정
3. 알림 이력
4. 최신 위치 확인
5. 사용자 대화 화면

이 순서가 좋은 이유:

- 이미 대시보드 API와 모바일 화면 연결이 시작됨
- 대시보드가 복약, 일정, 위치, 알림 집계를 모두 요구하므로 다른 기능의 중심이 됨
- 모드 설정이 붙으면 보호자 앱의 핵심 가치가 바로 드러남

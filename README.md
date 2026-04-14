# CareMate

고령층의 일상 자립과 안전한 생활을 지원하는 모바일 중심 AI 돌봄 플랫폼입니다.  
대화형 AI, 복약 및 일정 관리, 규칙 기반 이상 징후 확인, 보호자 연계, 위치 기반 대응 기능을 하나의 서비스로 통합하는 것을 목표로 합니다.

## Overview

CareMate는 단순 알림 앱이 아니라, 노인 사용자와 보호자가 함께 사용하는 통합형 돌봄 서비스입니다.

핵심 방향:

- 모바일 앱 우선
- 고령층 친화 UI/UX
- 버튼 기반 턴형 음성 대화
- 규칙 기반 안전 판단
- 보호자 앱 중심의 모드 및 옵션 제어
- 상시 위치 추적 기반의 안전 대응

## Problem

고령층은 복약, 일정, 긴급 대응, 디지털 기기 사용, 공공서비스 접근에서 여러 어려움을 동시에 겪는 경우가 많습니다.  
기존 서비스는 말동무, 생활 지원, 안전 확인, 보호자 연계 기능이 분절되어 있어 실제 생활 흐름을 끊김 없이 지원하기 어렵습니다.

CareMate는 다음 문제를 우선 해결합니다.

- 돌봄 공백 시간의 불안정성
- 복약 및 일정 누락
- 체크인 미응답과 장시간 활동 없음의 조기 감지
- 보호자 대응 지연
- 디지털 취약계층의 앱 사용 부담

## Core Features

| 영역 | 설명 |
| --- | --- |
| 대화형 AI | 말동무, 생활 질의응답, 일정 확인, 쉬운 설명 제공 |
| 복약 및 일정 관리 | 복약 시간, 병원 일정, 생활 일정 조회 및 알림 |
| 이상 징후 확인 | 체크인 미응답, 반복 미확인, 활동 없음, SOS를 규칙 기반으로 판단 |
| 보호자 연계 | 대시보드, 알림 이력, 위치 확인, 돌봄 모드 설정 |
| 위치 기반 대응 | 상시 위치 수집, 최신 위치 조회, SOS 시 위치 강조 |

## Care Modes

### Basic Mode

- 일반 대화
- 기본 복약 및 일정 알림
- 기본 체크인
- 기본 이상 징후 확인

### Cognitive Support Mode

- 반복 알림 강화
- 단순 문장 중심 응답
- 큰 버튼 중심 UI
- 자주 묻는 질문 빠른 응답
- 위치 확인 기능 강화

### Health Support Mode

- 복약 알림 강화
- 병원 및 검사 일정 강조
- 혈압, 혈당, 체중 등 건강 수치 기록
- 건강 관련 쉬운 설명

주의:
건강 지원 기능은 진단이나 판정을 수행하지 않습니다.  
기록, 리마인드, 쉬운 설명, 보호자 공유 보조를 목표로 합니다.

## Voice Interaction

CareMate는 상시 스트리밍이 아니라 버튼 기반 턴형 음성 대화를 사용합니다.

```text
말하기 버튼 누름
-> STT 변환
-> 사투리/구어체 보정
-> 의도 분류 및 응답 생성
-> 텍스트 + TTS 응답
```

이 방식은 구현 안정성이 높고, 오인식 시 재확인 질문을 넣기 쉽습니다.

## Safety Rules

안전 판단은 LLM이 아니라 규칙 기반 엔진이 담당합니다.

초기 MVP 판단 조건:

- 체크인 미응답
- 복약 알림 반복 미확인
- 일정 알림 반복 미응답
- SOS 요청
- 장시간 활동 없음

기본 흐름:

```text
이상 징후 감지
-> 사용자 확인 요청
-> 일정 시간 내 응답 확인
-> 미응답 시 보호자 알림
-> 보호자 대시보드 및 알림 이력 반영
```

## Location Policy

이번 버전은 상시 위치 추적을 포함합니다.

원칙:

- 사용자 동의와 보호자 설정 기반 활성화
- 안전 확인과 보호자 대응 보조 목적에 한정
- 보호자 앱에서 위치 공유 여부와 범위 제어
- 긴급 상황 시 최신 위치 우선 표시
- 향후 보관 주기와 보존 기간 세부 설정 확장

MVP 위치 기능:

- 최신 위치 수집 및 조회
- 보호자 앱 위치 화면
- SOS 발생 시 위치 강조 표시
- 인지 지원 모드에서 위치 확인 강화

## MVP Scope

### User App

- 대화형 AI 말동무
- 버튼 기반 음성 입력
- 텍스트 기반 생활 질의응답
- 복약 및 일정 조회
- 체크인 응답
- SOS 요청
- 큰 버튼 중심 홈 화면

### Guardian App

- 상태 요약 대시보드
- 이상 징후 알림 이력
- 상시 위치 확인 화면
- 돌봄 모드 설정
- 알림 반복 횟수, 체크인 빈도, 위치 공유 옵션 설정

### Backend

- 사용자와 보호자 연결 관리
- 복약 및 일정 관리
- 체크인 및 알림 스케줄링
- 규칙 기반 이상 징후 판단
- 위치 수집 및 최신 위치 조회
- 대화 API 및 외부 LLM 연동

## Tech Stack

### Frontend

- React Native
- Expo
- Expo Router

### Backend

- FastAPI
- Python

### Database

- PostgreSQL

### AI / Voice

- GPT or Gemini API
- STT API
- TTS API

### External Services

- Map / location API
- Push notification service

## Repository Structure

```text
CareMate/
├── README.md
├── .gitignore
├── docs/
│   ├── api-spec/
│   ├── architecture/
│   ├── proposal/
│   └── test-scenarios/
├── mobile/
│   ├── app/
│   │   ├── (user)/
│   │   └── (guardian)/
│   ├── components/
│   ├── services/
│   └── types/
└── backend/
    ├── app/
    │   ├── api/
    │   ├── core/
    │   ├── rules/
    │   ├── schemas/
    │   └── services/
    ├── requirements.txt
    └── .env.example
```

## Feature Map

- 사용자 앱 구조: [docs/architecture/feature-structure.md](docs/architecture/feature-structure.md)
- API 명세: [docs/api-spec/README.md](docs/api-spec/README.md)
- DB 스키마 초안: [docs/architecture/database-schema.md](docs/architecture/database-schema.md)
- 개발 체크리스트: [docs/project-management/development-checklist.md](docs/project-management/development-checklist.md)
- 테스트 시나리오: [docs/test-scenarios/README.md](docs/test-scenarios/README.md)

## Quick Start

### Frontend

```bash
cd mobile
npm install
npx expo start
```

### Backend

```bash
docker compose up -d db
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
DATABASE_URL=postgresql+psycopg://caremate:caremate@localhost:5433/caremate alembic upgrade head
DATABASE_URL=postgresql+psycopg://caremate:caremate@localhost:5433/caremate python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

## Environment Variables

```env
APP_NAME=CareMate
API_PREFIX=/api/v1
DATABASE_URL=postgresql+psycopg://caremate:caremate@localhost:5433/caremate
LLM_PROVIDER=openai
LLM_MODEL=gpt-5.4-mini
LLM_TIMEOUT_SECONDS=20
STT_PROVIDER=openai
STT_MODEL=gpt-4o-mini-transcribe
STT_TIMEOUT_SECONDS=30
STT_LANGUAGE=ko
TTS_PROVIDER=openai
TTS_MODEL=gpt-4o-mini-tts
TTS_TIMEOUT_SECONDS=30
TTS_VOICE=alloy
TTS_RESPONSE_FORMAT=mp3
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key
STT_API_KEY=your_stt_key
TTS_API_KEY=your_tts_key
MAP_API_KEY=your_map_key
LOCATION_RETENTION_DAYS=30
```

비고:

- `OPENAI_API_KEY`만 설정되어 있어도 현재 백엔드는 OpenAI를 우선 사용합니다.
- `LLM_PROVIDER`를 명시하면 해당 provider를 우선 사용합니다.
- `STT_PROVIDER=openai`이면 `/chat/speech`가 OpenAI `gpt-4o-mini-transcribe`를 사용합니다.
- `TTS_PROVIDER=openai`이면 `/chat/tts`가 OpenAI `gpt-4o-mini-tts`를 사용합니다.

## Collaboration

- 개발 체크리스트: [docs/project-management/development-checklist.md](docs/project-management/development-checklist.md)
- 기여 가이드: [CONTRIBUTING.md](CONTRIBUTING.md)
- 라이선스: [LICENSE](LICENSE)

## Roadmap

### Phase 1

- 대화형 AI
- 복약 및 일정 알림
- 체크인
- 기본 이상 징후 확인
- 보호자 알림
- 상시 위치 수집 및 최신 위치 확인
- 기본 모드, 인지 지원 모드, 건강 지원 모드

### Phase 2

- 사투리 보정 강화
- 공공문서 쉬운말 설명
- 건강 수치 공유 고도화
- 안전 반경 알림

### Phase 3

- 센서 연동
- 웨어러블 연동
- 공공 복지 서비스 연계
- 스마트홈 연계

## Expected Impact

- 노인의 정서적 고립 완화
- 복약 및 일정 관리 지원
- 돌봄 공백 최소화
- 보호자 대응 시간 단축
- 디지털 취약계층 접근성 향상
- 통합형 스마트 돌봄 플랫폼 기반 마련

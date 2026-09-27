<div align="center">

<img src="docs/assets/readme/caremate-hero-v2.png" alt="시니어와 보호자를 잇는 CareMate AI 생활·안전 돌봄 플랫폼" width="100%" />

<br />

<img src="https://img.shields.io/badge/Expo-56-000020?style=flat-square&logo=expo&logoColor=white" alt="Expo 56" />
<img src="https://img.shields.io/badge/React_Native-0.85-61DAFB?style=flat-square&logo=react&logoColor=111827" alt="React Native 0.85" />
<img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI 0.115" />
<img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL 16" />
<img src="https://img.shields.io/badge/License-MIT-F97316?style=flat-square" alt="MIT License" />
<img src="https://img.shields.io/badge/Status-In_Development-F59E0B?style=flat-square" alt="In Development" />

<br /><br />

[핵심 기능](#features) · [모델 학습](#model-training) · [AI 안전 설계](#safety) · [아키텍처](#architecture) · [빠른 시작](#quick-start) · [문서](#documentation)

</div>

---

## 🎯 Why CareMate

CareMate는 시니어의 일상 관리와 보호자 연계를 위한 **앱·서버 개발 프로젝트**입니다. 음성 대화, 복약·일정 관리, 위치 확인과 건강 신호 분석을 연결하며, 현재 개발·실험 단계입니다.

복약, 병원 일정, 위치 확인, 긴급 연락은 서로 따로 떨어진 기능이 아닙니다. 하나의 생활 흐름입니다.

CareMate는 단순히 대화하는 챗봇에서 멈추지 않고, 시니어의 일상 데이터와 보호자의 대응 흐름을 하나로 연결합니다. AI는 대화와 쉬운 설명을 담당하고, 실제 데이터 변경과 안전 판단은 재확인·서비스 계층·명시적 규칙으로 나누어 처리합니다.

| 시니어에게 | 보호자에게 |
| --- | --- |
| 🎙️ 말로 일정·복약 확인 | 📊 오늘의 돌봄 상태 요약 |
| 💊 복약 알림과 복용 기록 | 🔔 미복약·SOS·이상 징후 알림 |
| 📅 일정·병원 예약 관리 | 📍 최신 위치와 안전구역 확인 |
| 🆘 큰 버튼의 긴급 도움 요청 | 💬 대화 요약과 안부 편지 |
| 📱 Siri·위젯으로 빠른 진입 | ⚙️ 인지·건강 지원 모드 설정 |

<a id="features"></a>

## ✨ Features

### 🎙️ Voice-first Care Agent

- 버튼 기반 한국어 음성 입력과 TTS 응답
- 일정·복약·메시지·위치 요청의 의도와 필수 정보 분석
- 누락된 정보는 다시 묻고, 실수 비용이 큰 동작은 실행 전 재확인
- 범용 STT와 도메인 적응형 CareMate Whisper 경로 지원

```text
Voice → STT → Intent & Slots → Clarify / Confirm → Service Tool → TTS
```

### 👴 Senior Experience

- 큰 터치 영역, 짧은 문장, 역할별 고정 내비게이션
- 오늘의 일정·복약·보호자 편지를 모은 홈
- 복약 확인, 일정 조회, SOS, 음성 대화
- iOS 홈·잠금 화면 위젯과 Siri Shortcut

### 🧑‍🦰 Guardian Experience

- 복약·일정·알림·최근 활동을 요약한 보호자 대시보드
- 최신 위치 요청, 안전구역 설정, 이탈 상태 확인
- 일정·복약 원격 관리와 푸시 알림
- 대화 기록·안부 편지·건강 신호 보조 지표

### 🧠 Adaptive Care Modes

| 모드 | 설계 방향 |
| --- | --- |
| **Basic** | 일반 대화, 기본 복약·일정 알림, 생활 체크인 |
| **Cognitive Support** | 더 짧은 문장, 반복 알림, 위치 확인, 재확인 강화 |
| **Health Support** | 복약·병원 일정 우선, 건강 기록, 보호자 공유 보조 |

<a id="model-training"></a>

## 🔬 모델 학습

고령자·방언 음성 인식과 대화 속 건강 신호 분석을 위해 사전학습 모델을 목적별로 추가 학습하고, 앱·백엔드에 추론 경로를 연결했습니다.

| 모델 | 학습 내용 | 프로젝트 적용 |
| --- | --- | --- |
| **Whisper-medium + LoRA** | 중·노년층 방언·노인 명령어 음성으로 한국어 STT 추가 학습. LoRA `r=32`, 약 1 epoch 학습 후 `checkpoint-60000` 선택 | 사용자 음성 전사와 반복 출력 감지 |
| **XLS-R 300M** | 모노 16 kHz·최대 10초 음성을 입력으로 인지 저하·우울·불면 신호별 분류 모델 학습 | 발화별 건강 신호 보조 점수와 일별 집계 |
| **KoELECTRA** | 전사문 기반 정상·인지 저하 신호 이진 분류 모델 학습 | 음성 분석과 함께 사용하는 인지 텍스트 보조 점수 |

**Whisper 자체 평가** — 고정 Test set **63,844건**, 동일 체크포인트에서 출력 길이 설정을 비교했습니다. CER은 문자 오류율, WER은 단어 오류율이며 낮을수록 좋습니다.

| 출력 설정 | CER | WER | 반복 출력 감지 |
| --- | --- | --- | --- |
| 최대 128 tokens · 성능 보고 | **10.56%** | **24.57%** | 185건 · 0.2898% |
| 최대 80 tokens · STT 서버 기본값 | 10.92% | 24.77% | **59건 · 0.0924%** |

최대 80 tokens 설정에서 반복 출력 감지 건수가 **68.1% 감소**했습니다. STT 서버는 입력을 30초까지 허용하며, 백엔드는 반복 출력이 감지된 전사를 사용하지 않고 오류로 처리합니다.

평가 수치는 2026년 8월 자체 학습·평가 기록 기준이며 실제 사용자 운영 성과를 뜻하지 않습니다. 건강 신호 모델은 비진단 보조 지표로, 외부 검증과 집단별 편향 분석이 남아 있습니다. 원본 학습 데이터와 모델 가중치는 저장소에 포함하지 않습니다.

구현: [Whisper STT 서버](backend/stt_server/caremate_stt_server.py) · [음성·텍스트 분석 모델](backend/app/ai_models) · [학습 데이터 manifest 도구](backend/scripts/build_stt_manifest.py)

<a id="safety"></a>

## 🛡️ Safety by Design

CareMate의 핵심은 “AI가 많은 일을 하는 것”이 아니라 **“잘못된 실행을 줄이는 것”**입니다.

| 원칙 | 적용 방식 |
| --- | --- |
| **Grounded response** | 일정·복약·위치는 LLM의 기억이 아닌 실제 서비스 데이터로 답변합니다. |
| **Human confirmation** | 일정 등록, 복약 기록, 보호자 메시지 등 변경 동작은 사용자 확인 후 실행합니다. |
| **Deterministic safety** | SOS, 반복 미응답, 장시간 활동 없음은 LLM과 분리된 규칙 엔진에서 판단합니다. |
| **Authenticated access** | 부모님·보호자 비밀번호 로그인과 만료·폐기 가능한 세션을 사용하고, 민감 API에서 본인 또는 연결된 어르신의 정보만 접근하도록 검증합니다. |
| **Failure isolation** | AI·지도·기기 권한 오류가 복약·일정 등 핵심 기능 전체로 퍼지지 않게 나눅니다. |

로그인·비용 발생 요청에는 요청 제한을 적용하고, 모바일 세션은 SecureStore에 저장합니다. 인증·권한·세션·요청 제한 관련 [백엔드 테스트](backend/tests) 45개를 통과했습니다.

> [!IMPORTANT]
> CareMate의 건강·음성 분석 기능은 진단이 아닌 **비진단 보조 지표**입니다. 전문 의료인의 진단과 치료를 대체하지 않습니다.

> [!CAUTION]
> 공개 저장소에는 실제 환자·사용자의 의료 이미지, 음성, 위치, 연락처를 올리지 마세요. 예시는 합성·비식별 데이터만 사용하고, 보안 문제는 공개 이슈 대신 [`SECURITY.md`](SECURITY.md)의 비공개 신고 절차를 이용해 주세요.

<a id="architecture"></a>

## 🏗️ Architecture

```mermaid
flowchart LR
    Senior["시니어 앱<br/>음성 · 복약 · 일정 · SOS"]
    Guardian["보호자 앱<br/>대시보드 · 위치 · 알림"]
    API["FastAPI<br/>인증 · 권한 검증 · REST API"]
    Agent["Care Agent<br/>STT → Confirm → Tool → TTS"]
    Rules["Safety Rules<br/>SOS · 미응답 · 이상 징후"]
    DB[(PostgreSQL)]
    AI["OpenAI · Gemini<br/>CareMate Whisper"]
    Device["iOS Integrations<br/>Siri · Widget · Health · Location"]

    Senior --> API
    Guardian --> API
    API --> Agent
    API --> Rules
    API <--> DB
    Agent --> AI
    Senior --- Device

    classDef client fill:#FFF7ED,stroke:#F97316,color:#7C2D12;
    classDef server fill:#EFF6FF,stroke:#3B82F6,color:#1E3A8A;
    classDef safety fill:#ECFDF5,stroke:#10B981,color:#064E3B;
    class Senior,Guardian,Device client;
    class API,Agent,DB,AI server;
    class Rules safety;
```

### Repository

```text
CareMate/
├── mobile/                  # React Native + Expo 앱
│   ├── app/                 # 시니어·보호자 화면과 라우팅
│   ├── components/common/   # 공통 UI
│   ├── services/            # API·알림·위치·기기 연동
│   └── ios/                 # Siri·위젯 포함 iOS 네이티브 구성
├── backend/                 # FastAPI 백엔드
│   ├── app/api/             # 도메인별 API·인증·권한 검증
│   ├── app/services/        # 에이전트·돌봄 비즈니스 로직
│   ├── app/rules/           # 규칙 기반 안전 판단
│   ├── app/ai_models/       # 음성·텍스트 보조 분석 모델
│   ├── stt_server/          # Whisper LoRA 추론 서버
│   ├── tests/               # 인증·권한·세션 테스트
│   └── alembic/             # DB 마이그레이션
├── docs/                    # API·아키텍처·테스트 문서
└── docker-compose.yml       # PostgreSQL·백엔드 로컬 환경
```

## 🧰 Tech Stack

| Layer | Technologies |
| --- | --- |
| **Mobile** | React Native 0.85, Expo 56, Expo Router, TypeScript, React Native Maps |
| **Native / Device** | Siri App Intents, Home·Lock Screen Widget, Apple Health, Location, Push Notifications |
| **Backend** | Python 3.11, FastAPI, SQLAlchemy 2, Alembic, Pydantic |
| **Data** | PostgreSQL 16, Docker Compose |
| **AI / Voice** | OpenAI, Gemini, Whisper, KoELECTRA, XLS-R, STT·TTS |

<a id="quick-start"></a>

## 🚀 Quick Start

### Prerequisites

- Node.js `22.13+` (22.x 기준)
- npm `11+`
- Python `3.11`
- Docker & Docker Compose
- iOS 실행 시 Xcode, CocoaPods, 개발자 서명

> [!NOTE]
> 모바일 앱은 네이티브 기능을 사용하므로 Expo Go가 아닌 **Expo development build**로 실행합니다.

### 1. Database & Backend

```bash
docker compose up -d db

cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

DATABASE_URL=postgresql+psycopg://caremate:caremate@localhost:5433/caremate \
  alembic upgrade head

DATABASE_URL=postgresql+psycopg://caremate:caremate@localhost:5433/caremate \
  python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

서버가 실행되면 `http://localhost:8001/docs`에서 API 문서를 확인할 수 있습니다. 위 명령은 로컬 개발용입니다.

`backend/.env`의 `OPENAI_API_KEY`를 설정하면 예제의 OpenAI 대화·STT·TTS 경로를 사용할 수 있습니다. 키 없이 화면·API 흐름을 확인하려면 `LLM_PROVIDER`, `STT_PROVIDER`, `TTS_PROVIDER`를 `stub`으로 설정하세요. 건강 분석 모델은 별도 가중치가 있어야 동작합니다.

<details>
<summary>직접 학습한 CareMate Whisper 사용하기</summary>

`backend/`에서 STT 의존성을 설치하고 LoRA 어댑터 경로를 지정해 별도 서버를 실행합니다.

```bash
pip install -r stt_requirements.txt
STT_ADAPTER_DIR=/absolute/path/to/whisper-lora-adapter \
  python -m uvicorn stt_server.caremate_stt_server:app --host 127.0.0.1 --port 8002
```

`backend/.env`에 아래 설정을 추가한 뒤 API 서버를 재시작합니다.

```env
STT_PROVIDER=caremate_whisper
CAREMATE_STT_URL=http://127.0.0.1:8002/stt
```

</details>

### 2. Mobile

```bash
cd mobile
cp .env.example .env
npm ci

cd ios
pod install
cd ..

npx expo run:ios
```

실기기에서는 `mobile/.env`의 API 주소를 백엔드가 실행 중인 Mac의 LAN IP로 설정해야 합니다.

```env
EXPO_PUBLIC_API_BASE_URL=http://<YOUR_MAC_IP>:8001/api/v1
```

자세한 설정과 실기기 주의사항은 [`mobile/README.md`](mobile/README.md)와 [`backend/README.md`](backend/README.md)를 확인해 주세요.

<a id="documentation"></a>

## 📚 Documentation

| 문서 | 내용 |
| --- | --- |
| [API Specification](docs/api-spec/README.md) | 주요 요청·응답 계약 |
| [Architecture](docs/architecture/README.md) | 서버 계층, 데이터 흐름, 외부 연동 |
| [Database Schema](docs/architecture/database-schema.md) | PostgreSQL 스키마와 관계 |
| [Voice Agent E2E](docs/test-scenarios/voice-agent-e2e.md) | 음성 에이전트 핵심 테스트 시나리오 |
| [Development Checklist](docs/project-management/development-checklist.md) | 팀 개발·검증 체크리스트 |
| [Contributing Guide](CONTRIBUTING.md) | 로컬 개발 환경과 협업 규칙 |
| [Security Policy](SECURITY.md) | 민감정보 취급과 취약점 비공개 신고 절차 |

## 🧭 Roadmap

- [x] 시니어·보호자 역할별 모바일 흐름
- [x] 음성 에이전트의 재확인·도구 실행 구조
- [x] 복약·일정·편지·위치·안전구역 연결
- [x] 푸시 알림·Siri Shortcut·홈/잠금 화면 위젯
- [x] Whisper LoRA 학습·평가와 XLS-R·KoELECTRA 추론 연동
- [x] 부모님·보호자 비밀번호 로그인과 민감 API 접근 권한 검증
- [ ] 핵심 음성·복약·위치 시나리오 실기기 E2E 자동화
- [ ] 개인정보 동의·보존·삭제·접근 기록 정책 고도화
- [ ] 건강 신호 모델의 외부 검증과 편향 분석

## 📜 License

이 프로젝트는 [MIT License](LICENSE)로 배포됩니다.

<div align="center">

<sub>Built with care for seniors and the people who care for them.</sub>

</div>

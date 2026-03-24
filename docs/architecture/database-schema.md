# Database Schema Draft

동행AI MVP용 PostgreSQL 초안입니다.
초기에는 핵심 흐름인 사용자 연결, 돌봄 모드, 복약/일정, 이상 징후, 위치 이력에 집중합니다.

## 1. 핵심 엔티티

- `users`: 돌봄 대상자와 보호자 공통 사용자
- `guardian_links`: 보호자와 대상자 연결
- `care_profiles`: 대상자별 돌봄 모드와 옵션
- `medications`: 복약 스케줄
- `schedules`: 병원 및 생활 일정
- `alerts`: 이상 징후 및 주요 알림 이력
- `locations`: 상시 수집 위치 이력
- `check_ins`: 체크인 요청 및 응답 기록
- `chat_logs`: 대화 로그

## 2. 관계 개요

- 한 명의 대상자는 여러 보호자와 연결될 수 있음
- 대상자마다 하나의 활성 돌봄 프로필을 가짐
- 대상자는 여러 복약, 일정, 위치, 체크인, 대화 로그를 가질 수 있음
- 알림은 대상자 기준으로 생성되고 필요 시 보호자에게 노출됨

## 3. SQL 초안

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    role VARCHAR(20) NOT NULL CHECK (role IN ('senior', 'guardian')),
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(30),
    birth_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE guardian_links (
    id UUID PRIMARY KEY,
    senior_user_id UUID NOT NULL REFERENCES users(id),
    guardian_user_id UUID NOT NULL REFERENCES users(id),
    relationship_label VARCHAR(50),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE care_profiles (
    id UUID PRIMARY KEY,
    senior_user_id UUID NOT NULL UNIQUE REFERENCES users(id),
    mode VARCHAR(30) NOT NULL CHECK (mode IN ('basic', 'cognitive_support', 'health_support')),
    check_in_interval_minutes INTEGER NOT NULL DEFAULT 180,
    alert_repeat_count INTEGER NOT NULL DEFAULT 3,
    always_on_location_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE medications (
    id UUID PRIMARY KEY,
    senior_user_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(120) NOT NULL,
    dosage_note VARCHAR(120),
    scheduled_time TIME NOT NULL,
    repeat_daily BOOLEAN NOT NULL DEFAULT TRUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE schedules (
    id UUID PRIMARY KEY,
    senior_user_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(150) NOT NULL,
    description TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL,
    type VARCHAR(30) NOT NULL DEFAULT 'general',
    status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE check_ins (
    id UUID PRIMARY KEY,
    senior_user_id UUID NOT NULL REFERENCES users(id),
    requested_at TIMESTAMPTZ NOT NULL,
    responded_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'responded', 'missed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE alerts (
    id UUID PRIMARY KEY,
    senior_user_id UUID NOT NULL REFERENCES users(id),
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE locations (
    id UUID PRIMARY KEY,
    senior_user_id UUID NOT NULL REFERENCES users(id),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    source VARCHAR(30) NOT NULL DEFAULT 'mobile',
    captured_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chat_logs (
    id UUID PRIMARY KEY,
    senior_user_id UUID NOT NULL REFERENCES users(id),
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    mode VARCHAR(30) NOT NULL DEFAULT 'basic',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 4. 인덱스 권장안

```sql
CREATE INDEX idx_guardian_links_senior_user_id ON guardian_links(senior_user_id);
CREATE INDEX idx_guardian_links_guardian_user_id ON guardian_links(guardian_user_id);
CREATE INDEX idx_medications_senior_user_id ON medications(senior_user_id);
CREATE INDEX idx_schedules_senior_user_id_scheduled_at ON schedules(senior_user_id, scheduled_at);
CREATE INDEX idx_check_ins_senior_user_id_requested_at ON check_ins(senior_user_id, requested_at DESC);
CREATE INDEX idx_alerts_senior_user_id_created_at ON alerts(senior_user_id, created_at DESC);
CREATE INDEX idx_locations_senior_user_id_captured_at ON locations(senior_user_id, captured_at DESC);
CREATE INDEX idx_chat_logs_senior_user_id_created_at ON chat_logs(senior_user_id, created_at DESC);
```

## 5. MVP 이후 확장 포인트

- 센서 이벤트 테이블
- 웨어러블 데이터 테이블
- 위치 보존 정책 테이블
- 공공 복지 서비스 연계 이력
- 음성 원문과 STT 보정 로그

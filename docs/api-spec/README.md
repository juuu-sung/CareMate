# API Spec

동행AI MVP용 API 계약 초안입니다.
우선은 모바일 앱과 보호자 앱이 같은 백엔드를 사용한다는 전제로 작성합니다.

## 1. 기본 규칙

- Base URL: `/api/v1`
- 기본 Content-Type: `application/json`
- 음성 업로드 API는 `multipart/form-data` 사용
- 시간 필드: ISO 8601 문자열
- 좌표 필드: WGS84 기준 `latitude`, `longitude`
- 위치 API는 상시 수집된 최신 위치를 조회하는 방식을 기준으로 설계

## 2. 권한 범위

- `user`: 돌봄 대상자 앱
- `guardian`: 보호자 앱
- `shared`: 양쪽 모두 사용 가능

초기 MVP에서는 인증 세부 구현 전이므로 권한 범위만 명세하고, 실제 토큰 규칙은 추후 확정합니다.

## 3. 공통 응답 형식

성공 응답은 각 엔드포인트별 스키마를 그대로 반환합니다.

실패 응답 예시:

```json
{
  "detail": "Resource not found"
}
```

## 4. 엔드포인트 상세

### `GET /health`

- 권한: `shared`
- 목적: 서버 상태 확인

응답 예시:

```json
{
  "status": "ok"
}
```

### `POST /chat/message`

- 권한: `user`
- 목적: 텍스트 질문을 받아 대화 응답 생성

요청 필드:

- `text`: 사용자 입력 텍스트
- `mode`: `basic | cognitive_support | health_support`
- `context_source`: `text` 고정
- `client_message_id`: 클라이언트 요청 추적용 ID

응답 필드:

- `answer`: 사용자에게 보여줄 최종 응답
- `confirmation_needed`: 재확인 필요 여부
- `clarification_question`: 재확인 질문 문구
- `transcript`: 텍스트 입력 API에서는 원칙적으로 요청 텍스트를 그대로 반환
- `intent`: 분류된 의도
- `provider`: 사용한 LLM provider
- `mode`: 응답 생성에 반영된 돌봄 모드

요청 예시:

```json
{
  "text": "오늘 병원 예약 있나요?",
  "mode": "basic",
  "context_source": "text",
  "client_message_id": "msg_001"
}
```

응답 예시:

```json
{
  "answer": "오늘 오후 3시에 주민센터 방문 일정이 있습니다.",
  "confirmation_needed": false,
  "clarification_question": null,
  "transcript": "오늘 병원 예약 있나요?",
  "intent": "schedule_lookup",
  "provider": "gpt",
  "mode": "basic"
}
```

비고:

- MVP 단계에서는 생활 지원 중심 응답만 처리
- 의료 진단 및 응급 판정 응답은 제외
- 텍스트 API와 음성 API는 가능한 한 동일한 응답 구조를 사용

### `POST /chat/speech`

- 권한: `user`
- 목적: 음성 파일을 받아 STT 처리 후 노인특화 AI 에이전트 응답 생성
- Content-Type: `multipart/form-data`

요청 필드:

- `audio_file`: 사용자 음성 파일
- `mode`: `basic | cognitive_support | health_support`
- `audio_format`: `m4a | wav | mp3 | webm`
- `audio_duration_ms`: 음성 길이
- `client_message_id`: 클라이언트 요청 추적용 ID
- `transcript_visibility`: `always | on_low_confidence | hidden`

요청 예시 설명:

- 모바일 앱은 녹음 완료 후 음성 파일과 메타데이터를 함께 업로드한다.
- 서버는 STT 결과와 신뢰도, 의도 분류 결과를 바탕으로 응답 또는 재확인 질문을 생성한다.

응답 필드:

- `transcript`: STT 전사 결과
- `stt_confidence`: STT 신뢰도
- `answer`: 사용자에게 보여줄 최종 응답
- `confirmation_needed`: 재확인 필요 여부
- `clarification_question`: 재확인 질문 문구
- `intent`: 분류된 의도
- `stt_provider`: 사용한 STT provider
- `llm_provider`: 사용한 LLM provider
- `mode`: 응답 생성에 반영된 돌봄 모드

응답 예시 1. 정상 응답:

```json
{
  "transcript": "오늘 병원 가는 날인가요?",
  "stt_confidence": 0.93,
  "answer": "오늘 오후 3시에 병원 일정이 있어요.",
  "confirmation_needed": false,
  "clarification_question": null,
  "intent": "schedule_lookup",
  "stt_provider": "clova",
  "llm_provider": "gemini",
  "mode": "basic"
}
```

응답 예시 2. 재확인 필요:

```json
{
  "transcript": "내일 약 있나",
  "stt_confidence": 0.61,
  "answer": "",
  "confirmation_needed": true,
  "clarification_question": "내일 드시는 약 시간을 물으신 걸까요?",
  "intent": "needs_clarification",
  "stt_provider": "clova",
  "llm_provider": "gemini",
  "mode": "health_support"
}
```

비고:

- 재확인 질문은 STT 신뢰도가 낮거나 의도 분류가 애매할 때 우선 사용
- 원문 해석이 불안정할 경우 정답처럼 답하지 않음
- 음성 원문 저장 여부는 추후 개인정보 및 운영 정책에 따라 확정
- 초기 MVP는 비실시간 업로드 기반 턴형 음성 대화만 지원

### `GET /guardians/dashboard`

- 권한: `guardian`
- 목적: 보호자 대시보드 첫 화면 데이터 조회

응답 예시:

```json
{
  "care_mode": "basic",
  "check_in_status": "responded",
  "latest_location_status": "available",
  "latest_location_label": "서울시청 인근",
  "latest_location_captured_at": "2026-03-24T10:20:00+09:00",
  "open_alert_count": 1,
  "today_medication_pending_count": 1,
  "today_schedule_count": 2
}
```

필드 설명:

- `care_mode`: 현재 적용 중인 돌봄 모드
- `check_in_status`: `responded | pending | missed`
- `latest_location_status`: `available | unavailable`
- `open_alert_count`: 아직 확인되지 않은 주요 알림 개수
- `today_medication_pending_count`: 오늘 기준 미확인 복약 수
- `today_schedule_count`: 오늘 남은 일정 수

### `GET /medications`

- 권한: `shared`
- 목적: 복약 일정 목록 조회

응답 예시:

```json
{
  "items": [
    {
      "name": "혈압약",
      "time": "08:00",
      "status": "scheduled"
    }
  ]
}
```

### `GET /schedules`

- 권한: `shared`
- 목적: 일정 목록 조회

응답 예시:

```json
{
  "items": [
    {
      "title": "주민센터 방문",
      "time": "15:00",
      "status": "scheduled"
    }
  ]
}
```

### `GET /alerts`

- 권한: `guardian`
- 목적: 이상 징후 및 주요 알림 이력 조회

응답 예시:

```json
[
  {
    "type": "medication_missed",
    "message": "복약 알림 3회 미응답",
    "created_at": "2026-03-24T09:30:00+09:00"
  }
]
```

### `POST /location`

- 권한: `user`
- 목적: 앱이 최신 위치를 서버에 전송

요청 예시:

```json
{
  "latitude": 37.5665,
  "longitude": 126.978,
  "source": "mobile"
}
```

응답 예시:

```json
{
  "latitude": 37.5665,
  "longitude": 126.978,
  "captured_at": "2026-03-24T10:20:00+09:00",
  "source": "mobile"
}
```

### `GET /location/latest`

- 권한: `guardian`
- 목적: 보호자 앱에서 최신 위치 확인

응답 예시:

```json
{
  "latitude": 37.5665,
  "longitude": 126.978,
  "captured_at": "2026-03-24T10:20:00+09:00",
  "source": "mobile"
}
```

### `GET /modes/current`

- 권한: `guardian`
- 목적: 현재 돌봄 모드 및 옵션 조회

응답 예시:

```json
{
  "mode": "basic",
  "options": {
    "check_in_interval_minutes": 180,
    "alert_repeat_count": 3,
    "always_on_location_enabled": true
  }
}
```

### `PATCH /modes/current`

- 권한: `guardian`
- 목적: 돌봄 모드와 세부 옵션 수정

요청 예시:

```json
{
  "mode": "cognitive_support",
  "options": {
    "check_in_interval_minutes": 120,
    "alert_repeat_count": 4,
    "always_on_location_enabled": true
  }
}
```

응답 예시:

```json
{
  "mode": "cognitive_support",
  "options": {
    "check_in_interval_minutes": 120,
    "alert_repeat_count": 4,
    "always_on_location_enabled": true
  }
}
```

## 5. 다음 확정 항목

- 인증 방식과 사용자 구분
- 보호자와 대상자 매핑 규칙
- 알림 상태값 목록
- 이상 징후 규칙과 임계값
- 위치 보관 기간과 삭제 정책
- 음성 업로드 길이 제한과 허용 포맷
- STT confidence 임계값
- 전사문 사용자 노출 정책

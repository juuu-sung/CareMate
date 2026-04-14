# Voice Agent E2E

실제 기기에서 `음성 -> 확인 -> 전송` 흐름을 검증하는 체크리스트입니다.

## 사전 조건

- 백엔드 실행
- 모바일 Expo 실행
- `OPENAI_API_KEY` 설정 완료
- `STT_PROVIDER=openai`
- `LLM_PROVIDER=openai`
- `TTS_PROVIDER=openai`

## 테스트 문장

1. 첫 음성
   - `보호자한테 지금 집에 있다고 보내줘`
2. 확인 음성
   - `네`

## 기대 동작

1. 첫 음성 전송 후
   - 전사문이 사용자 버블로 표시됨
   - 재확인 질문이 시스템 버블로 표시됨
   - 예시: `보호자에게 '지금 집에 있다고'라고 보낼까요?`

2. 두 번째 음성 `네` 전송 후
   - 완료 응답이 assistant 버블로 표시됨
   - 예시: `보호자에게 '지금 집에 있다고'라고 전달했어요.`

3. TTS
   - 재확인 질문 또는 완료 응답이 자동 재생됨

## 확인 SQL

```sql
SELECT sender_role, content, link_code, created_at
FROM letters
ORDER BY created_at DESC
LIMIT 5;
```

성공 기준:
- `sender_role = 'elder'`
- `content = '지금 집에 있다고'`

## 복약 기록 확인 SQL

```sql
SELECT medication_name, time_scope, status, recorded_at
FROM medication_logs
ORDER BY recorded_at DESC
LIMIT 5;
```

## 모드 변경 확인 SQL

```sql
SELECT mode, updated_at
FROM care_profiles
ORDER BY updated_at DESC
LIMIT 5;
```

## 실패 시 우선 확인

1. `/api/v1/chat/speech` 응답의 `transcript`
2. `stt_confidence`
3. `pending_action`
4. `awaiting_confirmation`
5. 서버 로그의 `stt_latency_ms`, `llm_latency_ms`, `total_latency_ms`

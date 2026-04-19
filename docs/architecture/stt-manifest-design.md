# STT Manifest Design

CareMate의 Whisper 실험용 데이터는 `dialect`와 `elder_command` 두 소스를 하나의 공통 manifest로 통합한다.
운영 STT 기준선은 `gpt-4o-mini-transcribe`를 유지하고, Whisper는 별도 실험 트랙으로 학습 및 평가한다.

## 목적

- 중·노년층 방언 발화 강건성을 확보한다.
- 노인 명령형 발화에서 일정, 복약, 보호자 메시지 같은 핵심 액션 인식률을 높인다.
- 소스별 성능 저하를 추적할 수 있도록 `dialect`와 `elder_command` 태그를 유지한다.

## 공통 manifest 스키마

권장 포맷은 `jsonl`이다. 한 줄에 하나의 utterance를 저장한다.

```json
{
  "id": "dialect_gs_000001",
  "audio_path": "data/dialect/audio/gs_000001.wav",
  "transcript": "오늘은 허리가 좀 아프다 아이가",
  "normalized_text": "오늘은 허리가 좀 아프다 아이가",
  "source": "dialect",
  "split": "train",
  "speaker": {
    "id": "spk_1032",
    "gender": "female",
    "age_group": "60s",
    "region": "gyeongsang",
    "dialect": "gyeongsang"
  },
  "utterance": {
    "type": "qa",
    "domain": "free_speech",
    "is_command": false
  },
  "audio": {
    "sampling_rate": 48000,
    "channels": 1,
    "bit_depth": 16
  },
  "environment": {
    "recording_env": "home",
    "noise_env": "home",
    "device": "smartphone"
  },
  "sampling_weight": 1.0,
  "meta": {
    "raw_json_path": "data/dialect/label/gs_000001.json"
  }
}
```

## 필수 필드

- `id`: 전체 데이터셋에서 유일한 utterance id
- `audio_path`: wav 파일 경로
- `transcript`: 원본 전사
- `normalized_text`: 학습용 정규화 전사
- `source`: `dialect` 또는 `elder_command`
- `split`: `train`, `validation`, `dialect_test`, `command_test`, `service_critical_test`
- `speaker.id`
- `utterance.type`

## 권장 필드

- `speaker.gender`
- `speaker.age_group`
- `speaker.region`
- `speaker.dialect`
- `utterance.domain`
- `audio.sampling_rate`
- `environment.recording_env`
- `environment.device`
- `sampling_weight`

## source 태그 유지 규칙

- `dialect`: 중·노년층 방언 데이터
- `elder_command`: 노인 명령어 음성 데이터

두 데이터는 반드시 섞어서 학습하되, source는 유지한다.
학습 후 성능 비교는 source별로 따로 본다.

## 1차 혼합셋 비율

1차 학습은 아래 비율을 권장한다.

- `dialect`: 55
- `elder_command`: 45

데이터 원천 수량 차이가 크면 `elder_command`를 oversampling해서 위 비율을 맞춘다.

2차 적응 단계는 아래 비율을 권장한다.

- `elder_command`: 80
- `dialect`: 20

## 평가셋 3종 분리

### 1. 방언 test

목적:
- 지역별 방언 및 중·노년 발화 강건성 평가

구성:
- `source == dialect`
- 지역, 성별, 연령, 발화타입 균형 유지

### 2. 명령어 test

목적:
- AI 비서, 로봇, 키오스크 도메인의 명령 인식 성능 평가

구성:
- `source == elder_command`
- 서비스형 명령과 비정형 명령 포함

### 3. 서비스 핵심 문장 test

목적:
- CareMate 실제 액션 기준 최종 평가

구성:
- `source == elder_command`
- 아래 의미 영역 포함
  - 일정 조회/등록
  - 복약 조회/체크
  - 보호자 메시지 전송
  - 모드 변경

서비스 핵심 문장 test는 `command_test`와 별도로 분리한다.

## split 규칙

- 기본 비율:
  - `train`: 80
  - `validation`: 10
  - `test`: 10
- speaker leakage 방지를 위해 split은 speaker 단위로 나눈다.
- 같은 화자의 발화는 하나의 split에만 들어간다.
- `service_critical_test`는 `elder_command`의 test speaker 중 핵심 문장 후보를 따로 추출해 구성한다.

## 산출 파일

`backend/scripts/build_stt_manifest.py`는 아래 파일을 출력하도록 설계한다.

- `manifest_all.jsonl`
- `train.jsonl`
- `validation.jsonl`
- `test_dialect.jsonl`
- `test_command.jsonl`
- `test_service_critical.jsonl`
- `summary.json`

## 실행 순서

1. 두 데이터 루트 경로를 확인한다.
2. `wav + json` 쌍이 실제로 어떻게 배치돼 있는지 확인한다.
3. source별 adapter에서 실제 JSON 키를 맞춘다.
4. manifest 생성 스크립트를 돌린다.
5. split별 건수와 source 비율을 확인한다.

## 주의사항

- 설명서 샘플 JSON보다 실제 JSON 원본 필드를 우선한다.
- transcript가 비어 있거나 audio pair를 찾지 못한 샘플은 제외한다.
- `service_critical_test`는 자동 키워드 추출 후 사람이 한 번 검토하는 것이 안전하다.

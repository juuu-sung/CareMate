# CareMate 팀원 온보딩 정리

이 문서는 `origin/main` 대비 현재 통합 작업본을 기준으로, 팀원이 로컬 환경을 다시 맞추고 실행하기 위해 필요한 설치와 설정을 정리한 문서입니다.

Notion에 그대로 붙여넣어도 섹션과 체크리스트가 유지되도록 Markdown 형태로 작성했습니다.

## 한 줄 요약

- 모바일은 이제 `Expo Go`가 아니라 `Expo development build` 기준입니다.
- 모바일은 `npm ci`, iOS는 `pod install`이 필요합니다.
- 백엔드는 `alembic upgrade head`를 반드시 다시 실행해야 합니다.
- 실기기 iPhone 테스트 시 `Developer Mode`, 개발자 인증서 신뢰, Signing 설정이 필요합니다.

## main 대비 바뀐 핵심

- Expo / React Native 버전이 올라감
  - `expo 54 -> 55`
  - `react-native 0.81 -> 0.83`
  - `react 19.1 -> 19.2`
- 모바일이 `expo-dev-client` 기반으로 변경됨
- iOS 위젯, Siri Shortcut, 음성 인식 관련 네이티브 구성이 추가됨
- 따라서 `Expo Go`로는 실행할 수 없음
- 백엔드 스키마에 `elder_profiles.agent_name`, `elder_profiles.agent_voice` 등 최신 컬럼이 필요함
- DB 마이그레이션을 올리지 않으면 보호자 로그인 등에서 `500`이 날 수 있음

## 권장 버전

### Runtime

- Node.js `20.19.5`
- npm `11.7.0`
- Python `3.11.9`

### Mobile 주요 패키지

- `expo` `55.0.0`
- `expo-router` `55.0.12`
- `expo-dev-client` `55.0.27`
- `expo-widgets` `55.0.13`
- `expo-speech-recognition` `3.1.2`
- `react` `19.2.0`
- `react-native` `0.83.4`
- `react-native-maps` `1.27.2`

### Backend 주요 패키지

- `fastapi` `0.115.0`
- `uvicorn[standard]` `0.30.6`
- `sqlalchemy` `2.0.36`
- `alembic` `1.14.0`
- `psycopg[binary]` `3.2.3`
- `python-multipart` `0.0.24`

## 팀원 체크리스트

- [ ] 최신 코드 pull 받기
- [ ] 모바일 `.env` 만들기
- [ ] `mobile`에서 `npm ci` 다시 실행
- [ ] `mobile/ios`에서 `pod install` 실행
- [ ] `backend` 가상환경 만들고 `pip install -r requirements.txt`
- [ ] Docker DB 실행
- [ ] `alembic upgrade head` 실행
- [ ] 백엔드 `uvicorn` 실행
- [ ] iOS 시뮬레이터 또는 실기기에서 development build 설치

## 빠른 전체 세팅 순서

```bash
git pull

cd mobile
cp .env.example .env
npm ci
cd ios
pod install
cd ..

cd ../backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..

docker compose up -d db

cd backend
source .venv/bin/activate
DATABASE_URL=postgresql+psycopg://caremate:caremate@localhost:5433/caremate alembic upgrade head
DATABASE_URL=postgresql+psycopg://caremate:caremate@localhost:5433/caremate python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

## 모바일 설정

### 1. 환경변수

`mobile/.env.example`를 복사해서 `.env`를 만듭니다.

예시:

```env
EXPO_PUBLIC_API_BASE_URL=http://<내-맥-로컬-IP>:8001/api/v1
EXPO_PUBLIC_WAKE_WORD_LABEL=케어
EXPO_PUBLIC_WAKE_WORD_PHRASES=케어,케어야,케어 야
```

주의:

- 실기기 테스트 시 `localhost`를 쓰면 안 됩니다.
- iPhone은 자기 자신이 아니라 Mac의 백엔드에 붙어야 하므로 `Mac의 LAN IP`를 넣어야 합니다.

### 2. 의존성 설치

```bash
cd mobile
npm ci
```

주의:

- `npm install` 대신 `npm ci`를 사용합니다.
- 현재 `package-lock.json` 기준으로 맞추는 것이 안전합니다.
- `postinstall`에서 iOS 관련 패치 스크립트가 자동으로 실행됩니다.

### 3. iOS pod 설치

```bash
cd mobile/ios
pod install
```

필요 이유:

- 위젯, dev client, speech recognition 등 네이티브 구성이 들어가 있기 때문입니다.

## 모바일 실행 방식

### 시뮬레이터 실행

```bash
cd mobile
npx expo run:ios
```

### 실기기 실행

```bash
cd mobile
npx expo run:ios --device
```

### 앱 설치 후 JS 서버만 다시 붙이기

```bash
cd mobile
npx expo start --dev-client --host lan
```

## 중요한 실행 원칙

- 이 프로젝트는 `Expo Go`로 실행할 수 없습니다.
- 반드시 `development build` 또는 Xcode 빌드로 실행해야 합니다.
- 실기기에서 QR이 안 붙을 때는 `--tunnel`보다 `--host lan`이 더 안정적이었습니다.

## iPhone 실기기 추가 설정

### 필수

- [ ] `Developer Mode` 켜기
- [ ] 개발자 인증서 신뢰
- [ ] 앱의 `로컬 네트워크` 권한 허용
- [ ] Mac과 iPhone을 같은 Wi‑Fi에 연결
- [ ] Xcode에서 `CareMate`, `ExpoWidgetsTarget` 둘 다 Signing 확인

### Developer Mode

경로:

`설정 > 개인정보 보호 및 보안 > 개발자 모드`

### 개발자 인증서 신뢰

경로:

`설정 > 일반 > VPN 및 기기 관리`

### Xcode Signing

두 타깃 모두 확인:

- `CareMate`
- `ExpoWidgetsTarget`

설정:

- `Automatically manage signing` 체크
- 본인 Apple Team 선택

주의:

- 공유 Team이 없으면 `bundleIdentifier`를 본인 로컬에서 바꿔야 할 수 있습니다.
- 개인 Apple 계정으로는 일부 capability 제약이 있습니다.

## 백엔드 설정

### 1. 가상환경

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. DB 실행

루트에서:

```bash
docker compose up -d db
```

기본 접속:

- host: `localhost`
- port: `5433`
- db: `caremate`

### 3. 마이그레이션

```bash
cd backend
source .venv/bin/activate
DATABASE_URL=postgresql+psycopg://caremate:caremate@localhost:5433/caremate alembic upgrade head
```

이 단계는 필수입니다.

이유:

- 최신 코드가 `elder_profiles.agent_name`, `elder_profiles.agent_voice` 컬럼을 사용합니다.
- 마이그레이션을 안 하면 보호자 로그인 시 `500 Internal Server Error`가 날 수 있습니다.

### 4. 서버 실행

```bash
cd backend
source .venv/bin/activate
DATABASE_URL=postgresql+psycopg://caremate:caremate@localhost:5433/caremate python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

## 실행 후 빠른 확인 체크리스트

- [ ] 부모님 회원가입
- [ ] 부모님 로그인 유지 확인
- [ ] 보호자 회원가입 / 로그인
- [ ] 보호자 홈 진입
- [ ] 보호자 `위치 확인` 진입
- [ ] 보호자 `대화 확인` 진입
- [ ] 보호자 `병원 일정 관리` 진입
- [ ] 보호자 편지 보내기
- [ ] 부모님 앱에서 편지 수신 확인
- [ ] 부모님 음성 대화 후 보호자에서 대화 기록 확인

## 자주 막히는 문제

### 1. 보호자 로그인 500

증상:

- `elder_profiles.agent_name does not exist`

원인:

- DB 마이그레이션 누락

해결:

```bash
cd backend
source .venv/bin/activate
DATABASE_URL=postgresql+psycopg://caremate:caremate@localhost:5433/caremate alembic upgrade head
```

### 2. iPhone 설치는 됐는데 앱 실행이 안 됨

증상:

- `신뢰하지 않는 개발자`

해결:

- `설정 > 일반 > VPN 및 기기 관리`에서 개발자 신뢰

### 3. `npx expo run:ios --device` 했는데 기기가 안 보임

원인 후보:

- iPhone 잠금 안 풀림
- `Developer Mode` 꺼짐
- Xcode가 아직 기기를 개발용으로 인식 못함

해결:

- USB 연결
- 잠금 해제
- `이 컴퓨터를 신뢰`
- Xcode `Devices and Simulators`에서 기기 인식 확인

### 4. 앱은 켜지는데 휴대폰에서 프로젝트 로딩 실패

증상:

- `Could not connect to the server`

원인:

- Metro 서버 미실행
- `EXPO_PUBLIC_API_BASE_URL` 또는 `Metro 8081` LAN 연결 문제

해결:

```bash
cd mobile
npx expo start --dev-client --host lan
```

추가 확인:

- iPhone과 Mac 같은 Wi‑Fi
- 앱 `로컬 네트워크` 권한 허용

### 5. 신규 가입했는데 `혈압약`, `주민센터 방문` 같은 데이터가 보임

원인:

- 이전에는 테스트용 fallback 데이터와 전역 elder 조회 로직이 있었음
- 현재는 로그인한 `elderUserId` 기준으로 조회하도록 수정됨

확인:

- 백엔드 재시작
- 앱 새로고침 후 다시 확인

## 운영 메모

- 실기기 데모용으로는 `development build` 유지가 가장 현실적입니다.
- `Expo Go`로 맞추려면 위젯, Siri, 음성 인식, react-native-maps 등 네이티브 기능을 많이 빼야 합니다.
- 팀원 간 iOS 실기기 테스트 시 Apple Team과 Signing 정책을 먼저 맞추는 것이 좋습니다.

## 노션 페이지 제목 예시

- `CareMate 팀원 온보딩 가이드`
- `CareMate 현재 개발환경 세팅 문서`
- `CareMate main 대비 실행 변경사항 정리`

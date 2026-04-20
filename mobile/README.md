# Mobile

Expo Router 기반 모바일 앱 골격입니다.

현재 앱 구조:

- `index`: 가입 유형 선택
- `parent-*`: 부모님 가입 및 AI 에이전트 온보딩
- `guardian-*`: 보호자 가입 및 부모님 정보 확인
- `home`: 부모님 홈
- `guardian-home`: 보호자 홈
- `chat`, `calendar`: 후속 API 연결용 기본 화면
- `components/common`: 공통 UI
- `services`: API 호출 계층
- `types`: 공통 타입

## Verified Install Versions

팀원이 같은 모바일 환경으로 받으려면 아래 기준으로 설치합니다.

- Node.js `20.19.5`
- npm `11.7.0`
- 설치 명령: `npm ci`
- 기준 파일: `package-lock.json`

직접 사용하는 주요 패키지 버전:

- `expo` `55.0.0`
- `expo-router` `55.0.12`
- `expo-audio` `55.0.13`
- `expo-constants` `55.0.14`
- `expo-dev-client` `55.0.27`
- `expo-linking` `55.0.13`
- `expo-location` `55.1.8`
- `expo-speech-recognition` `3.1.2`
- `expo-widgets` `55.0.13`
- `@expo/ui` `55.0.11`
- `react` `19.2.0`
- `react-native` `0.83.4`
- `react-native-maps` `1.27.2`
- `react-native-safe-area-context` `5.6.0`
- `react-native-screens` `4.23.0`

## Team Setup Checklist

현재 모바일은 `Expo Go`가 아니라 `Expo development build` 기준입니다.
팀원이 새로 받아서 맞춰야 하는 순서는 아래와 같습니다.

```bash
cp .env.example .env
npm ci
cd ios
pod install
cd ..
```

필수 확인:

- `Expo Go`로는 실행되지 않습니다.
- iOS 네이티브 구성이 포함되어 있어서 `pod install`이 필요합니다.
- `postinstall`에서 `patch-react-native-ios-encoding.js`가 자동으로 실행되므로 별도 스크립트 실행은 필요 없습니다.
- `.env`의 `EXPO_PUBLIC_API_BASE_URL`은 실기기 테스트 시 `localhost`가 아니라 백엔드가 떠 있는 Mac의 LAN IP여야 합니다.

## Development Build

앱 실행 중 웨이크워드 문구 감지는 Expo Go 대신 Expo development build로 실행합니다.

기본 순서:

```bash
cp .env.example .env
npm ci
cd ios
pod install
cd ..
npx expo run:ios
```

추가된 실행 명령:

- `npm run prebuild:ios`: iOS 네이티브 프로젝트를 다시 생성해야 할 때만 사용
- `npm run dev:ios`: iPhone 실기기에 development build 설치 및 실행

실기기에서 설치할 때:

```bash
npx expo run:ios --device
```

설치 후 JS만 다시 붙일 때:

```bash
npx expo start --dev-client --host lan
```

웨이크워드 환경변수:

```env
EXPO_PUBLIC_WAKE_WORD_LABEL=케어
EXPO_PUBLIC_WAKE_WORD_PHRASES=케어,케어야
```

설명:

- `EXPO_PUBLIC_WAKE_WORD_LABEL`: 감지되었을 때 표시할 대표 문구
- `EXPO_PUBLIC_WAKE_WORD_PHRASES`: 인식 결과에서 감지할 문구 목록. 쉼표로 여러 개를 넣을 수 있음

참고:

- 현재 구현은 `iPhone foreground` 기준입니다. 앱이 켜져 있고 백그라운드가 아닐 때만 동작합니다.
- 진짜 웨이크워드 엔진이 아니라 iOS 음성 인식 결과에서 지정한 문구를 잡아내는 방식입니다.
- 음성 인식 정확도는 주변 소음, 발화 속도, iOS 언어 설정에 영향을 받습니다.
- `케어`처럼 짧은 호출어는 오탐 가능성이 있어서, 필요하면 `케어야` 같은 변형을 같이 넣어 두는 편이 안정적입니다.

실기기 추가 설정:

- `Developer Mode` 활성화
- `설정 > 일반 > VPN 및 기기 관리`에서 개발자 인증서 신뢰
- `설정 > CareMate > 로컬 네트워크` 허용
- Xcode에서 `CareMate`, `ExpoWidgetsTarget` 둘 다 Signing 확인

## Siri Shortcut

앱이 꺼져 있을 때는 `케어`만으로 바로 깨울 수 없습니다. 대신 iPhone에서는 Siri Shortcut으로 `시리야, 케어 대화 시작` 흐름을 사용할 수 있습니다.

구현 내용:

- `App Shortcut`으로 `대화 시작` 인텐트 등록
- Siri가 앱 별칭 `케어`를 인식하도록 `CFBundleSpokenName`, `INAlternativeAppNames` 설정
- Siri로 실행되면 앱이 열리면서 `chat` 화면의 음성 자동 시작으로 연결

적용 방법:

```bash
npx expo prebuild --platform ios --clean
npx expo run:ios --device
```

테스트 방법:

- 앱을 한 번 실행
- Siri를 켜고 `시리야, 케어 대화 시작`이라고 말하기
- 또는 Shortcuts 앱에서 `케어`를 검색해 직접 실행하기

참고:

- Siri가 앱 별칭을 학습하는 데 시간이 걸릴 수 있어서, 처음엔 `CareMate 대화 시작`이 더 잘 잡힐 수 있습니다.
- 별칭 인식이 약하면 iPhone에서 앱을 한 번 실행한 뒤 다시 시도하는 편이 안정적입니다.

## Home Screen / Lock Screen Widget

음성 호출 대신 가장 빠르게 들어가는 방법은 위젯입니다. 위젯을 누르면 앱이 열리면서 바로 음성 대화 화면으로 들어갑니다.

구현 내용:

- 홈 화면 `systemSmall` 위젯 지원
- 잠금 화면 `accessoryCircular`, `accessoryRectangular` 위젯 지원
- 위젯 탭 시 `caremate://chat?input=voice&autostart=1&source=widget` 딥링크 실행

적용 방법:

```bash
npx expo prebuild --platform ios --clean
npx expo run:ios --device
```

사용 방법:

1. iPhone에서 홈 화면이나 잠금 화면을 길게 누르기
2. `위젯 편집` 또는 `사용자화`로 들어가기
3. `CareMate` 또는 `케어 대화` 위젯 추가
4. 위젯을 눌러 바로 음성 대화 시작

참고:

- 위젯 내용은 앱이 한 번 실행된 뒤 스냅샷이 채워지는 구조입니다.
- 잠금 화면 위젯도 앱 진입용으로 쓸 수 있지만, iPhone 상태에 따라 잠금 해제가 먼저 필요할 수 있습니다.

## Voice Control

`케어야`처럼 Siri 없이 부르는 방식은 앱 코드로 직접 넣을 수 없습니다. 대신 iPhone의 접근성 `음성 명령`에서 사용자가 직접 문구를 등록하는 우회는 가능합니다.

설정 예시:

1. `설정 > 손쉬운 사용 > 음성 명령`
2. `명령 사용자화 > 새 명령 생성`
3. 문구를 `케어야`로 입력
4. 동작을 `단축어 실행` 또는 케어 열기 흐름으로 연결

참고:

- 이 방식은 앱 기능이 아니라 사용자 기기 설정입니다.
- 기기 언어와 지원 상태에 따라 동작이 제한될 수 있습니다.
- 프로젝트 데모용 보조 수단으로만 보는 편이 맞습니다.

## Local API

실기기에서 테스트할 때는 `localhost` 대신 개발용 PC의 로컬 IP를 사용해야 합니다.

예시:

```bash
cp .env.example .env
npm ci
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

import Voice from '@react-native-voice/voice';
import Constants from 'expo-constants';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

let isWakeWordListening = false;
let isDetected = false;
let currentWakeName = '케어';
let currentOnDetected: (() => void | Promise<void>) | null = null;
let currentOnError: ((message: string) => void) | null = null;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let volumeEventSubscription: { remove: () => void } | null = null;

type StartWakeWordListeningParams = {
  wakeName?: string;
  onDetected: () => void | Promise<void>;
  onError?: (message: string) => void;
};

type SpeechRecognitionEvent = {
  value?: string[];
};

function clearRestartTimer() {
  if (!restartTimer) {
    return;
  }

  clearTimeout(restartTimer);
  restartTimer = null;
}

function normalizeWakeText(value: string) {
  return value
    .trim()
    .replace(/\s/g, '')
    .replace(/[.,!?~]/g, '')
    .replace(/[^\w가-힣]/g, '')
    .toLowerCase();
}

function buildWakeCandidates(wakeName: string) {
  const name = normalizeWakeText(wakeName || '케어');

  return [
    name,
    `${name}야`,
    `${name}아`,
    `${name}해야`,
    `${name}해줘`,
    `${name}시작`,
    `${name}불러`,
    `야${name}`,
    `안녕${name}`,
  ];
}

function isIosSimulator() {
  return Platform.OS === 'ios' && Constants.isDevice === false;
}

function serializeSpeechError(error: unknown) {
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isFatalStartRecordingError(message: string) {
  return (
    message.includes('start_recording') ||
    message.includes('IsFormatSampleRateAndChannelCountValid')
  );
}

function ensureSpeechVolumeEventSubscription() {
  if (Platform.OS === 'web' || volumeEventSubscription) {
    return;
  }

  const nativeVoiceModule = NativeModules.Voice;

  if (!nativeVoiceModule) {
    return;
  }

  try {
    const voiceEmitter = new NativeEventEmitter(nativeVoiceModule);

    volumeEventSubscription = voiceEmitter.addListener(
      'onSpeechVolumeChanged',
      () => {}
    );
  } catch (error) {
    console.log('[WakeWord] volume listener setup error:', error);
  }
}

function scheduleRestart(delayMs: number) {
  clearRestartTimer();

  restartTimer = setTimeout(() => {
    restartTimer = null;
    void restartListening();
  }, delayMs);
}

async function restartListening() {
  if (!isWakeWordListening || isDetected) {
    return;
  }

  try {
    await Voice.cancel();
  } catch {
    // ignore
  }

  try {
    await Voice.start('ko-KR');
  } catch (error) {
    const message = serializeSpeechError(error);
    console.log('[WakeWord] restart error:', error);
    currentOnError?.(message);

    if (isFatalStartRecordingError(message)) {
      isWakeWordListening = false;
      clearRestartTimer();
    }
  }
}

function checkWakeWord(values?: string[]) {
  if (isDetected) {
    return;
  }

  const text = values?.join(' ') ?? '';
  const normalizedText = normalizeWakeText(text);
  const candidates = buildWakeCandidates(currentWakeName);

  const detected = candidates.some((candidate) =>
    normalizedText.includes(candidate)
  );

  if (!detected) {
    return;
  }

  isDetected = true;
  isWakeWordListening = false;

  console.log('[WakeWord] detected:', currentWakeName);

  void Voice.stop()
    .catch(() => {})
    .finally(() => {
      void currentOnDetected?.();
    });
}

export async function startWakeWordListening({
  wakeName = '케어',
  onDetected,
  onError,
}: StartWakeWordListeningParams) {
  if (isIosSimulator()) {
    onError?.('iOS 시뮬레이터에서는 웨이크워드 음성 인식이 비활성화됩니다. 실제 기기에서 테스트해 주세요.');
    return;
  }

  currentWakeName = wakeName || '케어';
  currentOnDetected = onDetected;
  currentOnError = onError ?? null;
  isDetected = false;
  clearRestartTimer();
  ensureSpeechVolumeEventSubscription();

  if (isWakeWordListening) {
    return;
  }

  Voice.removeAllListeners();

  Voice.onSpeechPartialResults = (event: SpeechRecognitionEvent) => {
    checkWakeWord(event.value);
  };

  Voice.onSpeechResults = (event: SpeechRecognitionEvent) => {
    checkWakeWord(event.value);
  };

  Voice.onSpeechEnd = () => {
    if (!isDetected && isWakeWordListening) {
      scheduleRestart(300);
    }
  };

  Voice.onSpeechError = (error: unknown) => {
    const message = serializeSpeechError(error);
    console.log('[WakeWord] speech error:', error);
    currentOnError?.(message);

    if (isFatalStartRecordingError(message)) {
      isWakeWordListening = false;
      clearRestartTimer();
      void Voice.cancel().catch(() => {});
      return;
    }

    if (!isDetected && isWakeWordListening) {
      scheduleRestart(700);
    }
  };

  Voice.onSpeechVolumeChanged = () => {
    // React Native Voice emits frequent volume events during listening.
    // Registering a no-op listener prevents native "no listeners registered" warnings.
  };

  try {
    isWakeWordListening = true;
    await Voice.start('ko-KR');
    console.log('[WakeWord] start:', currentWakeName);
  } catch (error) {
    const message = serializeSpeechError(error);
    isWakeWordListening = false;
    clearRestartTimer();
    console.log('[WakeWord] start error:', error);
    currentOnError?.(message);
  }
}

export async function stopWakeWordListening() {
  try {
    if (isWakeWordListening) {
      await Voice.stop();
    }
  } catch (error) {
    console.log('[WakeWord] stop error:', error);
  } finally {
    clearRestartTimer();
    isWakeWordListening = false;
  }
}

export async function destroyWakeWord() {
  try {
    await Voice.stop();
    await Voice.destroy();
    Voice.removeAllListeners();
  } catch (error) {
    console.log('[WakeWord] destroy error:', error);
  } finally {
    clearRestartTimer();
    isWakeWordListening = false;
    isDetected = false;
    currentOnDetected = null;
    currentOnError = null;
  }
}

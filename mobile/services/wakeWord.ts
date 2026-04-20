import type { EventSubscription } from 'expo-modules-core';
import {
  AVAudioSessionCategory,
  AVAudioSessionCategoryOptions,
  AVAudioSessionMode,
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorEvent,
  type ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';
import { Platform } from 'react-native';

type WakeWordCallbacks = {
  onDetected: (keywordLabel: string) => void;
  onError?: (message: string) => void;
};

type WakeWordStartResult = {
  started: boolean;
  keywordLabel: string;
  reason?: string;
};

const defaultWakeWordLabel = process.env.EXPO_PUBLIC_WAKE_WORD_LABEL?.trim() || '케어';
const configuredWakeWordPhrases =
  process.env.EXPO_PUBLIC_WAKE_WORD_PHRASES?.split(',')
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
const wakeWordPhrases = Array.from(
  new Set(
    (configuredWakeWordPhrases.length > 0 ? configuredWakeWordPhrases : [defaultWakeWordLabel]).flatMap((value) => {
      const compact = value.replace(/\s+/g, '');
      return compact === value ? [value] : [value, compact];
    })
  )
);

let currentCallbacks: WakeWordCallbacks | null = null;
let subscriptions: EventSubscription[] = [];
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let shouldKeepListening = false;
let isRecognitionActive = false;
let isStopping = false;
let isDetecting = false;
let pendingStartPromise: Promise<WakeWordStartResult> | null = null;

function normalizeTranscript(value: string) {
  return value
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/gi, '');
}

function clearRestartTimer() {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
}

function getNormalizedWakeWordPhrases() {
  return wakeWordPhrases.map(normalizeTranscript).filter(Boolean);
}

function matchesWakeWord(transcript: string) {
  const normalizedTranscript = normalizeTranscript(transcript);

  if (!normalizedTranscript) {
    return false;
  }

  return getNormalizedWakeWordPhrases().some((phrase) => normalizedTranscript.includes(phrase));
}

function emitError(message: string) {
  currentCallbacks?.onError?.(message);
}

async function abortRecognitionIfNeeded() {
  try {
    const state = await ExpoSpeechRecognitionModule.getStateAsync();
    if (state !== 'inactive') {
      ExpoSpeechRecognitionModule.abort();
    }
  } catch {
    ExpoSpeechRecognitionModule.abort();
  }
}

async function beginRecognition() {
  if (!shouldKeepListening || isRecognitionActive || isStopping) {
    return;
  }

  ExpoSpeechRecognitionModule.start({
    lang: 'ko-KR',
    interimResults: true,
    continuous: true,
    maxAlternatives: 1,
    addsPunctuation: false,
    contextualStrings: wakeWordPhrases,
    iosTaskHint: 'search',
    iosCategory: {
      category: AVAudioSessionCategory.playAndRecord,
      categoryOptions: [AVAudioSessionCategoryOptions.defaultToSpeaker, AVAudioSessionCategoryOptions.allowBluetooth],
      mode: AVAudioSessionMode.measurement,
    },
    iosVoiceProcessingEnabled: true,
  });
}

function scheduleRestart(delay = 350) {
  if (!shouldKeepListening || isStopping || isDetecting) {
    return;
  }

  clearRestartTimer();
  restartTimer = setTimeout(() => {
    restartTimer = null;
    void beginRecognition();
  }, delay);
}

function ensureSubscriptions() {
  if (subscriptions.length > 0) {
    return;
  }

  subscriptions = [
    ExpoSpeechRecognitionModule.addListener('start', () => {
      isRecognitionActive = true;
    }),
    ExpoSpeechRecognitionModule.addListener('end', () => {
      isRecognitionActive = false;

      if (shouldKeepListening && !isStopping && !isDetecting) {
        scheduleRestart();
      }
    }),
    ExpoSpeechRecognitionModule.addListener('result', (event: ExpoSpeechRecognitionResultEvent) => {
      if (!shouldKeepListening || isDetecting) {
        return;
      }

      const transcript = event.results.map((result) => result.transcript).join(' ');

      if (!matchesWakeWord(transcript)) {
        return;
      }

      const activeCallbacks = currentCallbacks;
      isDetecting = true;

      void stopWakeWordListening({ preserveCallbacks: true }).finally(() => {
        isDetecting = false;
        activeCallbacks?.onDetected(defaultWakeWordLabel);
      });
    }),
    ExpoSpeechRecognitionModule.addListener('error', (event: ExpoSpeechRecognitionErrorEvent) => {
      isRecognitionActive = false;

      if (!shouldKeepListening) {
        return;
      }

      if (event.error === 'aborted' || event.error === 'no-speech') {
        scheduleRestart();
        return;
      }

      if (event.error === 'busy') {
        scheduleRestart(700);
        return;
      }

      const needsUserAction =
        event.error === 'not-allowed' ||
        event.error === 'service-not-allowed' ||
        event.error === 'language-not-supported';

      emitError(
        needsUserAction
          ? '음성 인식 권한 또는 서비스 설정을 확인해주세요.'
          : `웨이크워드 대기 중 오류가 발생했습니다. (${event.error})`
      );

      if (!needsUserAction) {
        scheduleRestart(700);
      }
    }),
  ];
}

type StopWakeWordOptions = {
  preserveCallbacks?: boolean;
};

export function getWakeWordLabel() {
  return defaultWakeWordLabel;
}

export async function startWakeWordListening(callbacks: WakeWordCallbacks): Promise<WakeWordStartResult> {
  if (pendingStartPromise) {
    currentCallbacks = callbacks;
    shouldKeepListening = true;
    return pendingStartPromise;
  }

  pendingStartPromise = (async () => {
    currentCallbacks = callbacks;
    shouldKeepListening = true;

    if (Platform.OS === 'web') {
      callbacks.onError?.('웹에서는 웨이크워드를 사용하지 않습니다.');
      return { started: false, keywordLabel: defaultWakeWordLabel, reason: 'unsupported-platform' };
    }

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      callbacks.onError?.('이 기기에서는 음성 인식 서비스를 사용할 수 없습니다.');
      shouldKeepListening = false;
      return { started: false, keywordLabel: defaultWakeWordLabel, reason: 'recognition-unavailable' };
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      callbacks.onError?.('음성 인식과 마이크 권한이 필요합니다.');
      shouldKeepListening = false;
      return { started: false, keywordLabel: defaultWakeWordLabel, reason: 'permission-denied' };
    }

    ensureSubscriptions();
    clearRestartTimer();

    if (isRecognitionActive) {
      return { started: true, keywordLabel: defaultWakeWordLabel };
    }

    await abortRecognitionIfNeeded();
    await beginRecognition();

    return { started: true, keywordLabel: defaultWakeWordLabel };
  })().finally(() => {
    pendingStartPromise = null;
  });

  return pendingStartPromise;
}

export async function stopWakeWordListening(options: StopWakeWordOptions = {}) {
  shouldKeepListening = false;
  isStopping = true;
  clearRestartTimer();

  if (!options.preserveCallbacks) {
    currentCallbacks = null;
  }

  try {
    await abortRecognitionIfNeeded();
  } finally {
    isRecognitionActive = false;
    isStopping = false;
  }
}

export async function destroyWakeWord() {
  await stopWakeWordListening();

  subscriptions.forEach((subscription) => subscription.remove());
  subscriptions = [];
  currentCallbacks = null;
}

import Voice from '@react-native-voice/voice';

let isWakeWordListening = false;
let isDetected = false;
let currentWakeName = '케어';
let currentOnDetected: (() => void | Promise<void>) | null = null;
let currentOnError: ((message: string) => void) | null = null;

type StartWakeWordListeningParams = {
  wakeName?: string;
  onDetected: () => void | Promise<void>;
  onError?: (message: string) => void;
};

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
    console.log('[WakeWord] restart listening');
  } catch (error) {
    console.log('[WakeWord] restart error:', error);
    currentOnError?.(String(error));
  }
}

function checkWakeWord(values?: string[]) {
  if (isDetected) {
    return;
  }

  const text = values?.join(' ') ?? '';
  const normalizedText = normalizeWakeText(text);
  const candidates = buildWakeCandidates(currentWakeName);

  console.log('[WakeWord] raw:', text);
  console.log('[WakeWord] normalized:', normalizedText);
  console.log('[WakeWord] candidates:', candidates);

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
  currentWakeName = wakeName || '케어';
  currentOnDetected = onDetected;
  currentOnError = onError ?? null;
  isDetected = false;

  if (isWakeWordListening) {
    console.log('[WakeWord] already listening');
    return;
  }

  Voice.removeAllListeners();

  Voice.onSpeechStart = () => {
    console.log('[WakeWord] speech start');
  };

  Voice.onSpeechPartialResults = (event) => {
    checkWakeWord(event.value);
  };

  Voice.onSpeechResults = (event) => {
    checkWakeWord(event.value);
  };

  Voice.onSpeechEnd = () => {
    console.log('[WakeWord] speech end');

    if (!isDetected && isWakeWordListening) {
      setTimeout(() => {
        void restartListening();
      }, 300);
    }
  };

  Voice.onSpeechError = (error) => {
    const message = JSON.stringify(error);
    console.log('[WakeWord] speech error:', error);
    currentOnError?.(message);

    if (!isDetected && isWakeWordListening) {
      setTimeout(() => {
        void restartListening();
      }, 700);
    }
  };

  try {
    isWakeWordListening = true;
    await Voice.start('ko-KR');
    console.log('[WakeWord] start:', currentWakeName);
  } catch (error) {
    isWakeWordListening = false;
    console.log('[WakeWord] start error:', error);
    currentOnError?.(String(error));
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
    isWakeWordListening = false;
    isDetected = false;
    currentOnDetected = null;
    currentOnError = null;
  }
}
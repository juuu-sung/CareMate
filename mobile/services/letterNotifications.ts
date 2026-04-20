import * as FileSystem from 'expo-file-system/legacy';

import { fetchLettersForElder, LetterItem } from '@/services/letters';

type SeenGuardianLetterState = Record<string, string>;

const LETTER_STATE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}caremate-letter-notification-state.json`
  : null;

function buildStateKey(elderUserId: string, linkCode: string) {
  return `${elderUserId}::${linkCode}`;
}

function getLatestGuardianLetter(letters: LetterItem[]) {
  return letters.find((letter) => letter.sender_role === 'guardian') ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readSeenGuardianLetterState(): Promise<SeenGuardianLetterState> {
  if (!LETTER_STATE_FILE_URI) {
    return {};
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(LETTER_STATE_FILE_URI);

    if (!fileInfo.exists) {
      return {};
    }

    const contents = await FileSystem.readAsStringAsync(LETTER_STATE_FILE_URI);
    const parsed = JSON.parse(contents);

    if (!isRecord(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<SeenGuardianLetterState>((acc, [key, value]) => {
      if (typeof value === 'string' && value) {
        acc[key] = value;
      }

      return acc;
    }, {});
  } catch {
    return {};
  }
}

async function writeSeenGuardianLetterState(state: SeenGuardianLetterState) {
  if (!LETTER_STATE_FILE_URI) {
    return;
  }

  await FileSystem.writeAsStringAsync(
    LETTER_STATE_FILE_URI,
    JSON.stringify(state)
  );
}

export async function primeGuardianLetterNotificationState(
  elderUserId: string,
  linkCode: string
) {
  const stateKey = buildStateKey(elderUserId, linkCode);
  const state = await readSeenGuardianLetterState();

  if (state[stateKey]) {
    return;
  }

  const response = await fetchLettersForElder(elderUserId, linkCode);
  const latestGuardianLetter = getLatestGuardianLetter(response.letters);

  if (!latestGuardianLetter) {
    return;
  }

  state[stateKey] = latestGuardianLetter.created_at;
  await writeSeenGuardianLetterState(state);
}

export async function checkForNewGuardianLetter(
  elderUserId: string,
  linkCode: string
) {
  const response = await fetchLettersForElder(elderUserId, linkCode);
  const latestGuardianLetter = getLatestGuardianLetter(response.letters);

  if (!latestGuardianLetter) {
    return null;
  }

  const stateKey = buildStateKey(elderUserId, linkCode);
  const state = await readSeenGuardianLetterState();
  const seenCreatedAt = state[stateKey];

  if (!seenCreatedAt) {
    state[stateKey] = latestGuardianLetter.created_at;
    await writeSeenGuardianLetterState(state);
    return null;
  }

  if (
    new Date(latestGuardianLetter.created_at).getTime() <=
    new Date(seenCreatedAt).getTime()
  ) {
    return null;
  }

  state[stateKey] = latestGuardianLetter.created_at;
  await writeSeenGuardianLetterState(state);
  return latestGuardianLetter;
}

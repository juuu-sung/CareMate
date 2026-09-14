import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

export type ParentAuthSession = {
  role: 'parent';
  parentId: string;
  elderUserId: string;
  parentName: string;
  accessToken: string;
  linkCode: string;
  guardianPhone: string;
  agentName: string;
  agentVoice: string;
};

export type GuardianAuthSession = {
  role: 'guardian';
  guardianId: string;
  parentId: string;
  parentName: string;
  parentAge: string;
  parentGender: string;
  linkId: string;
  /** @deprecated 화면 전환 호환용 비밀값이 아닌 연결 ID */
  linkCode: string;
  accessToken: string;
  medications: string;
  diseases: string;
  allergies: string;
  hospital: string;
  doctorContact: string;
  memo: string;
};

export type AuthSession = ParentAuthSession | GuardianAuthSession;

const SESSION_STORAGE_KEY = 'caremate-auth-session-v2';
const LEGACY_SESSION_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}caremate-auth-session.json`
  : null;

type AuthSessionListener = (session: AuthSession | null) => void;

const authSessionListeners = new Set<AuthSessionListener>();

function emitAuthSessionChange(session: AuthSession | null) {
  authSessionListeners.forEach((listener) => {
    try {
      listener(session);
    } catch (error) {
      console.log('auth session listener error:', error);
    }
  });
}

export function subscribeAuthSession(listener: AuthSessionListener) {
  authSessionListeners.add(listener);

  return () => {
    authSessionListeners.delete(listener);
  };
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseAuthSession(value: unknown): AuthSession | null {
  if (!isRecord(value) || typeof value.role !== 'string') {
    return null;
  }

  if (value.role === 'parent') {
    const parentId = normalizeString(value.parentId);
    const elderUserId = normalizeString(value.elderUserId) || parentId;
    const parentName = normalizeString(value.parentName);
    const accessToken = normalizeString(value.accessToken);
    const linkCode = normalizeString(value.linkCode);
    const agentName =
      normalizeString(value.agentName) || normalizeString(value.agent_name);
    const agentVoice =
      normalizeString(value.agentVoice) || normalizeString(value.agent_voice);

    if (!parentId || !parentName || !linkCode || !accessToken) {
      return null;
    }

    return {
      role: 'parent',
      parentId,
      elderUserId,
      parentName,
      accessToken,
      linkCode,
      guardianPhone: normalizeString(value.guardianPhone),
      agentName: agentName || '케어',
      agentVoice,
    };
  }

  if (value.role === 'guardian') {
    const guardianId =
      normalizeString(value.guardianId) || normalizeString(value.guardian_id);
    const parentId = normalizeString(value.parentId);
    const parentName = normalizeString(value.parentName);
    const linkId = normalizeString(value.linkId) || normalizeString(value.linkCode);
    const accessToken = normalizeString(value.accessToken);

    if (!guardianId || !parentId || !parentName || !linkId || !accessToken) {
      return null;
    }

    return {
      role: 'guardian',
      guardianId,
      parentId,
      parentName,
      parentAge: normalizeString(value.parentAge),
      parentGender: normalizeString(value.parentGender),
      linkId,
      linkCode: linkId,
      accessToken,
      medications: normalizeString(value.medications),
      diseases: normalizeString(value.diseases),
      allergies: normalizeString(value.allergies),
      hospital: normalizeString(value.hospital),
      doctorContact: normalizeString(value.doctorContact),
      memo: normalizeString(value.memo),
    };
  }

  return null;
}

export function buildParentAuthSession(input: {
  parentId: string;
  elderUserId?: string;
  parentName: string;
  accessToken?: string;
  linkCode: string;
  guardianPhone?: string;
  agentName?: string;
  agentVoice?: string;
}): ParentAuthSession {
  return {
    role: 'parent',
    parentId: input.parentId,
    elderUserId: input.elderUserId || input.parentId,
    parentName: input.parentName,
    accessToken: input.accessToken || '',
    linkCode: input.linkCode,
    guardianPhone: input.guardianPhone || '',
    agentName: input.agentName?.trim() || '케어',
    agentVoice: input.agentVoice?.trim() || '',
  };
}

export function buildGuardianAuthSession(input: {
  guardianId?: string;
  parentId: string;
  parentName: string;
  parentAge?: string;
  parentGender?: string;
  linkId: string;
  accessToken?: string;
  medications?: string;
  diseases?: string;
  allergies?: string;
  hospital?: string;
  doctorContact?: string;
  memo?: string;
}): GuardianAuthSession {
  return {
    role: 'guardian',
    guardianId: input.guardianId || '',
    parentId: input.parentId,
    parentName: input.parentName,
    parentAge: input.parentAge || '',
    parentGender: input.parentGender || '',
    linkId: input.linkId,
    linkCode: input.linkId,
    accessToken: input.accessToken || '',
    medications: input.medications || '',
    diseases: input.diseases || '',
    allergies: input.allergies || '',
    hospital: input.hospital || '',
    doctorContact: input.doctorContact || '',
    memo: input.memo || '',
  };
}

export function getAuthSessionHomeRoute(session: AuthSession) {
  if (session.role === 'parent') {
    return {
      pathname: '/home' as const,
      params: {
        parentId: session.parentId,
        elderUserId: session.elderUserId,
        parentName: session.parentName,
        linkCode: session.linkCode,
        guardianPhone: session.guardianPhone,
        agentName: session.agentName,
        agent_name: session.agentName,
        selectedVoice: session.agentVoice,
        agentVoice: session.agentVoice,
        agent_voice: session.agentVoice,
      },
    };
  }

  return {
    pathname: '/guardian-home' as const,
    params: {
      parentId: session.parentId,
      parentName: session.parentName,
      parentAge: session.parentAge,
      parentGender: session.parentGender,
      linkCode: session.linkCode,
      medications: session.medications,
      diseases: session.diseases,
      allergies: session.allergies,
      hospital: session.hospital,
      doctorContact: session.doctorContact,
      memo: session.memo,
    },
  };
}

function isSamePrincipal(existing: AuthSession, next: AuthSession) {
  if (existing.role !== next.role) {
    return false;
  }

  if (existing.role === 'parent' && next.role === 'parent') {
    return existing.elderUserId === next.elderUserId;
  }

  if (existing.role === 'guardian' && next.role === 'guardian') {
    return (
      existing.guardianId === next.guardianId &&
      existing.linkId === next.linkId
    );
  }

  return false;
}

export async function saveAuthSession(session: AuthSession) {
  let sessionToSave = session;
  if (!session.accessToken) {
    const existingSession = await loadAuthSession();
    if (existingSession && isSamePrincipal(existingSession, session)) {
      sessionToSave = {
        ...session,
        accessToken: existingSession.accessToken,
      } as AuthSession;
    }
  }

  const persistedSession = sessionToSave.role === 'guardian'
    ? {
        ...sessionToSave,
        medications: '',
        diseases: '',
        allergies: '',
        hospital: '',
        doctorContact: '',
        memo: '',
      }
    : sessionToSave;

  await SecureStore.setItemAsync(SESSION_STORAGE_KEY, JSON.stringify(persistedSession));
  await deleteLegacySessionFile();
  emitAuthSessionChange(sessionToSave);
}

export async function loadAuthSession() {
  try {
    const contents = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
    if (contents) {
      await deleteLegacySessionFile();
      return parseAuthSession(JSON.parse(contents));
    }

    if (!LEGACY_SESSION_FILE_URI) {
      return null;
    }

    const legacyInfo = await FileSystem.getInfoAsync(LEGACY_SESSION_FILE_URI);
    if (!legacyInfo.exists) {
      return null;
    }

    const legacyContents = await FileSystem.readAsStringAsync(LEGACY_SESSION_FILE_URI);
    const legacySession = parseAuthSession(JSON.parse(legacyContents));
    if (legacySession?.role === 'parent') {
      await SecureStore.setItemAsync(SESSION_STORAGE_KEY, JSON.stringify(legacySession));
    }
    await deleteLegacySessionFile();
    return legacySession;
  } catch {
    return null;
  }
}

export async function clearAuthSession() {
  await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
  await deleteLegacySessionFile();
  emitAuthSessionChange(null);
}

async function deleteLegacySessionFile() {
  if (!LEGACY_SESSION_FILE_URI) {
    return;
  }

  try {
    const info = await FileSystem.getInfoAsync(LEGACY_SESSION_FILE_URI);
    if (info.exists) {
      await FileSystem.deleteAsync(LEGACY_SESSION_FILE_URI, { idempotent: true });
    }
  } catch {
    // SecureStore remains authoritative even if best-effort legacy cleanup fails.
  }
}

export async function getGuardianAccessToken() {
  const session = await loadAuthSession();
  return session?.role === 'guardian' ? session.accessToken : '';
}

export async function getAccessToken() {
  const session = await loadAuthSession();
  return session?.accessToken || '';
}

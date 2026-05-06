import * as FileSystem from 'expo-file-system/legacy';

export type ParentAuthSession = {
  role: 'parent';
  parentId: string;
  elderUserId: string;
  parentName: string;
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
  linkCode: string;
  medications: string;
  diseases: string;
  allergies: string;
  hospital: string;
  doctorContact: string;
  memo: string;
};

export type AuthSession = ParentAuthSession | GuardianAuthSession;

const SESSION_FILE_URI = FileSystem.documentDirectory
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
    const linkCode = normalizeString(value.linkCode);
    const agentName =
      normalizeString(value.agentName) || normalizeString(value.agent_name);
    const agentVoice =
      normalizeString(value.agentVoice) || normalizeString(value.agent_voice);

    if (!parentId || !parentName || !linkCode) {
      return null;
    }

    return {
      role: 'parent',
      parentId,
      elderUserId,
      parentName,
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
    const linkCode = normalizeString(value.linkCode);

    if (!parentId || !parentName || !linkCode) {
      return null;
    }

    return {
      role: 'guardian',
      guardianId,
      parentId,
      parentName,
      parentAge: normalizeString(value.parentAge),
      parentGender: normalizeString(value.parentGender),
      linkCode,
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
  linkCode: string;
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
    linkCode: input.linkCode,
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

export async function saveAuthSession(session: AuthSession) {
  if (!SESSION_FILE_URI) {
    emitAuthSessionChange(session);
    return;
  }

  await FileSystem.writeAsStringAsync(
    SESSION_FILE_URI,
    JSON.stringify(session)
  );
  emitAuthSessionChange(session);
}

export async function loadAuthSession() {
  if (!SESSION_FILE_URI) {
    return null;
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(SESSION_FILE_URI);

    if (!fileInfo.exists) {
      return null;
    }

    const contents = await FileSystem.readAsStringAsync(SESSION_FILE_URI);
    return parseAuthSession(JSON.parse(contents));
  } catch {
    return null;
  }
}

export async function clearAuthSession() {
  if (!SESSION_FILE_URI) {
    emitAuthSessionChange(null);
    return;
  }

  const fileInfo = await FileSystem.getInfoAsync(SESSION_FILE_URI);

  if (!fileInfo.exists) {
    emitAuthSessionChange(null);
    return;
  }

  await FileSystem.deleteAsync(SESSION_FILE_URI);
  emitAuthSessionChange(null);
}

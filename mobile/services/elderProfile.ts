import { buildAuthHeaders } from '@/services/api';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export type ElderProfileResponse = {
  elder_user_id: string;
  agent_voice?: string | null;
  agent_name?: string | null;

  medications?: string | null;
  allergies?: string | null;
  diseases?: string | null;
};

function assertApiBaseUrl() {
  if (!API_BASE_URL) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL이 설정되지 않았습니다.');
  }
}

export async function getElderProfileByUserId(
  elderUserId: string
): Promise<ElderProfileResponse | null> {
  assertApiBaseUrl();

  const cleanedElderUserId = String(elderUserId || '').trim();

  if (!cleanedElderUserId) {
    throw new Error('elderUserId가 비어 있습니다.');
  }

  const query = new URLSearchParams({
    elder_user_id: cleanedElderUserId,
  });

  const url = `${API_BASE_URL}/elder-profile/agent?${query.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: await buildAuthHeaders({
      Accept: 'application/json',
    }),
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`elder profile 조회 실패: ${response.status} ${text}`);
  }

  return response.json();
}

export type UpdateAgentProfileRequest = {
  elder_user_id: string;

  agent_name?: string | null;
  agent_voice?: string | null;

  medications?: string | null;
  allergies?: string | null;
  diseases?: string | null;
};

export async function updateAgentProfile(
  request: UpdateAgentProfileRequest
): Promise<ElderProfileResponse> {
  assertApiBaseUrl();

  const cleanedRequest: UpdateAgentProfileRequest = {
    ...request,
    elder_user_id: String(request.elder_user_id || '').trim(),
  };

  if (!cleanedRequest.elder_user_id) {
    throw new Error('elder_user_id가 비어 있습니다.');
  }

  const response = await fetch(`${API_BASE_URL}/elder-profile/agent`, {
    method: 'PATCH',
    headers: await buildAuthHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(cleanedRequest),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`elder profile 수정 실패: ${response.status} ${text}`);
  }

  return response.json();
}

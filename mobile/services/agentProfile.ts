const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export type ElderAgentProfile = {
  agent_name: string;
  selected_voice?: string | null;
};

export async function fetchElderAgentProfile(
  elderUserId: string
): Promise<ElderAgentProfile> {
  if (!elderUserId) {
    return {
      agent_name: '케어',
      selected_voice: null,
    };
  }

  const response = await fetch(
    `${API_BASE_URL}/elder-profiles/${elderUserId}/agent`
  );

  if (!response.ok) {
    throw new Error('에이전트 정보를 불러오지 못했습니다.');
  }

  return response.json();
}

export async function updateElderAgentProfile({
  elderUserId,
  agentName,
  selectedVoice,
}: {
  elderUserId: string;
  agentName: string;
  selectedVoice?: string;
}) {
  const response = await fetch(
    `${API_BASE_URL}/elder-profiles/${elderUserId}/agent`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_name: agentName,
        selected_voice: selectedVoice ?? null,
      }),
    }
  );

  if (!response.ok) {
    throw new Error('에이전트 정보를 저장하지 못했습니다.');
  }

  return response.json();
}
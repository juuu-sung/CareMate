const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export type SendLetterPayload = {
  elderUserId: string;
  linkCode: string;
  content: string;
};

export async function sendLetterFromGuardian(payload: SendLetterPayload) {
  const response = await fetch(`${API_BASE_URL}/letters/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      elder_user_id: payload.elderUserId,
      link_code: payload.linkCode,
      content: payload.content,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.detail || '편지 저장에 실패했습니다.');
  }

  return data;
}

export async function fetchLettersForElder(elderUserId: string, linkCode: string) {
  const response = await fetch(
    `${API_BASE_URL}/letters/elder/${elderUserId}?link_code=${encodeURIComponent(linkCode)}`
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.detail || '편지 조회에 실패했습니다.');
  }

  return data;
}
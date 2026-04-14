const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export async function fetchGuardianContact(linkCode: string) {
  const url = `${API_BASE_URL}/guardian-link/guardian-contact?link_code=${encodeURIComponent(linkCode)}`;

  console.log('fetchGuardianContact url:', url);

  const response = await fetch(url);

  console.log('fetchGuardianContact status:', response.status);

  const text = await response.text();

  console.log('fetchGuardianContact raw text:', text);

  if (!response.ok) {
    throw new Error(text || '보호자 연락처 조회 실패');
  }

  return JSON.parse(text);
}
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export type HeartRateLatestResponse = {
  elder_user_id: string;
  heart_rate: number | null;
  measured_at: string | null;
  source: string | null;
  status: string;
  message: string;
};

export type HeartRateHistoryItem = {
  heart_rate: number;
  measured_at: string;
  source: string | null;
};

export type HeartRateHistoryResponse = {
  elder_user_id: string;
  hours: number;
  items: HeartRateHistoryItem[];
};

export async function getLatestHeartRate(
  elderUserId: string
): Promise<HeartRateLatestResponse> {
  const query = new URLSearchParams({
    elder_user_id: elderUserId,
  });

  const response = await fetch(
    `${API_BASE_URL}/guardian-health/latest?${query.toString()}`
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`최신 심박수 조회 실패: ${response.status} ${text}`);
  }

  return response.json();
}

export async function getHeartRateHistory(
  elderUserId: string,
  hours: number = 1
): Promise<HeartRateHistoryResponse> {
  const query = new URLSearchParams({
    elder_user_id: elderUserId,
    hours: String(hours),
  });

  const response = await fetch(
    `${API_BASE_URL}/guardian-health/history?${query.toString()}`
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`심박수 기록 조회 실패: ${response.status} ${text}`);
  }

  return response.json();
}

export async function postHeartRate(input: {
  elder_user_id: string;
  heart_rate: number;
  measured_at: string;
  source?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/guardian-health/heart-rate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      elder_user_id: input.elder_user_id,
      heart_rate: input.heart_rate,
      measured_at: input.measured_at,
      source: input.source ?? "Apple Watch",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`심박수 저장 실패: ${response.status} ${text}`);
  }

  return response.json();
}
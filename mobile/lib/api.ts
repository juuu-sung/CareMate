const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.log('API error response:', JSON.stringify(data, null, 2));
    throw new Error(
      typeof (data as any)?.detail === 'string'
        ? (data as any).detail
        : JSON.stringify((data as any)?.detail || data)
    );
  }

  return data as T;
}

export type ParentSignupPayload = {
  name: string;
  birth: string;
  gender: string;
  address: string;
  phone: string;
};

export type ParentSignupResponse = {
  parent_id: string;
  parent_name: string;
  link_code: string;
  message?: string;
};

export async function parentSignup(payload: ParentSignupPayload): Promise<ParentSignupResponse> {
  return request<ParentSignupResponse>('/parents/signup', {
    method: 'POST',
    body: payload,
  });
}

export type ParentByCodeResponse = {
  parent_id: string;
  parent_name: string;
  parent_age?: number;
  parent_gender?: string;
  link_code: string;
  is_used: boolean;
};

export async function getParentByCode(linkCode: string): Promise<ParentByCodeResponse> {
  return request<ParentByCodeResponse>(`/parents/by-code/${linkCode}`, {
    method: 'GET',
  });
}

export type GuardianSignupPayload = {
  name: string;
  birth: string;
  phone: string;
  link_code: string;
  relation?: string;
  gender?: string;
};

export type GuardianSignupResponse = {
  guardian_id?: string;
  elder_id?: string;
  elder_name?: string;
  parent_id?: string;
  parent_name?: string;
  link_code: string;
  message?: string;
};

export async function guardianSignup(
  payload: GuardianSignupPayload
): Promise<GuardianSignupResponse> {
  return request<GuardianSignupResponse>('/guardians/signup', {
    method: 'POST',
    body: payload,
  });
}

export type ParentCareInfoPayload = {
  address?: string;
  medications: string;
  diseases: string;
  allergies: string;
  hospital: string;
  doctor_contact: string;
  memo: string;
};

export async function updateParentCareInfo(
  parentId: string,
  payload: ParentCareInfoPayload
) {
  return request(`/parents/${parentId}/care-info`, {
    method: 'PUT',
    body: payload,
  });
}

export async function sendLocationToServer(payload: {
  elder_user_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  battery?: number | null;
}) {
  return request('/locations', {
    method: 'POST',
    body: payload,
  });
}

export async function getLatestLocation(elderUserId: string) {
  return request(`/locations/${elderUserId}`, {
    method: 'GET',
  });
}
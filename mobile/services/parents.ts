import { apiGet, apiPost, apiPut } from '@/services/api';

export type ParentSignupPayload = {
  name: string;
  birth: string;
  gender: string;
  address: string;
  phone: string;
};

export type ParentLoginPayload = {
  phone: string;
  birth: string;
};

export type ParentSignupResponse = {
  parent_id: string;
  parent_name: string;
  link_code: string;
  message?: string;
};

export type ParentLoginResponse = {
  parent_id: string;
  parent_name: string;
  link_code: string;
  guardian_phone: string;
  message?: string;
};

export type ParentByCodeResponse = {
  parent_id: string;
  parent_name: string;
  parent_age?: number;
  parent_gender?: string;
  link_code: string;
  is_used: boolean;
};

export type ParentCareInfoPayload = {
  address?: string;
  medications: string;
  diseases: string;
  allergies: string;
  hospital: string;
  doctor_contact: string;
  memo: string;
};

export type ParentCareInfoWithImagesResponse = {
  message: string;
  medications: string;
  diseases: string;
  allergies: string;
  hospital: string;
  doctor_contact: string;
  memo: string;
};

export function parentSignup(payload: ParentSignupPayload) {
  return apiPost<ParentSignupResponse>('/parents/signup', payload);
}

export function parentLogin(payload: ParentLoginPayload) {
  return apiPost<ParentLoginResponse>('/parents/login', payload);
}

export function getParentByCode(linkCode: string) {
  return apiGet<ParentByCodeResponse>(`/parents/by-code/${linkCode}`);
}

export function updateParentCareInfo(
  parentId: string,
  payload: ParentCareInfoPayload
) {
  return apiPut(`/parents/${parentId}/care-info`, payload);
}

export async function updateParentCareInfoWithImages(
  parentId: string,
  formData: FormData
): Promise<ParentCareInfoWithImagesResponse> {
  const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

  if (!BASE_URL) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL이 설정되지 않았습니다.');
  }

  const response = await fetch(
    `${BASE_URL}/parents/${parentId}/care-info-with-images`,
    {
      method: 'PUT',
      body: formData,
    }
  );

  const text = await response.text();

  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    throw new Error(
      data.detail || data.message || '건강정보 저장에 실패했습니다.'
    );
  }

  return data;
}
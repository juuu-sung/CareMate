import { apiGet, apiPost, apiPut } from "@/services/api";

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

export function parentSignup(payload: ParentSignupPayload) {
  return apiPost<ParentSignupResponse>("/parents/signup", payload);
}

export function parentLogin(payload: ParentLoginPayload) {
  return apiPost<ParentLoginResponse>("/parents/login", payload);
}

export function getParentByCode(linkCode: string) {
  return apiGet<ParentByCodeResponse>(`/parents/by-code/${linkCode}`);
}

export function updateParentCareInfo(parentId: string, payload: ParentCareInfoPayload) {
  return apiPut(`/parents/${parentId}/care-info`, payload);
}

import { apiGet, apiPost } from "@/services/api";
import { CareMode } from "@/types/care";
import { GuardianDashboard } from "@/types/guardian";

export type GuardianAlertItem = {
  type: string;
  message: string;
  created_at: string;
};

export type GuardianConversationItem = {
  role: "user" | "assistant";
  content: string;
  mode: CareMode;
  created_at: string;
};

type GuardianAlertsResponse = {
  items: GuardianAlertItem[];
};

type GuardianConversationsResponse = {
  items: GuardianConversationItem[];
};

export function getGuardianDashboard(elderUserId: string, linkCode: string) {
  const searchParams = new URLSearchParams({
    elder_user_id: elderUserId,
    link_code: linkCode,
  });

  return apiGet<GuardianDashboard>(`/guardians/dashboard?${searchParams.toString()}`);
}

export function getGuardianAlerts(elderUserId: string, linkCode: string, limit = 3) {
  const searchParams = new URLSearchParams({
    elder_user_id: elderUserId,
    link_code: linkCode,
    limit: String(limit),
  });

  return apiGet<GuardianAlertsResponse>(`/guardians/alerts?${searchParams.toString()}`);
}

export function getGuardianConversations(elderUserId: string, linkCode: string, limit = 30) {
  const searchParams = new URLSearchParams({
    elder_user_id: elderUserId,
    link_code: linkCode,
    limit: String(limit),
  });

  return apiGet<GuardianConversationsResponse>(
    `/guardians/conversations?${searchParams.toString()}`
  );
}

export type GuardianSignupPayload = {
  name: string;
  birth: string;
  phone: string;
  link_code: string;
  relation?: string;
  gender?: string;
};

export type GuardianLoginPayload = {
  phone: string;
  birth: string;
};

export type GuardianSignupResponse = {
  guardian_id?: string;
  elder_id?: string;
  elder_name?: string;
  parent_id?: string;
  parent_name?: string;
  link_code?: string;
  message?: string;
};

export type GuardianLoginResponse = {
  guardian_id: string;
  guardian_name: string;
  parent_id: string;
  parent_name: string;
  parent_age?: number | null;
  parent_gender?: string | null;
  link_code: string;
  medications: string;
  diseases: string;
  allergies: string;
  hospital: string;
  doctor_contact: string;
  memo: string;
  message?: string;
};

export function guardianSignup(payload: GuardianSignupPayload) {
  return apiPost<GuardianSignupResponse>("/guardians/signup", payload);
}

export function guardianLogin(payload: GuardianLoginPayload) {
  return apiPost<GuardianLoginResponse>("/guardians/login", payload);
}

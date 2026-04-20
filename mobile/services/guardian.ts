import { apiDelete, apiGet, apiPatch, apiPost } from "@/services/api";
import { CareMode } from "@/types/care";
import {
  GuardianDashboard,
  GuardianScheduleItem,
  GuardianScheduleStatus,
} from "@/types/guardian";

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

export type GuardianSchedulePayload = {
  title: string;
  date: string;
  time: string;
  description?: string;
  status?: GuardianScheduleStatus;
  type?: string;
};

type GuardianAlertsResponse = {
  items: GuardianAlertItem[];
};

type GuardianConversationsResponse = {
  items: GuardianConversationItem[];
};

type GuardianSchedulesResponse = {
  items: GuardianScheduleItem[];
};

type GuardianScheduleDeleteResponse = {
  success: boolean;
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

export function getGuardianSchedules(elderUserId: string, linkCode: string) {
  const searchParams = new URLSearchParams({
    elder_user_id: elderUserId,
    link_code: linkCode,
  });

  return apiGet<GuardianSchedulesResponse>(`/guardians/schedules?${searchParams.toString()}`);
}

export function createGuardianSchedule(
  elderUserId: string,
  linkCode: string,
  payload: GuardianSchedulePayload
) {
  const searchParams = new URLSearchParams({
    elder_user_id: elderUserId,
    link_code: linkCode,
  });

  return apiPost<GuardianScheduleItem>(
    `/guardians/schedules?${searchParams.toString()}`,
    payload
  );
}

export function updateGuardianSchedule(
  elderUserId: string,
  linkCode: string,
  scheduleId: string,
  payload: Partial<GuardianSchedulePayload>
) {
  const searchParams = new URLSearchParams({
    elder_user_id: elderUserId,
    link_code: linkCode,
  });

  return apiPatch<GuardianScheduleItem>(
    `/guardians/schedules/${scheduleId}?${searchParams.toString()}`,
    payload
  );
}

export function deleteGuardianSchedule(
  elderUserId: string,
  linkCode: string,
  scheduleId: string
) {
  const searchParams = new URLSearchParams({
    elder_user_id: elderUserId,
    link_code: linkCode,
  });

  return apiDelete<GuardianScheduleDeleteResponse>(
    `/guardians/schedules/${scheduleId}?${searchParams.toString()}`
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

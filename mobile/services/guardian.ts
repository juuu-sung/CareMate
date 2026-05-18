import { apiDelete, apiGet, apiPatch, apiPost } from "@/services/api";
import { CareMode } from "@/types/care";
import {
  GuardianDashboard,
  GuardianScheduleItem,
  GuardianScheduleStatus,
} from "@/types/guardian";

export type GuardianAlertItem = {
  id: string;
  type: string;
  severity: string;
  status: "open" | "acknowledged" | "resolved";
  message: string;
  created_at: string;
};

export type GuardianConversationItem = {
  role: "user" | "assistant";
  content: string;
  mode: CareMode;
  created_at: string;
};

export type GuardianConversationDay = {
  date_key: string;
  headline: string;
  summary: string;
  topics: string[];
  message_count: number;
  started_at: string;
  ended_at: string;
  attention_needed: boolean;
  attention_reason: string;
  items: GuardianConversationItem[];
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
  days: GuardianConversationDay[];
};

type GuardianSchedulesResponse = {
  items: GuardianScheduleItem[];
};

type GuardianScheduleDeleteResponse = {
  success: boolean;
};

export type GuardianSafetyZoneStatus = "unknown" | "inside" | "outside";

export type GuardianSafetyZoneItem = {
  id: string;
  senior_user_id: string;
  label: string;
  address: string;
  center_latitude: number;
  center_longitude: number;
  radius_meters: number;
  enabled: boolean;
  last_status: GuardianSafetyZoneStatus;
  last_checked_at: string | null;
  last_exit_alert_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GuardianSafetyZonePayload = {
  label: string;
  address?: string;
  center_latitude: number;
  center_longitude: number;
  radius_meters: number;
  enabled?: boolean;
};

type GuardianSafetyZonesResponse = {
  items: GuardianSafetyZoneItem[];
};

type GuardianSafetyZoneDeleteResponse = {
  success: boolean;
};

function buildGuardianQuery(elderUserId: string, linkCode: string) {
  return new URLSearchParams({
    elder_user_id: elderUserId,
    link_code: linkCode,
  });
}

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

export function getGuardianAlertHistory(
  elderUserId: string,
  linkCode: string,
  limit = 120
) {
  const searchParams = new URLSearchParams({
    elder_user_id: elderUserId,
    link_code: linkCode,
    limit: String(limit),
  });

  return apiGet<GuardianAlertsResponse>(
    `/guardians/alert-history?${searchParams.toString()}`
  );
}

export function updateGuardianAlertStatus(
  elderUserId: string,
  linkCode: string,
  alertId: string | undefined,
  alert: Pick<GuardianAlertItem, "type" | "message" | "created_at">,
  status: "acknowledged" | "resolved"
) {
  const searchParams = new URLSearchParams({
    elder_user_id: elderUserId,
    link_code: linkCode,
  });

  return apiPatch<GuardianAlertItem>(
    `/guardians/alerts/${alertId || "undefined"}?${searchParams.toString()}`,
    {
      status,
      type: alert.type,
      message: alert.message,
      created_at: alert.created_at,
    }
  );
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

export function getGuardianSafetyZones(elderUserId: string, linkCode: string) {
  const searchParams = buildGuardianQuery(elderUserId, linkCode);

  return apiGet<GuardianSafetyZonesResponse>(
    `/guardians/safety-zones?${searchParams.toString()}`
  );
}

export function createGuardianSafetyZone(
  elderUserId: string,
  linkCode: string,
  payload: GuardianSafetyZonePayload
) {
  const searchParams = buildGuardianQuery(elderUserId, linkCode);

  return apiPost<GuardianSafetyZoneItem>(
    `/guardians/safety-zones?${searchParams.toString()}`,
    payload
  );
}

export function updateGuardianSafetyZone(
  elderUserId: string,
  linkCode: string,
  zoneId: string,
  payload: Partial<GuardianSafetyZonePayload>
) {
  const searchParams = buildGuardianQuery(elderUserId, linkCode);

  return apiPatch<GuardianSafetyZoneItem>(
    `/guardians/safety-zones/${zoneId}?${searchParams.toString()}`,
    payload
  );
}

export function deleteGuardianSafetyZone(
  elderUserId: string,
  linkCode: string,
  zoneId: string
) {
  const searchParams = buildGuardianQuery(elderUserId, linkCode);

  return apiDelete<GuardianSafetyZoneDeleteResponse>(
    `/guardians/safety-zones/${zoneId}?${searchParams.toString()}`
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

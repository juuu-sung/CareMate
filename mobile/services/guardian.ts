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

export type DailyHealthItem = {
  date: string;
  cognitive_score: number | null;
  cognitive_wav_score: number | null;
  cognitive_text_score: number | null;
  depression_score: number | null;
  insomnia_score: number | null;
  utterance_count: number;
  text_analysis_count: number;
  has_data: boolean;
};

export type DailyHealthAnalysisResponse = {
  elder_user_id: string;
  start_date: string;
  end_date: string;
  items: DailyHealthItem[];
};

export function getGuardianDashboard(_elderUserId: string, _linkId: string) {
  return apiGet<GuardianDashboard>('/guardians/dashboard');
}

export function getGuardianAlerts(_elderUserId: string, _linkId: string, limit = 3) {
  const searchParams = new URLSearchParams({
    limit: String(limit),
  });

  return apiGet<GuardianAlertsResponse>(`/guardians/alerts?${searchParams.toString()}`);
}

export function getGuardianAlertHistory(
  _elderUserId: string,
  _linkId: string,
  limit = 120
) {
  const searchParams = new URLSearchParams({
    limit: String(limit),
  });

  return apiGet<GuardianAlertsResponse>(
    `/guardians/alert-history?${searchParams.toString()}`
  );
}

export function updateGuardianAlertStatus(
  _elderUserId: string,
  _linkId: string,
  alertId: string | undefined,
  alert: Pick<GuardianAlertItem, "type" | "message" | "created_at">,
  status: "acknowledged" | "resolved"
) {
  return apiPatch<GuardianAlertItem>(
    `/guardians/alerts/${alertId || "undefined"}`,
    {
      status,
      type: alert.type,
      message: alert.message,
      created_at: alert.created_at,
    }
  );
}

export function getGuardianConversations(_elderUserId: string, _linkId: string, limit = 30) {
  const searchParams = new URLSearchParams({
    limit: String(limit),
  });

  return apiGet<GuardianConversationsResponse>(
    `/guardians/conversations?${searchParams.toString()}`
  );
}

export function getGuardianSchedules(_elderUserId: string, _linkId: string) {
  return apiGet<GuardianSchedulesResponse>('/guardians/schedules');
}

export function createGuardianSchedule(
  _elderUserId: string,
  _linkId: string,
  payload: GuardianSchedulePayload
) {
  return apiPost<GuardianScheduleItem>('/guardians/schedules', payload);
}

export function updateGuardianSchedule(
  _elderUserId: string,
  _linkId: string,
  scheduleId: string,
  payload: Partial<GuardianSchedulePayload>
) {
  return apiPatch<GuardianScheduleItem>(
    `/guardians/schedules/${scheduleId}`,
    payload
  );
}

export function deleteGuardianSchedule(
  _elderUserId: string,
  _linkId: string,
  scheduleId: string
) {
  return apiDelete<GuardianScheduleDeleteResponse>(`/guardians/schedules/${scheduleId}`);
}

export function getGuardianSafetyZones(_elderUserId: string, _linkId: string) {
  return apiGet<GuardianSafetyZonesResponse>('/guardians/safety-zones');
}

export function createGuardianSafetyZone(
  _elderUserId: string,
  _linkId: string,
  payload: GuardianSafetyZonePayload
) {
  return apiPost<GuardianSafetyZoneItem>('/guardians/safety-zones', payload);
}

export function updateGuardianSafetyZone(
  _elderUserId: string,
  _linkId: string,
  zoneId: string,
  payload: Partial<GuardianSafetyZonePayload>
) {
  return apiPatch<GuardianSafetyZoneItem>(
    `/guardians/safety-zones/${zoneId}`,
    payload
  );
}

export function deleteGuardianSafetyZone(
  _elderUserId: string,
  _linkId: string,
  zoneId: string
) {
  return apiDelete<GuardianSafetyZoneDeleteResponse>(`/guardians/safety-zones/${zoneId}`);
}

export type GuardianSignupPayload = {
  name: string;
  birth: string;
  phone: string;
  password: string;
  link_code: string;
  relation?: string;
  gender?: string;
};

export type GuardianLoginPayload = {
  phone: string;
  birth: string;
  password: string;
  link_code?: string;
};

export type GuardianSignupResponse = {
  guardian_id: string;
  guardian_name: string;
  parent_id: string;
  parent_name: string;
  parent_age?: number | null;
  parent_gender?: string | null;
  link_id: string;
  access_token: string;
  token_type: 'bearer';
  expires_at: string;
  message?: string;
};

export type GuardianLoginResponse = {
  guardian_id: string;
  guardian_name: string;
  parent_id: string;
  parent_name: string;
  parent_age?: number | null;
  parent_gender?: string | null;
  link_id: string;
  access_token: string;
  token_type: 'bearer';
  expires_at: string;
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

export function guardianLogout() {
  return apiPost<void>("/guardians/logout", {});
}

export type UtteranceHealthItem = {
  id: string;
  recorded_at: string | null;
  session_id: string | null;
  depression_score: number | null;
  insomnia_score: number | null;
  cognitive_score: number | null;
  cognitive_text_score: number | null;
  transcript_preview: string | null;
};

export type UtteranceHealthAnalysisResponse = {
  elder_user_id: string;
  items: UtteranceHealthItem[];
};

export function getUtteranceHealthAnalysis(
  elderUserId: string,
  _linkId: string,
  limit = 40,
) {
  const searchParams = new URLSearchParams({
    limit: String(limit),
  });
  return apiGet<UtteranceHealthAnalysisResponse>(
    `/guardians/elders/${elderUserId}/health-analysis/utterances?${searchParams.toString()}`
  );
}

export function getHealthExplanation(params: {
  metric: 'depression' | 'insomnia' | 'cognitive';
  items: Array<{ date: string; value: number }>;
  elderName: string;
}) {
  return apiPost<{ explanation: string }>('/guardians/health-explain', {
    metric: params.metric,
    items: params.items,
    elder_name: params.elderName,
  });
}

export function getDailyHealthAnalysis(
  elderUserId: string,
  _linkId: string,
  startDate: string,
  endDate: string,
) {
  const searchParams = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  });
  return apiGet<DailyHealthAnalysisResponse>(
    `/guardians/elders/${elderUserId}/health-analysis/daily?${searchParams.toString()}`
  );
}

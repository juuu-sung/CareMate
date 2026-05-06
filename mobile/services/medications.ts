import { apiGet, apiPost } from "@/services/api";

export type MedicationStatus = "scheduled" | "taken" | "missed";
export type MedicationAnalyticsStatus = MedicationStatus | "pending";
export type MedicationGridStatus = MedicationAnalyticsStatus | "partial";

export type MedicationItem = {
  id?: string | null;
  name: string;
  easy_name?: string | null;
  time: string;
  status: MedicationStatus;
  status_label: string;
  last_time_scope?: string | null;
  last_recorded_at?: string | null;
  source?: string | null;
};

type MedicationListResponse = {
  items: MedicationItem[];
};

export type MedicationAnalytics = {
  range: {
    days: number;
    start_date: string;
    end_date: string;
  };
  summary: {
    expected_count: number;
    taken_count: number;
    missed_count: number;
    pending_count: number;
    completion_rate: number;
    missed_rate: number;
    current_missed_streak: number;
    longest_missed_streak: number;
  };
  daily: Array<{
    date: string;
    expected_count: number;
    taken_count: number;
    missed_count: number;
    pending_count: number;
    completion_rate: number;
  }>;
  time_slots: Array<{
    slot: string;
    label: string;
    expected_count: number;
    missed_count: number;
    missed_rate: number;
  }>;
  medications: Array<{
    medication_id?: string | null;
    name: string;
    easy_name?: string | null;
    scheduled_time: string;
    expected_count: number;
    taken_count: number;
    missed_count: number;
    completion_rate: number;
    last_status: MedicationAnalyticsStatus;
    last_recorded_at?: string | null;
    trend: MedicationAnalyticsStatus[];
  }>;
  schedule_grid: Array<{
    time: string;
    label: string;
    cells: Array<{
      date: string;
      status: MedicationGridStatus;
      label: string;
      total_count: number;
      taken_count: number;
      missed_count: number;
      pending_count: number;
      scheduled_count: number;
      medication_names: string[];
      medication_easy_names: string[];
    }>;
  }>;
  recent_missed: Array<{
    date: string;
    time: string;
    medication_name: string;
    medication_easy_name?: string | null;
  }>;
};

export type MedicationRecordPayload = {
  elder_user_id?: string;
  medication_id?: string | null;
  medication_name: string;
  time_scope?: string | null;
  status: Exclude<MedicationStatus, "scheduled">;
};

export type MedicationRecordResponse = {
  medication_name: string;
  time_scope: string;
  status: Exclude<MedicationStatus, "scheduled">;
  status_label: string;
};

export async function getMedications(elderUserId?: string): Promise<MedicationItem[]> {
  const searchParams = elderUserId
    ? `?${new URLSearchParams({ elder_user_id: elderUserId }).toString()}`
    : "";
  const response = await apiGet<MedicationListResponse>(`/medications${searchParams}`);
  return response.items;
}

export function getMedicationAnalytics(
  elderUserId?: string,
  days = 7
): Promise<MedicationAnalytics> {
  const searchParams = new URLSearchParams({ days: String(days) });

  if (elderUserId) {
    searchParams.set("elder_user_id", elderUserId);
  }

  return apiGet<MedicationAnalytics>(`/medications/analytics?${searchParams.toString()}`);
}

export function recordMedicationStatus(
  payload: MedicationRecordPayload
): Promise<MedicationRecordResponse> {
  return apiPost<MedicationRecordResponse>("/medications/record", payload);
}

import { apiGet, apiPost } from "@/services/api";

export type MedicationStatus = "scheduled" | "taken" | "missed";

export type MedicationItem = {
  id?: string | null;
  name: string;
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

export function recordMedicationStatus(
  payload: MedicationRecordPayload
): Promise<MedicationRecordResponse> {
  return apiPost<MedicationRecordResponse>("/medications/record", payload);
}

import { apiGet } from "@/services/api";

export type MedicationStatus = "scheduled" | "taken" | "missed";

export type MedicationItem = {
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

export async function getMedications(elderUserId?: string): Promise<MedicationItem[]> {
  const searchParams = elderUserId
    ? `?${new URLSearchParams({ elder_user_id: elderUserId }).toString()}`
    : "";
  const response = await apiGet<MedicationListResponse>(`/medications${searchParams}`);
  return response.items;
}

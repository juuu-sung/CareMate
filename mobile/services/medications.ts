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

export async function getMedications(): Promise<MedicationItem[]> {
  const response = await apiGet<MedicationListResponse>("/medications");
  return response.items;
}

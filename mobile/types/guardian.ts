import { CareMode } from "@/types/care";

export type GuardianDashboard = {
  care_mode: CareMode;
  check_in_status: "responded" | "pending" | "missed";
  latest_location_status: "available" | "unavailable";
  latest_location_label: string;
  latest_location_captured_at: string;
  open_alert_count: number;
  today_medication_pending_count: number;
  today_schedule_count: number;
};

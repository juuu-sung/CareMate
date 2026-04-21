import { CareMode } from "@/types/care";

export type GuardianCareLevel = "stable" | "check" | "caution";

export type GuardianCarePenalties = {
  alerts: number;
  check_in: number;
  medication: number;
  location: number;
  total: number;
};

export type GuardianCarePenaltyItem = {
  label: string;
  penalty: number;
};

export type GuardianDashboard = {
  care_mode: CareMode;
  care_score: number;
  care_level: GuardianCareLevel;
  care_summary: string;
  care_reasons: string[];
  care_penalties: GuardianCarePenalties;
  care_penalty_items: GuardianCarePenaltyItem[];
  check_in_status: "responded" | "pending" | "missed";
  latest_location_status: "available" | "unavailable" | "stale" | "disabled";
  latest_location_label: string;
  latest_location_captured_at: string;
  open_alert_count: number;
  today_medication_pending_count: number;
  today_schedule_count: number;
};

export type GuardianScheduleStatus = "scheduled" | "completed" | "cancelled";

export type GuardianScheduleItem = {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  status: GuardianScheduleStatus;
  type: string;
  scheduled_at: string;
};

import { CareMode } from "@/types/care";

export type GuardianCareLevel = "stable" | "check" | "caution" | "urgent";

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

export type GuardianHealthDomainScores = {
  clinical_stability: number;
  medication_stability: number;
  engagement_stability: number;
};

export type GuardianCareProcessScores = {
  medication_execution: number;
  check_in_execution: number;
  monitoring_continuity: number | null;
};

export type GuardianDashboard = {
  care_mode: CareMode;
  scoring_version: string;
  today_risk_level: GuardianCareLevel;
  today_risk_reasons: string[];
  health_reserve_score: number;
  care_execution_score: number;
  health_domain_scores: GuardianHealthDomainScores;
  care_process_scores: GuardianCareProcessScores;
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
  today_medication_total_count: number;
  today_medication_taken_count: number;
  today_medication_completion_rate: number;
  today_medication_pending_count: number;
  overdue_medication_count: number;
  severe_overdue_medication_count: number;
  missed_medication_count: number;
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

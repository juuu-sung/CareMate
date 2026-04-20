import { apiPost } from "@/services/api";

export type GuardianEventAlertPayload = {
  elder_user_id: string;
  link_code: string;
  type: string;
  message: string;
  severity?: "low" | "medium" | "high";
};

export function createGuardianEventAlert(payload: GuardianEventAlertPayload) {
  return apiPost("/alerts/event", {
    ...payload,
    severity: payload.severity ?? "medium",
  });
}

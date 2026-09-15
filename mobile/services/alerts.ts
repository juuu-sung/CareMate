import { apiPost } from "@/services/api";

export type GuardianEventAlertPayload = {
  type: "emergency_call" | "guardian_call";
  message: string;
  severity?: "low" | "medium" | "high";
};

export function createGuardianEventAlert(payload: GuardianEventAlertPayload) {
  return apiPost("/alerts/event", {
    ...payload,
    severity: payload.severity ?? "medium",
  });
}

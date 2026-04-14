import { apiGet, apiPost } from "@/services/api";
import { GuardianDashboard } from "@/types/guardian";

export function getGuardianDashboard() {
  return apiGet<GuardianDashboard>("/guardians/dashboard");
}

export type GuardianSignupPayload = {
  name: string;
  birth: string;
  phone: string;
  link_code: string;
  relation?: string;
  gender?: string;
};

export type GuardianSignupResponse = {
  guardian_id?: string;
  elder_id?: string;
  elder_name?: string;
  parent_id?: string;
  parent_name?: string;
  link_code?: string;
  message?: string;
};

export function guardianSignup(payload: GuardianSignupPayload) {
  return apiPost<GuardianSignupResponse>("/guardians/signup", payload);
}

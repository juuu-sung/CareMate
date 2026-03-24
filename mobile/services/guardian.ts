import { apiGet } from "@/services/api";
import { GuardianDashboard } from "@/types/guardian";

export function getGuardianDashboard() {
  return apiGet<GuardianDashboard>("/guardians/dashboard");
}

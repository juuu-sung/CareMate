import { apiGet } from "@/services/api";

export type GuardianLatestLocationResponse = {
  status: "available" | "unavailable";
  elder_user_id: string;
  latitude: number | null;
  longitude: number | null;
  source: string | null;
  captured_at: string | null;
  label: string;
};

export function getGuardianLatestLocation(_elderUserId: string, _linkId: string) {
  return apiGet<GuardianLatestLocationResponse>('/guardian-link/latest-location');
}

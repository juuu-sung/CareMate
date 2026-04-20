import { apiGet } from "@/services/api";

export type GuardianLatestLocationResponse = {
  status: "available" | "unavailable";
  elder_user_id: string;
  link_code: string;
  latitude: number | null;
  longitude: number | null;
  source: string | null;
  captured_at: string | null;
  label: string;
};

export function getGuardianLatestLocation(elderUserId: string, linkCode: string) {
  const searchParams = new URLSearchParams({
    elder_user_id: elderUserId,
    link_code: linkCode,
  });

  return apiGet<GuardianLatestLocationResponse>(`/guardian-link/latest-location?${searchParams.toString()}`);
}

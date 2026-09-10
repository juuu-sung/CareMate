import { apiGet, apiPost } from "@/services/api";

export type LocationSyncPayload = {
  elder_user_id: string;
  link_code: string;
  latitude: number;
  longitude: number;
  source?: string;
};

export type LocationRequestStatus = {
  elder_user_id: string;
  link_code: string;
  pending: boolean;
  requested_at: string | null;
  message: string;
};

export function syncElderLocation(payload: LocationSyncPayload) {
  return apiPost("/locations", {
    ...payload,
    source: payload.source ?? "mobile",
  });
}

export function requestGuardianLocationRefresh(elderUserId: string, linkCode: string) {
  void elderUserId;
  void linkCode;
  return apiPost<LocationRequestStatus>("/locations/request", {});
}

export function getPendingLocationRequest(elderUserId: string, linkCode: string) {
  const searchParams = new URLSearchParams({
    elder_user_id: elderUserId,
    link_code: linkCode,
  });

  return apiGet<LocationRequestStatus>(`/locations/request?${searchParams.toString()}`);
}

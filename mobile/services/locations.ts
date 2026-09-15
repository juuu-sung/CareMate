import { apiGet, apiPost } from "@/services/api";

export type LocationSyncPayload = {
  latitude: number;
  longitude: number;
  source?: string;
};

export type LocationRequestStatus = {
  elder_user_id: string;
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

export function requestGuardianLocationRefresh() {
  return apiPost<LocationRequestStatus>("/locations/request", {});
}

export function getPendingLocationRequest() {
  return apiGet<LocationRequestStatus>("/locations/request");
}

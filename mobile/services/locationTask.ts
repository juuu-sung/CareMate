import * as Location from "expo-location";

import { getPendingLocationRequest, syncElderLocation } from "@/services/locations";

const LOCATION_SYNC_INTERVAL_MS = 5 * 60 * 1000;

let lastSyncKey = "";
let lastSyncAt = 0;

export async function syncCurrentElderLocation({
  elderUserId,
  linkCode,
  force = false,
}: {
  elderUserId: string;
  linkCode: string;
  force?: boolean;
}) {
  if (!elderUserId || !linkCode) {
    return;
  }

  const syncKey = `${elderUserId}:${linkCode}`;
  if (!force && syncKey === lastSyncKey && Date.now() - lastSyncAt < LOCATION_SYNC_INTERVAL_MS) {
    return;
  }

  const permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted) {
    return;
  }

  const lastKnown = await Location.getLastKnownPositionAsync({
    maxAge: LOCATION_SYNC_INTERVAL_MS,
    requiredAccuracy: 250,
  });

  const current =
    lastKnown ??
    (await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }));

  await syncElderLocation({
    elder_user_id: elderUserId,
    link_code: linkCode,
    latitude: current.coords.latitude,
    longitude: current.coords.longitude,
    source: "mobile",
  });

  lastSyncKey = syncKey;
  lastSyncAt = Date.now();
}

export async function syncRequestedElderLocation({
  elderUserId,
  linkCode,
}: {
  elderUserId: string;
  linkCode: string;
}) {
  if (!elderUserId || !linkCode) {
    return false;
  }

  const request = await getPendingLocationRequest(elderUserId, linkCode);
  if (!request.pending) {
    return false;
  }

  await syncCurrentElderLocation({
    elderUserId,
    linkCode,
    force: true,
  });

  return true;
}

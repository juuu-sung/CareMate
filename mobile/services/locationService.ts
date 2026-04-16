import * as Location from "expo-location";

export type ChatCoordinates = {
  latitude: number;
  longitude: number;
};

const LOCATION_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

let cachedCoordinates: (ChatCoordinates & { capturedAtMs: number }) | null = null;

export function shouldRequestNearbyHospitalLocation(text: string) {
  const normalized = text.trim().toLowerCase();

  if (!normalized.includes("병원") && !normalized.includes("응급실")) {
    return false;
  }

  return ["주변", "근처", "가까운", "찾아", "알아봐", "있는지"].some((keyword) =>
    normalized.includes(keyword)
  );
}

export async function getCoordinatesForTextTurn(text: string): Promise<ChatCoordinates | null> {
  if (shouldRequestNearbyHospitalLocation(text)) {
    return getBestEffortCoordinates({ allowPermissionPrompt: true, preferFreshLocation: true });
  }

  return getBestEffortCoordinates({ allowPermissionPrompt: false, preferFreshLocation: false });
}

export async function getCoordinatesForVoiceTurn(): Promise<ChatCoordinates | null> {
  return getBestEffortCoordinates({ allowPermissionPrompt: false, preferFreshLocation: true });
}

async function getBestEffortCoordinates({
  allowPermissionPrompt,
  preferFreshLocation,
}: {
  allowPermissionPrompt: boolean;
  preferFreshLocation: boolean;
}): Promise<ChatCoordinates | null> {
  const fromCache = getFreshCachedCoordinates();
  if (fromCache) {
    return fromCache;
  }

  let permission = await Location.getForegroundPermissionsAsync();

  if (!permission.granted && allowPermissionPrompt) {
    permission = await Location.requestForegroundPermissionsAsync();
  }

  if (!permission.granted) {
    return null;
  }

  const lastKnown = await Location.getLastKnownPositionAsync({
    maxAge: LOCATION_CACHE_MAX_AGE_MS,
    requiredAccuracy: 250,
  });

  if (lastKnown) {
    return cacheCoordinates(lastKnown.coords.latitude, lastKnown.coords.longitude);
  }

  if (!preferFreshLocation) {
    return null;
  }

  try {
    const current = await Promise.race<Location.LocationObject | null>([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);

    if (!current) {
      return null;
    }

    return cacheCoordinates(current.coords.latitude, current.coords.longitude);
  } catch {
    return null;
  }
}

function getFreshCachedCoordinates(): ChatCoordinates | null {
  if (!cachedCoordinates) {
    return null;
  }

  if (Date.now() - cachedCoordinates.capturedAtMs > LOCATION_CACHE_MAX_AGE_MS) {
    cachedCoordinates = null;
    return null;
  }

  return {
    latitude: cachedCoordinates.latitude,
    longitude: cachedCoordinates.longitude,
  };
}

function cacheCoordinates(latitude: number, longitude: number): ChatCoordinates {
  cachedCoordinates = {
    latitude,
    longitude,
    capturedAtMs: Date.now(),
  };

  return {
    latitude,
    longitude,
  };
}

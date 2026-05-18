import * as Location from "expo-location";
import type * as ExpoTaskManager from "expo-task-manager";

import { loadAuthSession } from "@/services/authSession";
import { getPendingLocationRequest, syncElderLocation } from "@/services/locations";

const LOCATION_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const BACKGROUND_LOCATION_SYNC_INTERVAL_MS = 60 * 1000;
const BACKGROUND_LOCATION_DISTANCE_METERS = 50;
const BACKGROUND_LOCATION_TASK_NAME = "caremate-background-location-sync";

let lastSyncKey = "";
let lastSyncAt = 0;
let taskManagerModule: typeof ExpoTaskManager | null | undefined;

type BackgroundLocationTaskData = {
  locations?: Location.LocationObject[];
};

function getTaskManagerModule() {
  if (taskManagerModule !== undefined) {
    return taskManagerModule;
  }

  try {
    taskManagerModule = require("expo-task-manager") as typeof ExpoTaskManager;
  } catch (error) {
    console.log("[LocationTask] ExpoTaskManager native module unavailable:", error);
    taskManagerModule = null;
  }

  return taskManagerModule;
}

const TaskManager = getTaskManagerModule();

if (TaskManager && !TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK_NAME)) {
  TaskManager.defineTask(
    BACKGROUND_LOCATION_TASK_NAME,
    async ({ data, error }) => {
      const taskData = data as BackgroundLocationTaskData | undefined;

      if (error) {
        console.log("[LocationTask] background location error:", error);
        return;
      }

      const locations = taskData?.locations ?? [];
      const current = locations[locations.length - 1];

      if (!current) {
        return;
      }

      try {
        const session = await loadAuthSession();

        if (session?.role !== "parent") {
          return;
        }

        const elderUserId = session.elderUserId || session.parentId;

        if (!elderUserId || !session.linkCode) {
          return;
        }

        await syncElderLocation({
          elder_user_id: elderUserId,
          link_code: session.linkCode,
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          source: "background",
        });
      } catch (syncError) {
        console.log("[LocationTask] background location sync error:", syncError);
      }
    }
  );
}

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

export type BackgroundLocationSyncStatus = {
  available: boolean;
  started: boolean;
  foregroundGranted: boolean;
  backgroundGranted: boolean;
  canAskBackgroundAgain: boolean;
  message: string;
};

export async function ensureBackgroundLocationSync({
  elderUserId,
  linkCode,
}: {
  elderUserId: string;
  linkCode: string;
}): Promise<BackgroundLocationSyncStatus> {
  if (!elderUserId || !linkCode) {
    return {
      available: false,
      started: false,
      foregroundGranted: false,
      backgroundGranted: false,
      canAskBackgroundAgain: false,
      message: "위치 공유를 시작할 사용자 정보가 부족합니다.",
    };
  }

  const taskManager = getTaskManagerModule();

  if (!taskManager) {
    return {
      available: false,
      started: false,
      foregroundGranted: false,
      backgroundGranted: false,
      canAskBackgroundAgain: false,
      message: "현재 설치된 앱에는 백그라운드 위치 네이티브 모듈이 없습니다.",
    };
  }

  const taskManagerAvailable = await taskManager.isAvailableAsync();

  if (!taskManagerAvailable) {
    return {
      available: false,
      started: false,
      foregroundGranted: false,
      backgroundGranted: false,
      canAskBackgroundAgain: false,
      message: "이 실행 환경에서는 백그라운드 위치 추적을 사용할 수 없습니다.",
    };
  }

  let foregroundPermission = await Location.getForegroundPermissionsAsync();

  if (!foregroundPermission.granted && foregroundPermission.canAskAgain) {
    foregroundPermission = await Location.requestForegroundPermissionsAsync();
  }

  if (!foregroundPermission.granted) {
    return {
      available: true,
      started: false,
      foregroundGranted: false,
      backgroundGranted: false,
      canAskBackgroundAgain: false,
      message: "먼저 위치 권한을 허용해야 합니다.",
    };
  }

  let backgroundPermission = await Location.getBackgroundPermissionsAsync();

  if (!backgroundPermission.granted && backgroundPermission.canAskAgain) {
    backgroundPermission = await Location.requestBackgroundPermissionsAsync();
  }

  if (!backgroundPermission.granted) {
    await stopBackgroundLocationSync();

    return {
      available: true,
      started: false,
      foregroundGranted: true,
      backgroundGranted: false,
      canAskBackgroundAgain: backgroundPermission.canAskAgain,
      message: backgroundPermission.canAskAgain
        ? "백그라운드 위치 권한을 허용하면 앱을 닫아도 위치가 갱신됩니다."
        : "기기 설정에서 백그라운드 위치 권한을 직접 켜야 합니다.",
    };
  }

  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK_NAME
  );

  if (!alreadyStarted) {
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: BACKGROUND_LOCATION_SYNC_INTERVAL_MS,
      distanceInterval: BACKGROUND_LOCATION_DISTANCE_METERS,
      deferredUpdatesInterval: BACKGROUND_LOCATION_SYNC_INTERVAL_MS,
      deferredUpdatesDistance: BACKGROUND_LOCATION_DISTANCE_METERS,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "CareMate 위치 공유",
        notificationBody: "보호자에게 최신 위치를 안전하게 공유하고 있습니다.",
        notificationColor: "#05B547",
      },
    });
  }

  await syncCurrentElderLocation({
    elderUserId,
    linkCode,
    force: true,
  });

  return {
    available: true,
    started: true,
    foregroundGranted: true,
    backgroundGranted: true,
    canAskBackgroundAgain: backgroundPermission.canAskAgain,
    message: "백그라운드 위치 공유가 켜져 있습니다.",
  };
}

export async function stopBackgroundLocationSync() {
  const taskManager = getTaskManagerModule();

  if (!taskManager) {
    return;
  }

  const taskManagerAvailable = await taskManager.isAvailableAsync();

  if (!taskManagerAvailable) {
    return;
  }

  const started = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK_NAME
  );

  if (started) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
  }
}

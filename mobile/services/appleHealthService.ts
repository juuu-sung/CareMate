import { Platform } from "react-native";
import AppleHealthKit, {
  HealthInputOptions,
  HealthKitPermissions,
  HealthValue,
} from "react-native-health";

const permissions: HealthKitPermissions = {
  permissions: {
    read: [AppleHealthKit.Constants.Permissions.HeartRate],
    write: [],
  },
};

function ensureIos() {
  if (Platform.OS !== "ios") {
    throw new Error("HealthKit은 iOS 실제 기기에서만 사용할 수 있습니다.");
  }
}

export function initAppleHealthKit(): Promise<void> {
  ensureIos();

  return new Promise((resolve, reject) => {
    if (!AppleHealthKit || typeof AppleHealthKit.initHealthKit !== "function") {
      reject(
        new Error(
          "AppleHealthKit native module이 로드되지 않았습니다. Expo Go가 아니라 실제 iOS dev build로 다시 실행해야 합니다."
        )
      );
      return;
    }

    AppleHealthKit.initHealthKit(permissions, (error: string) => {
      if (error) {
        reject(new Error(`HealthKit 권한 요청 실패: ${error}`));
        return;
      }

      resolve();
    });
  });
}

export function getLatestHeartRateSample(): Promise<HealthValue | null> {
  ensureIos();

  return new Promise((resolve, reject) => {
    const now = new Date();
    const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const options: HealthInputOptions = {
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      ascending: false,
      limit: 1,
    };

    AppleHealthKit.getHeartRateSamples(
      options,
      (error: string, results: HealthValue[]) => {
        if (error) {
          reject(new Error(`심박수 조회 실패: ${error}`));
          return;
        }

        if (!results || results.length === 0) {
          resolve(null);
          return;
        }

        resolve(results[0]);
      }
    );
  });
}

export async function readLatestHeartRate() {
  await initAppleHealthKit();

  const sample = await getLatestHeartRateSample();

  if (!sample) {
    return null;
  }

  const heartRate =
    typeof sample.value === "number"
      ? sample.value
      : Number(sample.value);

  if (!Number.isFinite(heartRate)) {
    throw new Error("심박수 값이 올바르지 않습니다.");
  }

  return {
    heartRate,
    measuredAt: sample.startDate ?? sample.endDate ?? new Date().toISOString(),
    source: "Apple Watch",
  };
}
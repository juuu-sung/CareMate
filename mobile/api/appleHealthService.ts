import { Platform } from 'react-native';
import type {
  HealthInputOptions,
  HealthKitPermissions,
} from 'react-native-health';

const AppleHealthKit =
  Platform.OS === 'ios' ? require('react-native-health') : null;

const getHealthKit = () => {
  if (!AppleHealthKit) {
    return null;
  }

  return AppleHealthKit.default ?? AppleHealthKit;
};

export function requestHealthPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    const HealthKit = getHealthKit();

    if (!HealthKit?.initHealthKit) {
      console.log('HealthKit module not linked or initHealthKit missing:', HealthKit);
      resolve(false);
      return;
    }

    const permissions: HealthKitPermissions = {
      permissions: {
        read: [
          HealthKit.Constants.Permissions.HeartRate,
          HealthKit.Constants.Permissions.RestingHeartRate,
        ],
        write: [],
      },
    };

    HealthKit.initHealthKit(permissions, (error: string) => {
      if (error) {
        console.log('HealthKit permission error:', error);
        resolve(false);
        return;
      }

      resolve(true);
    });
  });
}

export function getLatestHeartRate(): Promise<number | null> {
  return new Promise((resolve) => {
    const HealthKit = getHealthKit();

    if (!HealthKit?.getHeartRateSamples) {
      console.log('HealthKit getHeartRateSamples missing:', HealthKit);
      resolve(null);
      return;
    }

    const options: HealthInputOptions = {
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date().toISOString(),
      ascending: false,
      limit: 1,
    };

    HealthKit.getHeartRateSamples(
      options,
      (error: string, results: Array<any>) => {
        if (error) {
          console.log('getHeartRateSamples error:', error);
          resolve(null);
          return;
        }

        if (!results || results.length === 0) {
          resolve(null);
          return;
        }

        resolve(Math.round(results[0].value));
      }
    );
  });
}

export function getLatestRestingHeartRate(): Promise<number | null> {
  return new Promise((resolve) => {
    const HealthKit = getHealthKit();

    if (!HealthKit?.getRestingHeartRateSamples) {
      console.log('HealthKit getRestingHeartRateSamples missing:', HealthKit);
      resolve(null);
      return;
    }

    const options: HealthInputOptions = {
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date().toISOString(),
      ascending: false,
      limit: 1,
    };

    HealthKit.getRestingHeartRateSamples(
      options,
      (error: string, results: Array<any>) => {
        if (error) {
          console.log('getRestingHeartRateSamples error:', error);
          resolve(null);
          return;
        }

        if (!results || results.length === 0) {
          resolve(null);
          return;
        }

        resolve(Math.round(results[0].value));
      }
    );
  });
}
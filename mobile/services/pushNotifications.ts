import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';

import { apiPost } from '@/services/api';
import type { AuthSession } from '@/services/authSession';

const PUSH_DEVICE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}caremate-push-device.json`
  : null;

type PushDeviceState = {
  deviceId: string;
};

export type CarePushNotificationData = {
  kind: string;
  targetRole: string;
  elderUserId: string;
  alertType: string;
  severity: string;
  scheduleAction?: string;
  scheduleId?: string;
};

function allowsNotifications(
  settings: Notifications.NotificationPermissionsStatus
) {
  return (
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

async function ensurePushPermission() {
  const current = await Notifications.getPermissionsAsync();

  if (allowsNotifications(current)) {
    return true;
  }

  if (current.canAskAgain === false) {
    return false;
  }

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });

  return allowsNotifications(requested);
}

async function loadDeviceId() {
  if (!PUSH_DEVICE_FILE_URI) {
    return `memory-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(PUSH_DEVICE_FILE_URI);
    if (fileInfo.exists) {
      const contents = await FileSystem.readAsStringAsync(PUSH_DEVICE_FILE_URI);
      const parsed = JSON.parse(contents) as Partial<PushDeviceState>;
      if (typeof parsed.deviceId === 'string' && parsed.deviceId.length > 0) {
        return parsed.deviceId;
      }
    }
  } catch {}

  const deviceId = `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    await FileSystem.writeAsStringAsync(
      PUSH_DEVICE_FILE_URI,
      JSON.stringify({ deviceId })
    );
  } catch {}

  return deviceId;
}

function getExpoProjectId() {
  const constants = Constants as typeof Constants & {
    easConfig?: { projectId?: string };
  };
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;

  return (
    constants.easConfig?.projectId ||
    extra?.eas?.projectId ||
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    ''
  );
}

export async function registerCurrentDeviceForPush(session: AuthSession) {
  if (Constants.isDevice === false) {
    return { registered: false, reason: 'simulator' as const };
  }

  const granted = await ensurePushPermission();
  if (!granted) {
    return { registered: false, reason: 'permission_denied' as const };
  }

  const projectId = getExpoProjectId();
  const tokenOptions = projectId ? { projectId } : undefined;
  const tokenResult = await Notifications.getExpoPushTokenAsync(
    tokenOptions
  ).catch((error) => {
    console.log('[PushNotifications] Expo push token unavailable:', error);
    return null;
  });

  if (!tokenResult?.data) {
    return { registered: false, reason: 'push_token_unavailable' as const };
  }

  const expoPushToken = tokenResult.data;
  const deviceId = await loadDeviceId();

  await apiPost('/push-tokens/register', {
    user_role: session.role === 'parent' ? 'elder' : 'guardian',
    expo_push_token: expoPushToken,
    device_id: deviceId,
    platform: Platform.OS,
  });

  return { registered: true as const };
}

export function addCarePushResponseListener(
  onNotificationPress: (data: CarePushNotificationData) => void
) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const rawData = response.notification.request.content.data ?? {};

    if (rawData.kind !== 'caremate-alert') {
      return;
    }

    onNotificationPress({
      kind: String(rawData.kind || ''),
      targetRole: String(rawData.targetRole || ''),
      elderUserId: String(rawData.elderUserId || ''),
      alertType: String(rawData.alertType || ''),
      severity: String(rawData.severity || ''),
      scheduleAction: rawData.scheduleAction ? String(rawData.scheduleAction) : undefined,
      scheduleId: rawData.scheduleId ? String(rawData.scheduleId) : undefined,
    });
  });
}

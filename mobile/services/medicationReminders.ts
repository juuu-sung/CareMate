import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system/legacy';

import type { MedicationItem } from '@/services/medications';

const MEDICATION_CHANNEL_ID = 'caremate-medication-reminders';
const MEDICATION_REMINDER_KIND = 'caremate-medication-reminder';
const REMINDER_STATE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}caremate-medication-reminders.json`
  : null;

type MedicationReminderState = {
  enabledElderUserIds: string[];
};

function getMedicationDisplayName(medication: MedicationItem) {
  return medication.easy_name?.trim() || '약';
}

export type MedicationReminderStatus = {
  isDevice: boolean;
  enabled: boolean;
  permissionGranted: boolean;
  scheduledCount: number;
  statusLabel: string;
  detail: string;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function allowsNotifications(
  settings: Notifications.NotificationPermissionsStatus
) {
  return (
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

function isPhysicalNotificationDevice() {
  return Platform.OS !== 'ios' || Constants.isDevice !== false;
}

function normalizeEnabledIds(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter((item) => item.length > 0)
    : [];
}

async function readReminderState(): Promise<MedicationReminderState> {
  if (!REMINDER_STATE_FILE_URI) {
    return { enabledElderUserIds: [] };
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(REMINDER_STATE_FILE_URI);

    if (!fileInfo.exists) {
      return { enabledElderUserIds: [] };
    }

    const contents = await FileSystem.readAsStringAsync(REMINDER_STATE_FILE_URI);
    const parsed = JSON.parse(contents) as Partial<MedicationReminderState>;

    return {
      enabledElderUserIds: normalizeEnabledIds(parsed.enabledElderUserIds),
    };
  } catch {
    return { enabledElderUserIds: [] };
  }
}

async function writeReminderState(state: MedicationReminderState) {
  if (!REMINDER_STATE_FILE_URI) {
    return;
  }

  await FileSystem.writeAsStringAsync(
    REMINDER_STATE_FILE_URI,
    JSON.stringify({
      enabledElderUserIds: Array.from(new Set(state.enabledElderUserIds)),
    })
  );
}

export async function setMedicationReminderEnabled(
  elderUserId: string,
  enabled: boolean
) {
  const state = await readReminderState();
  const currentIds = new Set(state.enabledElderUserIds);

  if (enabled) {
    currentIds.add(elderUserId);
  } else {
    currentIds.delete(elderUserId);
  }

  await writeReminderState({ enabledElderUserIds: Array.from(currentIds) });
}

export async function isMedicationReminderEnabled(elderUserId: string) {
  const state = await readReminderState();
  return state.enabledElderUserIds.includes(elderUserId);
}

function parseMedicationTime(value: string) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

async function ensureReminderChannel() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(MEDICATION_CHANNEL_ID, {
    name: '복약 알림',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#4F7CFF',
  });
}

async function ensureNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();

  if (allowsNotifications(current)) {
    await ensureReminderChannel();
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });

  if (!allowsNotifications(requested)) {
    return false;
  }

  await ensureReminderChannel();
  return true;
}

async function cancelExistingMedicationReminders(elderUserId?: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();

  await Promise.all(
    scheduled
      .filter((request) => {
        const data = request.content.data ?? {};

        if (data.kind !== MEDICATION_REMINDER_KIND) {
          return false;
        }

        if (!elderUserId) {
          return true;
        }

        return data.elderUserId === elderUserId;
      })
      .map((request) =>
        Notifications.cancelScheduledNotificationAsync(request.identifier)
      )
  );
}

export async function scheduleDailyMedicationReminders({
  elderUserId,
  medications,
}: {
  elderUserId: string;
  medications: MedicationItem[];
}) {
  if (!isPhysicalNotificationDevice()) {
    await setMedicationReminderEnabled(elderUserId, false);
    return { granted: false, scheduledCount: 0, isSimulator: true };
  }

  const granted = await ensureNotificationPermission();

  if (!granted) {
    await setMedicationReminderEnabled(elderUserId, false);
    return { granted: false, scheduledCount: 0 };
  }

  await cancelExistingMedicationReminders(elderUserId);

  let scheduledCount = 0;

  for (const medication of medications) {
    const time = parseMedicationTime(medication.time);

    if (!time) {
      continue;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '복약 시간입니다',
        body: `${getMedicationDisplayName(medication)} 드실 시간이에요.`,
        sound: true,
        data: {
          kind: MEDICATION_REMINDER_KIND,
          elderUserId,
          medicationId: medication.id ?? '',
          medicationName: medication.name,
          timeScope: medication.time,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: time.hour,
        minute: time.minute,
        channelId: MEDICATION_CHANNEL_ID,
      },
    });

    scheduledCount += 1;
  }

  await setMedicationReminderEnabled(elderUserId, true);

  return { granted: true, scheduledCount };
}

export async function syncMedicationRemindersIfEnabled({
  elderUserId,
  medications,
}: {
  elderUserId: string;
  medications: MedicationItem[];
}) {
  if (!elderUserId) {
    return { skipped: true, reason: 'missing_elder_user_id' as const };
  }

  const enabled = await isMedicationReminderEnabled(elderUserId);

  if (!enabled) {
    return { skipped: true, reason: 'disabled' as const };
  }

  return scheduleDailyMedicationReminders({ elderUserId, medications });
}

export async function getMedicationReminderStatus(
  elderUserId?: string
): Promise<MedicationReminderStatus> {
  const isDevice = isPhysicalNotificationDevice();
  const settings = await Notifications.getPermissionsAsync();
  const permissionGranted = allowsNotifications(settings);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const scheduledCount = scheduled.filter((request) => {
    const data = request.content.data ?? {};

    if (data.kind !== MEDICATION_REMINDER_KIND) {
      return false;
    }

    if (!elderUserId) {
      return true;
    }

    return data.elderUserId === elderUserId;
  }).length;
  const enabled = elderUserId ? await isMedicationReminderEnabled(elderUserId) : false;

  if (!isDevice) {
    return {
      isDevice,
      enabled,
      permissionGranted,
      scheduledCount,
      statusLabel: '시뮬레이터',
      detail: 'iOS 시뮬레이터에서는 실제 복약 알림 수신을 검증하기 어렵습니다.',
    };
  }

  if (!permissionGranted) {
    return {
      isDevice,
      enabled: false,
      permissionGranted,
      scheduledCount,
      statusLabel: '권한 꺼짐',
      detail: '복약 알림을 받으려면 기기 알림 권한을 허용해야 합니다.',
    };
  }

  if (enabled && scheduledCount > 0) {
    return {
      isDevice,
      enabled,
      permissionGranted,
      scheduledCount,
      statusLabel: '켜짐',
      detail: `현재 ${scheduledCount}개의 복약 알림이 예약되어 있습니다.`,
    };
  }

  if (enabled) {
    return {
      isDevice,
      enabled,
      permissionGranted,
      scheduledCount,
      statusLabel: '재동기화 필요',
      detail: '알림은 켜져 있지만 예약된 약 시간이 없습니다.',
    };
  }

  return {
    isDevice,
    enabled,
    permissionGranted,
    scheduledCount,
    statusLabel: '꺼짐',
    detail: '복약 화면에서 알림을 켜면 약 변경 시 자동으로 다시 맞춥니다.',
  };
}

export function addMedicationReminderResponseListener(
  onReminderPress: (data: {
    elderUserId: string;
    medicationId: string;
    medicationName: string;
    timeScope: string;
  }) => void
) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data ?? {};

    if (data.kind !== MEDICATION_REMINDER_KIND) {
      return;
    }

    onReminderPress({
      elderUserId: String(data.elderUserId || ''),
      medicationId: String(data.medicationId || ''),
      medicationName: String(data.medicationName || ''),
      timeScope: String(data.timeScope || ''),
    });
  });
}

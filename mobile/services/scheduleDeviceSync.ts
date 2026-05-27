import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type * as ExpoCalendar from 'expo-calendar';

import { getSchedules, ScheduleItem } from '@/services/schedules';

const CAREMATE_CALENDAR_TITLE = 'CareMate 일정';
const SCHEDULE_CHANNEL_ID = 'caremate-schedule-reminders';
const SCHEDULE_REMINDER_KIND = 'caremate-schedule-reminder';
const SYNC_STATE_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}caremate-schedule-sync.json`
  : null;

type CalendarModule = typeof ExpoCalendar;

type SyncedScheduleRecord = {
  scheduleId: string;
  fingerprint: string;
  calendarEventId?: string;
  notificationIds: string[];
};

type ScheduleSyncState = {
  calendarId?: string;
  recordsByElderUserId: Record<string, Record<string, SyncedScheduleRecord>>;
};

let calendarModule: CalendarModule | null | undefined;

function getCalendarModule() {
  if (calendarModule !== undefined) {
    return calendarModule;
  }

  if (!requireOptionalNativeModule('ExpoCalendar')) {
    calendarModule = null;
    return calendarModule;
  }

  try {
    calendarModule = require('expo-calendar') as CalendarModule;
  } catch {
    calendarModule = null;
  }

  return calendarModule;
}

function emptyState(): ScheduleSyncState {
  return {
    recordsByElderUserId: {},
  };
}

async function readState(): Promise<ScheduleSyncState> {
  if (!SYNC_STATE_FILE_URI) {
    return emptyState();
  }

  try {
    const info = await FileSystem.getInfoAsync(SYNC_STATE_FILE_URI);
    if (!info.exists) {
      return emptyState();
    }

    const contents = await FileSystem.readAsStringAsync(SYNC_STATE_FILE_URI);
    const parsed = JSON.parse(contents) as Partial<ScheduleSyncState>;

    return {
      calendarId: parsed.calendarId,
      recordsByElderUserId:
        parsed.recordsByElderUserId && typeof parsed.recordsByElderUserId === 'object'
          ? parsed.recordsByElderUserId
          : {},
    };
  } catch {
    return emptyState();
  }
}

async function writeState(state: ScheduleSyncState) {
  if (!SYNC_STATE_FILE_URI) {
    return;
  }

  await FileSystem.writeAsStringAsync(SYNC_STATE_FILE_URI, JSON.stringify(state));
}

function allowsNotifications(settings: Notifications.NotificationPermissionsStatus) {
  return (
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

async function ensureNotificationChannel() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(SCHEDULE_CHANNEL_ID, {
    name: '일정 알림',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#05B547',
  });
}

async function ensureNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();

  if (allowsNotifications(current)) {
    await ensureNotificationChannel();
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

  if (!allowsNotifications(requested)) {
    return false;
  }

  await ensureNotificationChannel();
  return true;
}

async function ensureCalendarPermission(calendar: CalendarModule) {
  const available = await calendar.isAvailableAsync();
  if (!available) {
    return false;
  }

  const current = await calendar.getCalendarPermissionsAsync();
  if (current.granted) {
    return true;
  }

  if (current.canAskAgain === false) {
    return false;
  }

  const requested = await calendar.requestCalendarPermissionsAsync();
  return requested.granted;
}

async function ensureCareMateCalendar(
  calendar: CalendarModule,
  currentCalendarId?: string
) {
  const calendars = await calendar.getCalendarsAsync(calendar.EntityTypes.EVENT);
  const existing =
    (currentCalendarId
      ? calendars.find((item) => item.id === currentCalendarId && item.allowsModifications)
      : null) ??
    calendars.find(
      (item) => item.title === CAREMATE_CALENDAR_TITLE && item.allowsModifications
    );

  if (existing) {
    return existing.id;
  }

  if (Platform.OS === 'ios') {
    const defaultCalendar = await calendar.getDefaultCalendarAsync();
    return calendar.createCalendarAsync({
      title: CAREMATE_CALENDAR_TITLE,
      color: '#05B547',
      entityType: calendar.EntityTypes.EVENT,
      sourceId: defaultCalendar.sourceId,
      source: defaultCalendar.source,
    });
  }

  return calendar.createCalendarAsync({
    title: CAREMATE_CALENDAR_TITLE,
    name: CAREMATE_CALENDAR_TITLE,
    color: '#05B547',
    entityType: calendar.EntityTypes.EVENT,
    ownerAccount: 'CareMate',
    source: {
      isLocalAccount: true,
      name: CAREMATE_CALENDAR_TITLE,
      type: calendar.SourceType.LOCAL,
    },
    accessLevel: calendar.CalendarAccessLevel.OWNER,
  });
}

function parseScheduleDate(schedule: ScheduleItem) {
  const date = new Date(schedule.scheduled_at);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function shouldSyncSchedule(schedule: ScheduleItem) {
  const date = parseScheduleDate(schedule);
  if (!date || schedule.status !== 'scheduled') {
    return false;
  }

  return date.getTime() >= Date.now() - 24 * 60 * 60 * 1000;
}

function getScheduleFingerprint(schedule: ScheduleItem) {
  return JSON.stringify({
    id: schedule.id,
    title: schedule.title,
    description: schedule.description || '',
    scheduled_at: schedule.scheduled_at,
    type: schedule.type || '',
    status: schedule.status,
  });
}

function getScheduleEndDate(startDate: Date) {
  return new Date(startDate.getTime() + 60 * 60 * 1000);
}

function buildEventData(calendar: CalendarModule, schedule: ScheduleItem) {
  const startDate = parseScheduleDate(schedule) ?? new Date();
  const notes = schedule.description?.trim()
    ? `${schedule.description.trim()}\n\nCareMate에서 동기화된 일정입니다.`
    : 'CareMate에서 동기화된 일정입니다.';

  return {
    title: schedule.title,
    notes,
    startDate,
    endDate: getScheduleEndDate(startDate),
    timeZone: 'Asia/Seoul',
    availability: calendar.Availability.BUSY,
    alarms: [{ relativeOffset: -30 }],
  };
}

async function syncCalendarEvent({
  calendar,
  calendarId,
  schedule,
  previousRecord,
}: {
  calendar: CalendarModule | null;
  calendarId?: string;
  schedule: ScheduleItem;
  previousRecord?: SyncedScheduleRecord;
}) {
  if (!calendar || !calendarId) {
    return previousRecord?.calendarEventId;
  }

  const eventData = buildEventData(calendar, schedule);

  if (previousRecord?.calendarEventId) {
    try {
      await calendar.updateEventAsync(previousRecord.calendarEventId, eventData);
      return previousRecord.calendarEventId;
    } catch (error) {
      console.log('[ScheduleSync] calendar event update failed, recreating:', error);
    }
  }

  return calendar.createEventAsync(calendarId, eventData);
}

async function cancelNotifications(notificationIds: string[]) {
  await Promise.all(
    notificationIds.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)
    )
  );
}

function getFutureReminderDates(schedule: ScheduleItem) {
  const startDate = parseScheduleDate(schedule);
  if (!startDate) {
    return [];
  }

  return [
    new Date(startDate.getTime() - 30 * 60 * 1000),
    startDate,
  ].filter((date, index, array) => {
    if (date.getTime() <= Date.now() + 5000) {
      return false;
    }
    return array.findIndex((item) => item.getTime() === date.getTime()) === index;
  });
}

async function scheduleNotifications(schedule: ScheduleItem) {
  const startDate = parseScheduleDate(schedule);
  if (!startDate) {
    return [];
  }

  const reminderDates = getFutureReminderDates(schedule);

  const ids: string[] = [];

  for (const reminderDate of reminderDates) {
    const isStartReminder = reminderDate.getTime() === startDate.getTime();
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: isStartReminder ? '일정 시간입니다' : '곧 일정이 있어요',
        body: isStartReminder
          ? `${schedule.title} 일정 시간이에요.`
          : `${schedule.title} 일정이 30분 뒤에 있어요.`,
        sound: true,
        data: {
          kind: SCHEDULE_REMINDER_KIND,
          scheduleId: schedule.id,
          scheduleTitle: schedule.title,
          scheduledAt: schedule.scheduled_at,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderDate,
        channelId: SCHEDULE_CHANNEL_ID,
      },
    });
    ids.push(id);
  }

  return ids;
}

async function deleteCalendarEvent(calendar: CalendarModule | null, eventId?: string) {
  if (!calendar || !eventId) {
    return;
  }

  await calendar.deleteEventAsync(eventId).catch(() => undefined);
}

export async function syncSchedulesToDevice({
  elderUserId,
  schedules,
}: {
  elderUserId: string;
  schedules?: ScheduleItem[];
}) {
  if (!elderUserId) {
    return { synced: false, reason: 'missing_elder_user_id' as const };
  }

  const sourceSchedules = schedules ?? (await getSchedules(elderUserId));
  const desiredSchedules = sourceSchedules.filter(shouldSyncSchedule);
  const desiredIds = new Set(desiredSchedules.map((schedule) => schedule.id));
  const state = await readState();
  const currentRecords = state.recordsByElderUserId[elderUserId] ?? {};
  const nextRecords: Record<string, SyncedScheduleRecord> = {};

  const notificationGranted = await ensureNotificationPermission();
  const calendar = getCalendarModule();
  const calendarGranted = calendar ? await ensureCalendarPermission(calendar) : false;
  const activeCalendar = calendar && calendarGranted ? calendar : null;
  const calendarId = activeCalendar
    ? await ensureCareMateCalendar(activeCalendar, state.calendarId)
    : state.calendarId;

  for (const [scheduleId, record] of Object.entries(currentRecords)) {
    if (desiredIds.has(scheduleId)) {
      continue;
    }

    await cancelNotifications(record.notificationIds);
    await deleteCalendarEvent(activeCalendar, record.calendarEventId);
  }

  for (const schedule of desiredSchedules) {
    const previousRecord = currentRecords[schedule.id];
    const fingerprint = getScheduleFingerprint(schedule);
    const canReuseCalendarRecord =
      !activeCalendar || !!previousRecord?.calendarEventId;
    const canReuseNotificationRecord =
      !notificationGranted ||
      previousRecord?.notificationIds.length > 0 ||
      getFutureReminderDates(schedule).length === 0;

    if (
      previousRecord?.fingerprint === fingerprint &&
      canReuseCalendarRecord &&
      canReuseNotificationRecord
    ) {
      nextRecords[schedule.id] = previousRecord;
      continue;
    }

    if (previousRecord) {
      await cancelNotifications(previousRecord.notificationIds);
    }

    const calendarEventId = await syncCalendarEvent({
      calendar: activeCalendar,
      calendarId,
      schedule,
      previousRecord,
    });
    const notificationIds = notificationGranted
      ? await scheduleNotifications(schedule)
      : [];

    nextRecords[schedule.id] = {
      scheduleId: schedule.id,
      fingerprint,
      calendarEventId,
      notificationIds,
    };
  }

  state.calendarId = calendarId;
  state.recordsByElderUserId[elderUserId] = nextRecords;
  await writeState(state);

  return {
    synced: true as const,
    calendarGranted,
    notificationGranted,
    calendarEventCount: Object.values(nextRecords).filter(
      (record) => !!record.calendarEventId
    ).length,
    notificationCount: Object.values(nextRecords).reduce(
      (total, record) => total + record.notificationIds.length,
      0
    ),
  };
}

export function addScheduleReminderResponseListener(
  onReminderPress: (data: {
    scheduleId: string;
    scheduleTitle: string;
    scheduledAt: string;
  }) => void
) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data ?? {};

    if (data.kind !== SCHEDULE_REMINDER_KIND) {
      return;
    }

    onReminderPress({
      scheduleId: String(data.scheduleId || ''),
      scheduleTitle: String(data.scheduleTitle || ''),
      scheduledAt: String(data.scheduledAt || ''),
    });
  });
}

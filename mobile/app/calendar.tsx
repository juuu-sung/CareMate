import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { SeniorBottomNav } from "@/components/common/SeniorBottomNav";
import { loadAuthSession } from "@/services/authSession";
import { getSchedules, ScheduleItem } from "@/services/schedules";

type ViewerRole = "parent" | "guardian";

type CalendarDay = {
  key: string;
  date: Date;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  schedules: ScheduleItem[];
};

const ORANGE = "#F97316";
const ORANGE_DARK = "#EA580C";
const ORANGE_SOFT = "#FFEDD5";
const ORANGE_PALE = "#FFF7ED";
const BG = "#FFFFFF";
const CARD_BORDER = "#FED7AA";
const TEXT = "#111827";
const MUTED = "#64748B";
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export default function CalendarPage() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const requestedViewerRole =
    params.viewerRole === "guardian" || params.viewer_role === "guardian"
      ? "guardian"
      : params.viewerRole === "parent" || params.viewer_role === "parent"
        ? "parent"
        : null;

  const scheduleOwnerIdParam = String(
    params.seniorUserId ||
      params.senior_user_id ||
      params.elderUserId ||
      params.elder_user_id ||
      params.parentId ||
      ""
  ).trim();

  const parentName = String(params.parentName || "").trim();
  const linkCode = String(params.linkCode || params.link_code || "").trim();
  const guardianPhone = String(params.guardianPhone || params.guardian_phone || "").trim();
  const agentName = String(params.agentName || params.agent_name || "").trim();
  const selectedVoice = String(params.selectedVoice || params.agentVoice || params.agent_voice || "").trim();

  const todayKey = useMemo(() => getDateKey(new Date()), []);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleOwnerId, setScheduleOwnerId] = useState(scheduleOwnerIdParam);
  const [viewerRole, setViewerRole] = useState<ViewerRole>(
    requestedViewerRole ?? "parent"
  );
  const [selectedDayKey, setSelectedDayKey] = useState(todayKey);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const loadSchedulesData = useCallback(async () => {
    try {
      setError(null);

      let scheduleOwnerId = scheduleOwnerIdParam;
      let resolvedViewerRole: ViewerRole = requestedViewerRole ?? "parent";

      if (!scheduleOwnerId) {
        const session = await loadAuthSession();

        if (session?.role === "parent") {
          scheduleOwnerId = session.elderUserId || session.parentId || "";
          resolvedViewerRole = "parent";
        } else if (session?.role === "guardian") {
          scheduleOwnerId = session.parentId || "";
          resolvedViewerRole = "guardian";
        }
      }

      setViewerRole(resolvedViewerRole);
      setScheduleOwnerId(scheduleOwnerId);

      if (!scheduleOwnerId) {
        setSchedules([]);
        setError("일정을 불러올 보호자 연결 정보를 찾지 못했습니다.");
        return;
      }

      const items = await getSchedules(scheduleOwnerId);

      setSchedules(sortSchedulesByTime(items));
      setError(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "일정 조회 중 오류가 발생했습니다.";

      setSchedules([]);
      setError(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [requestedViewerRole, scheduleOwnerIdParam]);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      void loadSchedulesData();
    }, [loadSchedulesData])
  );

  const schedulesByDay = useMemo(() => groupSchedulesByDay(schedules), [schedules]);
  const selectedSchedules = schedulesByDay.get(selectedDayKey) ?? [];
  const todaySchedules = schedulesByDay.get(todayKey) ?? [];
  const calendarDays = useMemo(
    () => buildCalendarDays(visibleMonth, selectedDayKey, schedulesByDay),
    [schedulesByDay, selectedDayKey, visibleMonth]
  );

  const selectedDate = useMemo(() => parseDateKey(selectedDayKey), [selectedDayKey]);
  const selectedDateLabel = formatFullDateLabel(selectedDate);
  const selectedSummaryLabel =
    selectedDayKey === todayKey ? "오늘 일정" : `${selectedDateLabel} 일정`;

  const moveMonth = (amount: number) => {
    setVisibleMonth((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + amount, 1);
      setSelectedDayKey(getDateKey(next));
      return next;
    });
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    void loadSchedulesData();
  };

  const handleSelectDay = (day: CalendarDay) => {
    setSelectedDayKey(day.key);

    if (!day.inCurrentMonth) {
      setVisibleMonth(new Date(day.date.getFullYear(), day.date.getMonth(), 1));
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            tintColor={ORANGE_DARK}
            onRefresh={handleRefresh}
          />
        }
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.back()}
            activeOpacity={0.86}
            accessibilityRole="button"
            accessibilityLabel="이전 화면으로 이동"
          >
            <Ionicons name="chevron-back" size={24} color={TEXT} />
          </TouchableOpacity>

          <View style={styles.topTitleArea}>
            <Text style={styles.topTitle}>일정 보기</Text>
            <Text style={styles.topSubtitle}>
              {viewerRole === "guardian" ? "부모님 날짜별 일정" : "날짜별 일정"}
            </Text>
          </View>

          <View style={styles.topBarSpacer} />
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroIconBox}>
            <Ionicons name="calendar-outline" size={34} color={ORANGE_DARK} />
          </View>
          <View style={styles.heroTextArea}>
            <Text style={styles.heroTitle}>{selectedSummaryLabel}</Text>
            <Text style={styles.heroDescription}>
              {selectedSchedules.length > 0
                ? `${selectedSchedules.length}개의 일정이 있어요.`
                : "등록된 일정이 없어요."}
            </Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryMiniCard}>
            <Text style={styles.summaryMiniLabel}>오늘</Text>
            <Text style={styles.summaryMiniValue}>{todaySchedules.length}개</Text>
          </View>
          <View style={styles.summaryMiniCard}>
            <Text style={styles.summaryMiniLabel}>선택한 날</Text>
            <Text style={styles.summaryMiniValue}>{selectedSchedules.length}개</Text>
          </View>
          <View style={styles.summaryMiniCard}>
            <Text style={styles.summaryMiniLabel}>전체</Text>
            <Text style={styles.summaryMiniValue}>{schedules.length}개</Text>
          </View>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.calendarHeaderRow}>
            <TouchableOpacity
              style={styles.monthButton}
              onPress={() => moveMonth(-1)}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityLabel="이전 달 보기"
            >
              <Ionicons name="chevron-back" size={22} color={ORANGE_DARK} />
            </TouchableOpacity>

            <Text style={styles.calendarMonthLabel}>
              {formatCalendarMonthLabel(visibleMonth)}
            </Text>

            <TouchableOpacity
              style={styles.monthButton}
              onPress={() => moveMonth(1)}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityLabel="다음 달 보기"
            >
              <Ionicons name="chevron-forward" size={22} color={ORANGE_DARK} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label) => (
              <Text key={label} style={styles.weekdayLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendarDays.map((day) => {
              const hasSchedules = day.schedules.length > 0;

              return (
                <TouchableOpacity
                  key={day.key}
                  style={[
                    styles.calendarDayCell,
                    !day.inCurrentMonth && styles.calendarDayCellMuted,
                    day.isToday && styles.calendarDayCellToday,
                    day.isSelected && styles.calendarDayCellSelected,
                  ]}
                  onPress={() => handleSelectDay(day)}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityLabel={`${day.dayNumber}일 일정 보기`}
                >
                  <Text
                    style={[
                      styles.calendarDayText,
                      !day.inCurrentMonth && styles.calendarDayTextMuted,
                      day.isToday && styles.calendarDayTextToday,
                      day.isSelected && styles.calendarDayTextSelected,
                    ]}
                  >
                    {day.dayNumber}
                  </Text>

                  {hasSchedules ? (
                    <View
                      style={[
                        styles.scheduleCountPill,
                        day.isSelected && styles.scheduleCountPillSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.scheduleCountText,
                          day.isSelected && styles.scheduleCountTextSelected,
                        ]}
                      >
                        {day.schedules.length}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.emptyDayMarker} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="small" color={ORANGE_DARK} />
            <Text style={styles.stateText}>일정을 불러오는 중입니다.</Text>
          </View>
        ) : null}

        {!isLoading && error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={24} color="#B91C1C" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!isLoading && !error ? (
          <View style={styles.scheduleSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{selectedDateLabel}</Text>
              <Text style={styles.sectionCount}>{selectedSchedules.length}개</Text>
            </View>

            {selectedSchedules.length === 0 ? (
              <View style={styles.emptyScheduleCard}>
                <Ionicons name="sunny-outline" size={30} color={ORANGE_DARK} />
                <Text style={styles.emptyScheduleTitle}>이 날은 일정이 없어요</Text>
                <Text style={styles.emptyScheduleText}>
                  다른 날짜를 누르면 그날 일정을 볼 수 있어요.
                </Text>
              </View>
            ) : (
              selectedSchedules.map((schedule, index) => (
                <ScheduleCard
                  key={`${schedule.id ?? index}-${schedule.scheduled_at}-${schedule.title}`}
                  schedule={schedule}
                />
              ))
            )}
          </View>
        ) : null}
      </ScrollView>

      {viewerRole === "parent" ? (
        <SeniorBottomNav
          active="home"
          params={{
            parentId: scheduleOwnerId,
            elderUserId: scheduleOwnerId,
            parentName,
            linkCode,
            guardianPhone,
            agentName,
            agentVoice: selectedVoice,
            selectedVoice,
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function ScheduleCard({ schedule }: { schedule: ScheduleItem }) {
  const visibleDescription = getVisibleScheduleDescription(schedule.description);

  return (
    <View style={styles.scheduleCard}>
      <View style={styles.scheduleTimePill}>
        <Ionicons name="time-outline" size={20} color={ORANGE_DARK} />
        <Text style={styles.scheduleTimeText}>{getScheduleTimeLabel(schedule)}</Text>
      </View>

      <Text style={styles.scheduleTitle}>{schedule.title || "일정"}</Text>

      {visibleDescription ? (
        <Text style={styles.scheduleDescription}>{visibleDescription}</Text>
      ) : null}

      <View style={styles.scheduleBottomRow}>
        <Text style={styles.scheduleType}>{formatScheduleType(schedule.type)}</Text>
        <Text style={styles.scheduleStatus}>{formatStatus(schedule.status)}</Text>
      </View>
    </View>
  );
}

function sortSchedulesByTime(items: ScheduleItem[]) {
  return [...items].sort((left, right) => {
    const leftTime = getScheduleDate(left)?.getTime() ?? 0;
    const rightTime = getScheduleDate(right)?.getTime() ?? 0;
    return leftTime - rightTime;
  });
}

function groupSchedulesByDay(items: ScheduleItem[]) {
  const grouped = new Map<string, ScheduleItem[]>();

  items.forEach((item) => {
    const key = getScheduleDayKey(item);
    if (!key) return;

    const dayItems = grouped.get(key) ?? [];
    dayItems.push(item);
    grouped.set(key, sortSchedulesByTime(dayItems));
  });

  return grouped;
}

function buildCalendarDays(
  monthDate: Date,
  selectedDayKey: string,
  schedulesByDay: Map<string, ScheduleItem[]>
): CalendarDay[] {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const firstVisibleDay = new Date(firstDay);
  firstVisibleDay.setDate(firstDay.getDate() - firstDay.getDay());

  const todayKey = getDateKey(new Date());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstVisibleDay);
    date.setDate(firstVisibleDay.getDate() + index);

    const key = getDateKey(date);

    return {
      key,
      date,
      dayNumber: date.getDate(),
      inCurrentMonth: date.getMonth() === monthDate.getMonth(),
      isToday: key === todayKey,
      isSelected: key === selectedDayKey,
      schedules: schedulesByDay.get(key) ?? [],
    };
  });
}

function getScheduleDate(schedule: ScheduleItem) {
  const source = schedule.scheduled_at || buildDateTimeFromParts(schedule.date, schedule.time);
  const date = new Date(source);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function getScheduleDayKey(schedule: ScheduleItem) {
  if (schedule.date && /^\d{4}-\d{2}-\d{2}$/.test(schedule.date)) {
    return schedule.date;
  }

  const date = getScheduleDate(schedule);
  return date ? getDateKey(date) : "";
}

function getScheduleTimeLabel(schedule: ScheduleItem) {
  const explicitTime = String(schedule.time || "").trim();

  if (/^\d{1,2}:\d{2}/.test(explicitTime)) {
    return explicitTime.slice(0, 5);
  }

  const date = getScheduleDate(schedule);

  if (!date) {
    return "시간 확인";
  }

  return formatTime(date);
}

function buildDateTimeFromParts(date?: string, time?: string) {
  const cleanDate = String(date || "").trim();
  const cleanTime = String(time || "00:00").trim();

  if (!cleanDate) {
    return "";
  }

  return `${cleanDate}T${cleanTime || "00:00"}:00`;
}

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map((value) => Number(value));

  if (!year || !month || !day) {
    return new Date();
  }

  return new Date(year, month - 1, day);
}

function formatCalendarMonthLabel(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function formatFullDateLabel(date: Date) {
  const weekday = WEEKDAY_LABELS[date.getDay()];
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekday}요일`;
}

function formatTime(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
}

function formatStatus(status?: string) {
  if (status === "scheduled") return "예정";
  if (status === "completed") return "완료";
  if (status === "cancelled") return "취소";
  if (status === "missed") return "놓침";
  return status || "예정";
}

function formatScheduleType(type?: string) {
  if (type === "medication") return "복약";
  if (type === "hospital") return "병원";
  if (type === "call") return "전화";
  if (type === "general") return "일반";
  return "일정";
}

function getVisibleScheduleDescription(description?: string | null) {
  const normalized = description?.trim();

  if (!normalized) {
    return "";
  }

  if (/^[a-z_]+\s+mode agent action$/i.test(normalized)) {
    return "";
  }

  return normalized;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 132,
    gap: 18,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topTitleArea: {
    alignItems: "center",
  },
  topTitle: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "900",
    color: TEXT,
  },
  topSubtitle: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
    color: MUTED,
  },
  iconButton: {
    width: 54,
    height: 54,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  topBarSpacer: {
    width: 54,
    height: 54,
  },
  heroCard: {
    minHeight: 116,
    borderRadius: 28,
    backgroundColor: ORANGE_DARK,
    padding: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    shadowColor: ORANGE_DARK,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 7,
  },
  heroIconBox: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTextArea: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 27,
    lineHeight: 35,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  heroDescription: {
    marginTop: 5,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: "800",
    color: "#FFF7ED",
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  summaryMiniCard: {
    flex: 1,
    minHeight: 86,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  summaryMiniLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: MUTED,
  },
  summaryMiniValue: {
    marginTop: 4,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "900",
    color: TEXT,
  },
  calendarCard: {
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 4,
  },
  calendarHeaderRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  monthButton: {
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: ORANGE_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarMonthLabel: {
    fontSize: 24,
    lineHeight: 31,
    fontWeight: "900",
    color: TEXT,
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "900",
    color: MUTED,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 8,
  },
  calendarDayCell: {
    width: "14.28%",
    minHeight: 62,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "transparent",
  },
  calendarDayCellMuted: {
    opacity: 0.42,
  },
  calendarDayCellToday: {
    borderColor: ORANGE,
    backgroundColor: ORANGE_PALE,
  },
  calendarDayCellSelected: {
    backgroundColor: ORANGE_DARK,
    borderColor: ORANGE_DARK,
    opacity: 1,
  },
  calendarDayText: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
    color: TEXT,
  },
  calendarDayTextMuted: {
    color: "#94A3B8",
  },
  calendarDayTextToday: {
    color: ORANGE_DARK,
  },
  calendarDayTextSelected: {
    color: "#FFFFFF",
  },
  scheduleCountPill: {
    minWidth: 22,
    minHeight: 20,
    borderRadius: 999,
    marginTop: 4,
    paddingHorizontal: 6,
    backgroundColor: ORANGE_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  scheduleCountPillSelected: {
    backgroundColor: "#FFFFFF",
  },
  scheduleCountText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
    color: ORANGE_DARK,
  },
  scheduleCountTextSelected: {
    color: ORANGE_DARK,
  },
  emptyDayMarker: {
    width: 22,
    height: 20,
    marginTop: 4,
  },
  stateCard: {
    minHeight: 110,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  stateText: {
    fontSize: 16,
    lineHeight: 23,
    color: MUTED,
    fontWeight: "800",
    textAlign: "center",
  },
  errorCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    color: "#B91C1C",
    fontWeight: "800",
  },
  scheduleSection: {
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: "900",
    color: TEXT,
  },
  sectionCount: {
    minHeight: 40,
    borderRadius: 999,
    backgroundColor: ORANGE_SOFT,
    paddingHorizontal: 16,
    textAlignVertical: "center",
    fontSize: 17,
    lineHeight: 40,
    fontWeight: "900",
    color: ORANGE_DARK,
  },
  emptyScheduleCard: {
    minHeight: 148,
    borderRadius: 26,
    backgroundColor: ORANGE_PALE,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 22,
    justifyContent: "center",
  },
  emptyScheduleTitle: {
    marginTop: 10,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "900",
    color: TEXT,
  },
  emptyScheduleText: {
    marginTop: 6,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: "800",
    color: MUTED,
  },
  scheduleCard: {
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 20,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  scheduleTimePill: {
    alignSelf: "flex-start",
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: ORANGE_SOFT,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scheduleTimeText: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    color: ORANGE_DARK,
  },
  scheduleTitle: {
    marginTop: 16,
    fontSize: 25,
    lineHeight: 34,
    color: TEXT,
    fontWeight: "900",
  },
  scheduleDescription: {
    marginTop: 8,
    fontSize: 17,
    lineHeight: 25,
    color: MUTED,
    fontWeight: "700",
  },
  scheduleBottomRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  scheduleType: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "900",
    color: MUTED,
  },
  scheduleStatus: {
    minHeight: 36,
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 14,
    textAlignVertical: "center",
    fontSize: 15,
    lineHeight: 36,
    color: "#047857",
    fontWeight: "900",
  },
});

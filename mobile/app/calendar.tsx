import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { loadAuthSession } from "@/services/authSession";
import { getSchedules, ScheduleItem } from "@/services/schedules";

type ViewerRole = "parent" | "guardian";

const CALENDAR_THEME: Record<
  ViewerRole,
  {
    screenBg: string;
    accent: string;
    heroBg: string;
    heroBorder: string;
    cardBorder: string;
    heroLabel: string;
    heroTitle: string;
    heroDescription: string;
  }
> = {
  parent: {
    screenBg: "#F5F7FB",
    accent: "#2563EB",
    heroBg: "#EEF4FF",
    heroBorder: "#DBEAFE",
    cardBorder: "#D9E5FF",
    heroLabel: "내 일정 확인",
    heroTitle: "오늘 일정과 예정 일정을 확인해요.",
    heroDescription: "등록된 일정만 모아서 보여드리고, 일정이 없으면 바로 안내해드려요.",
  },
  guardian: {
    screenBg: "#F1F1F1",
    accent: "#05B547",
    heroBg: "#EEFDF3",
    heroBorder: "#CDEFD8",
    cardBorder: "#DDE4E8",
    heroLabel: "보호자 일정 확인",
    heroTitle: "부모님 오늘 일정과 예정 일정을 확인해요.",
    heroDescription: "등록된 일정만 모아서 보여드리고, 일정이 없으면 빈 상태로 안내합니다.",
  },
};

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
  );

  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<ViewerRole>(
    requestedViewerRole ?? "parent"
  );

  const loadSchedulesData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      let scheduleOwnerId = scheduleOwnerIdParam;
      let resolvedViewerRole: ViewerRole = requestedViewerRole ?? "parent";

      if (!scheduleOwnerId) {
        const session = await loadAuthSession();
        console.log("[CalendarPage] session =", session);

        if (session?.role === "parent") {
          scheduleOwnerId = session.elderUserId || session.parentId || "";
          resolvedViewerRole = "parent";
        } else if (session?.role === "guardian") {
          scheduleOwnerId = session.parentId || "";
          resolvedViewerRole = "guardian";
        }
      }

      setViewerRole(resolvedViewerRole);

      console.log("[CalendarPage] final scheduleOwnerId =", scheduleOwnerId);

      if (!scheduleOwnerId) {
        setSchedules([]);
        setError("조회할 senior_user_id를 찾지 못했습니다.");
        return;
      }

      const items = await getSchedules(scheduleOwnerId);
      console.log("[CalendarPage] schedules response =", items);

      setSchedules(items);
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
    }
  }, [requestedViewerRole, scheduleOwnerIdParam]);

  useFocusEffect(
    useCallback(() => {
      void loadSchedulesData();
    }, [loadSchedulesData])
  );

  const theme = CALENDAR_THEME[viewerRole];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.screenBg }]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity
            style={[styles.iconButton, { borderColor: theme.cardBorder }]}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={22} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>일정 보기</Text>
          <View style={styles.topBarSpacer} />
        </View>

        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: theme.heroBg,
              borderColor: theme.heroBorder,
            },
          ]}
        >
          <Text style={[styles.heroLabel, { color: theme.accent }]}>
            {theme.heroLabel}
          </Text>
          <Text style={styles.heroTitle}>{theme.heroTitle}</Text>
          <Text style={styles.heroDescription}>
            {theme.heroDescription}
          </Text>
        </View>

        {isLoading ? (
          <View style={[styles.stateCard, { borderColor: theme.cardBorder }]}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={styles.stateText}>일정을 불러오는 중입니다.</Text>
          </View>
        ) : null}

        {!isLoading && error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!isLoading && !error && schedules.length === 0 ? (
          <View style={[styles.stateCard, { borderColor: theme.cardBorder }]}>
            <Text style={styles.stateText}>등록된 일정이 없습니다.</Text>
          </View>
        ) : null}

        {!isLoading &&
          !error &&
          schedules.map((schedule, index) => {
            const dateText = formatDate(schedule.scheduled_at);
            const timeText = formatTime(schedule.scheduled_at);
            const visibleDescription = getVisibleScheduleDescription(
              schedule.description
            );

            return (
              <View
                key={`${schedule.id ?? index}-${schedule.scheduled_at}-${schedule.title}`}
                style={[styles.scheduleCard, { borderColor: theme.cardBorder }]}
              >
                <Text style={[styles.scheduleTime, { color: theme.accent }]}>
                  {dateText} · {timeText}
                </Text>

                <Text style={styles.scheduleTitle}>{schedule.title}</Text>

                {visibleDescription ? (
                  <Text style={styles.scheduleDescription}>
                    {visibleDescription}
                  </Text>
                ) : null}

                <Text style={styles.scheduleStatus}>
                  {formatStatus(schedule.status)}
                </Text>
              </View>
            );
          })}

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={[styles.backButtonText, { color: theme.accent }]}>
            이전으로
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(isoString: string) {
  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return isoString;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatTime(isoString: string) {
  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
}

function formatStatus(status: string) {
  if (status === "scheduled") return "예정된 일정";
  if (status === "completed") return "완료된 일정";
  if (status === "cancelled") return "취소된 일정";
  return status;
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
  },
  container: {
    padding: 20,
    paddingBottom: 36,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  topTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  topBarSpacer: {
    width: 42,
    height: 42,
  },
  heroCard: {
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    marginBottom: 18,
  },
  heroLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
  heroTitle: {
    marginTop: 6,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "800",
    color: "#111827",
  },
  heroDescription: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: "#374151",
    fontWeight: "600",
  },
  stateCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
  },
  stateText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#6B7280",
    fontWeight: "600",
    textAlign: "center",
  },
  errorCard: {
    backgroundColor: "#FEE2E2",
    borderRadius: 18,
    padding: 20,
  },
  errorText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#B91C1C",
  },
  scheduleCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
  },
  scheduleTime: {
    fontSize: 14,
    marginBottom: 8,
    fontWeight: "700",
  },
  scheduleTitle: {
    fontSize: 20,
    color: "#111827",
    fontWeight: "700",
  },
  scheduleDescription: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: "#4B5563",
  },
  scheduleStatus: {
    marginTop: 10,
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "600",
  },
  backButton: {
    marginTop: 24,
    alignItems: "center",
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});

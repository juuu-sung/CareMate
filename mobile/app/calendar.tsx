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

import { loadAuthSession } from "@/services/authSession";
import { getSchedules, ScheduleItem } from "@/services/schedules";

export default function CalendarPage() {
  const router = useRouter();
  const params = useLocalSearchParams();

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

  const loadSchedulesData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      let scheduleOwnerId = scheduleOwnerIdParam;

      if (!scheduleOwnerId) {
        const session = await loadAuthSession();
        console.log("[CalendarPage] session =", session);

        if (session?.role === "parent") {
          scheduleOwnerId = session.elderUserId || session.parentId || "";
        } else if (session?.role === "guardian") {
          scheduleOwnerId = session.parentId || "";
        }
      }

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
  }, [scheduleOwnerIdParam]);

  useFocusEffect(
    useCallback(() => {
      void loadSchedulesData();
    }, [loadSchedulesData])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>일정 보기</Text>
        <Text style={styles.description}>
          등록된 일정을 불러와 보여드립니다.
        </Text>

        {isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text style={styles.stateText}>일정을 불러오는 중입니다.</Text>
          </View>
        ) : null}

        {!isLoading && error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!isLoading && !error && schedules.length === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateText}>등록된 일정이 없습니다.</Text>
          </View>
        ) : null}

        {!isLoading &&
          !error &&
          schedules.map((schedule, index) => {
            const dateText = formatDate(schedule.scheduled_at);
            const timeText = formatTime(schedule.scheduled_at);

            return (
              <View
                key={`${schedule.id ?? index}-${schedule.scheduled_at}-${schedule.title}`}
                style={styles.scheduleCard}
              >
                <Text style={styles.scheduleTime}>
                  {dateText} · {timeText}
                </Text>

                <Text style={styles.scheduleTitle}>{schedule.title}</Text>

                {schedule.description ? (
                  <Text style={styles.scheduleDescription}>
                    {schedule.description}
                  </Text>
                ) : null}

                <Text style={styles.scheduleStatus}>
                  {formatStatus(schedule.status)}
                </Text>
              </View>
            );
          })}

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>이전으로</Text>
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#EEF4FF",
  },
  container: {
    padding: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    lineHeight: 25,
    color: "#475569",
    marginBottom: 20,
  },
  stateCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    gap: 12,
  },
  stateText: {
    fontSize: 16,
    color: "#475569",
  },
  errorCard: {
    backgroundColor: "#FEE2E2",
    borderRadius: 20,
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
  },
  scheduleTime: {
    fontSize: 14,
    color: "#3B82F6",
    marginBottom: 8,
    fontWeight: "700",
  },
  scheduleTitle: {
    fontSize: 20,
    color: "#0F172A",
    fontWeight: "700",
  },
  scheduleDescription: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: "#475569",
  },
  scheduleStatus: {
    marginTop: 10,
    fontSize: 14,
    color: "#64748B",
  },
  backButton: {
    marginTop: 24,
    alignItems: "center",
  },
  backButtonText: {
    fontSize: 16,
    color: "#64748B",
    fontWeight: "600",
  },
});
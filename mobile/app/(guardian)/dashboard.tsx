import { Link } from "expo-router";
import { startTransition, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SectionCard } from "@/components/common/SectionCard";
import { SeniorScreen } from "@/components/common/SeniorScreen";
import { getGuardianDashboard } from "@/services/guardian";
import { GuardianDashboard } from "@/types/guardian";

export default function GuardianDashboardScreen() {
  const [dashboard, setDashboard] = useState<GuardianDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    try {
      const data = await getGuardianDashboard();
      startTransition(() => {
        setDashboard(data);
      });
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "대시보드 데이터를 불러오지 못했습니다.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SeniorScreen title="보호자 대시보드" subtitle="대상자의 상태 요약과 최근 이상 징후를 확인하는 화면입니다.">
      <SectionCard title="오늘 상태 요약" description="체크인 응답, 알림 미응답, 최신 위치 상태를 요약합니다.">
        {loading ? <Text style={styles.value}>불러오는 중...</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {dashboard ? (
          <View style={styles.summaryList}>
            <Text style={styles.value}>현재 모드: {dashboard.care_mode}</Text>
            <Text style={styles.value}>체크인 상태: {dashboard.check_in_status}</Text>
            <Text style={styles.value}>열린 알림: {dashboard.open_alert_count}건</Text>
            <Text style={styles.value}>미확인 복약: {dashboard.today_medication_pending_count}건</Text>
            <Text style={styles.value}>남은 일정: {dashboard.today_schedule_count}건</Text>
            <Text style={styles.value}>최신 위치: {dashboard.latest_location_label}</Text>
            <Text style={styles.caption}>위치 갱신 시각: {dashboard.latest_location_captured_at}</Text>
          </View>
        ) : null}
        <Pressable onPress={() => void loadDashboard()} style={styles.refreshButton}>
          <Text style={styles.refreshButtonText}>새로고침</Text>
        </Pressable>
      </SectionCard>
      <SectionCard title="바로가기" description="핵심 관리 화면으로 빠르게 이동합니다.">
        <Link href="/(guardian)/alerts">
          <Text style={styles.link}>알림 이력</Text>
        </Link>
        <Link href="/(guardian)/location">
          <Text style={styles.link}>위치 확인</Text>
        </Link>
        <Link href="/(guardian)/modes">
          <Text style={styles.link}>돌봄 모드 설정</Text>
        </Link>
      </SectionCard>
    </SeniorScreen>
  );
}

const styles = StyleSheet.create({
  summaryList: {
    gap: 8,
  },
  value: {
    fontSize: 18,
    lineHeight: 26,
    color: "#1f2a1f",
  },
  caption: {
    fontSize: 15,
    lineHeight: 22,
    color: "#617160",
  },
  error: {
    fontSize: 16,
    lineHeight: 22,
    color: "#a33a2b",
  },
  refreshButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#2f5d50",
  },
  refreshButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fffdf8",
  },
  link: {
    fontSize: 18,
    lineHeight: 26,
    color: "#24584c",
  },
});

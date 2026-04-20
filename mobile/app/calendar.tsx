import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { loadAuthSession } from '@/services/authSession';
import { getSchedules, ScheduleItem } from '@/services/schedules';

export default function CalendarPage() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const elderUserIdParam = String(
    params.elderUserId || params.elder_user_id || params.parentId || ''
  );
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadSchedules = async () => {
      try {
        let elderUserId = elderUserIdParam;

        if (!elderUserId) {
          const session = await loadAuthSession();
          if (session?.role === 'parent') {
            elderUserId = session.elderUserId || session.parentId;
          }
        }

        const items = await getSchedules(elderUserId);
        if (!mounted) {
          return;
        }
        setSchedules(items);
      } catch (loadError) {
        if (!mounted) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : '일정 조회 중 오류가 발생했습니다.');
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void loadSchedules();

    return () => {
      mounted = false;
    };
  }, [elderUserIdParam]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>일정 보기</Text>
        <Text style={styles.description}>서버 일정 API를 바로 읽어서 오늘 일정을 보여줍니다.</Text>

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
            <Text style={styles.stateText}>오늘 등록된 일정이 없습니다.</Text>
          </View>
        ) : null}

        {!isLoading &&
          !error &&
          schedules.map((schedule, index) => (
            <View key={`${schedule.date}-${schedule.time}-${schedule.title}-${index}`} style={styles.scheduleCard}>
              <Text style={styles.scheduleTime}>
                {schedule.date} · {schedule.time}
              </Text>
              <Text style={styles.scheduleTitle}>{schedule.title}</Text>
              <Text style={styles.scheduleStatus}>{formatStatus(schedule.status)}</Text>
            </View>
          ))}

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>이전으로</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EEF4FF',
  },
  container: {
    padding: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    lineHeight: 25,
    color: '#475569',
    marginBottom: 20,
  },
  stateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  stateText: {
    fontSize: 16,
    color: '#475569',
  },
  errorCard: {
    backgroundColor: '#FEE2E2',
    borderRadius: 20,
    padding: 20,
  },
  errorText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#B91C1C',
  },
  scheduleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
  },
  scheduleTime: {
    fontSize: 14,
    color: '#3B82F6',
    marginBottom: 8,
    fontWeight: '700',
  },
  scheduleTitle: {
    fontSize: 20,
    color: '#0F172A',
    fontWeight: '700',
  },
  scheduleStatus: {
    marginTop: 10,
    fontSize: 14,
    color: '#64748B',
  },
  backButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '600',
  },
});

function formatStatus(status: string) {
  if (status === 'scheduled') {
    return '예정된 일정';
  }
  return status;
}

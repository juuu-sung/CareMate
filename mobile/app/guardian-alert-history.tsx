import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';

import { getGuardianAlertHistory, GuardianAlertItem } from '@/services/guardian';

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthKey(value: string) {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, 1);
}

function formatCalendarMonthLabel(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function getDateDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function getAlertDayKey(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return getDateDayKey(date);
}

function formatAlertDateTitle(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatAlertTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '기록 없음';
  }

  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const meridiem = hours >= 12 ? '오후' : '오전';
  const hour12 = hours % 12 || 12;
  return `${meridiem} ${hour12}:${minutes}`;
}

function buildAlertMonthOptions(items: GuardianAlertItem[]) {
  const seen = new Set<string>();
  const months: string[] = [];

  items.forEach((item) => {
    const date = new Date(item.created_at);
    if (Number.isNaN(date.getTime())) {
      return;
    }

    const key = formatMonthKey(date);
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    months.push(key);
  });

  months.sort((left, right) => (left < right ? 1 : -1));
  return months;
}

function buildCalendarDays(monthDate: Date, items: GuardianAlertItem[]) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const availableDayKeys = new Set(items.map((item) => getAlertDayKey(item.created_at)).filter(Boolean));
  const days: Array<{ key: string; dayNumber: number; hasItems: boolean } | null> = [];

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const currentDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    const key = getDateDayKey(currentDate);
    days.push({
      key,
      dayNumber: day,
      hasItems: availableDayKeys.has(key),
    });
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

function getAlertStatusLabel(status: GuardianAlertItem['status']) {
  if (status === 'resolved') {
    return '확인 완료';
  }

  if (status === 'acknowledged') {
    return '처리 중';
  }

  return '새 알림';
}

function getAlertStatusStyle(status: GuardianAlertItem['status']) {
  if (status === 'resolved') {
    return {
      container: styles.historyStatusResolved,
      text: styles.historyStatusResolvedText,
    };
  }

  if (status === 'acknowledged') {
    return {
      container: styles.historyStatusAcknowledged,
      text: styles.historyStatusAcknowledgedText,
    };
  }

  return {
    container: styles.historyStatusOpen,
    text: styles.historyStatusOpenText,
  };
}

export default function GuardianAlertHistoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parentId = String(params.parentId || params.elderUserId || '');
  const parentName = String(params.parentName || '부모님');
  const linkCode = String(params.linkCode || '');

  const [alerts, setAlerts] = React.useState<GuardianAlertItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [selectedHistoryDay, setSelectedHistoryDay] = React.useState<string>('all');
  const [selectedCalendarMonth, setSelectedCalendarMonth] = React.useState(() =>
    startOfMonth(new Date())
  );

  const loadAlertHistory = React.useCallback(
    async (manualRefresh = false) => {
      if (!parentId || !linkCode) {
        setAlerts([]);
        setError('연동 정보가 없어 알림 기록을 불러올 수 없어요.');
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (manualRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const result = await getGuardianAlertHistory(parentId, linkCode, 120);
        setAlerts(result.items);
        setError(null);
      } catch (loadError) {
        console.log('보호자 알림 기록 조회 오류:', loadError);
        setAlerts([]);
        setError('알림 기록을 불러오지 못했어요.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [linkCode, parentId]
  );

  useFocusEffect(
    React.useCallback(() => {
      void loadAlertHistory();
      return undefined;
    }, [loadAlertHistory])
  );

  const calendarMonths = React.useMemo(() => buildAlertMonthOptions(alerts), [alerts]);
  const selectedCalendarMonthKey = formatMonthKey(selectedCalendarMonth);
  const activeMonthIndex = calendarMonths.findIndex((monthKey) => monthKey === selectedCalendarMonthKey);
  const visibleCalendarMonth =
    activeMonthIndex >= 0
      ? selectedCalendarMonth
      : calendarMonths[0]
        ? parseMonthKey(calendarMonths[0])
        : selectedCalendarMonth;
  const calendarDays = React.useMemo(
    () => buildCalendarDays(visibleCalendarMonth, alerts),
    [alerts, visibleCalendarMonth]
  );
  const visibleAlerts = React.useMemo(
    () =>
      selectedHistoryDay === 'all'
        ? alerts
        : alerts.filter((item) => getAlertDayKey(item.created_at) === selectedHistoryDay),
    [alerts, selectedHistoryDay]
  );

  React.useEffect(() => {
    if (calendarMonths.length === 0) {
      const currentMonth = startOfMonth(new Date());
      if (formatMonthKey(currentMonth) !== selectedCalendarMonthKey) {
        setSelectedCalendarMonth(currentMonth);
      }
      return;
    }

    if (!calendarMonths.includes(selectedCalendarMonthKey)) {
      setSelectedCalendarMonth(parseMonthKey(calendarMonths[0]));
    }
  }, [calendarMonths, selectedCalendarMonthKey]);

  React.useEffect(() => {
    if (selectedHistoryDay === 'all') {
      return;
    }

    const exists = alerts.some((item) => getAlertDayKey(item.created_at) === selectedHistoryDay);
    if (!exists) {
      setSelectedHistoryDay('all');
    }
  }, [alerts, selectedHistoryDay]);

  const groupedAlerts = React.useMemo(() => {
    const groups = new Map<string, { title: string; items: GuardianAlertItem[] }>();

    visibleAlerts.forEach((item) => {
      const key = getAlertDayKey(item.created_at);
      const title = formatAlertDateTitle(item.created_at);
      const current = groups.get(key);

      if (current) {
        current.items.push(item);
        return;
      }

      groups.set(key, {
        title,
        items: [item],
      });
    });

    return Array.from(groups.entries()).map(([key, value]) => ({
      key,
      title: value.title,
      items: value.items,
    }));
  }, [visibleAlerts]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadAlertHistory(true)}
            tintColor="#05B547"
          />
        }
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>알림 기록</Text>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => void loadAlertHistory(true)}
          >
            <Ionicons name="refresh" size={20} color="#111827" />
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>지난 알림 기록</Text>
          <Text style={styles.heroName}>{parentName} 님</Text>
          <Text style={styles.heroDescription}>달력에서 날짜를 골라 그날 온 알림을 확인할 수 있어요.</Text>
        </View>

        <View style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <View>
              <Text style={styles.historyTitle}>알림 기록</Text>
              <Text style={styles.historySubtitle}>날짜별로 어떤 알림이 왔는지 확인할 수 있어요.</Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{alerts.length}개</Text>
            </View>
          </View>

          {!isLoading && !error && alerts.length > 0 ? (
            <View style={styles.filterCard}>
              <View style={styles.filterHeaderRow}>
                <Text style={styles.filterTitle}>날짜 선택</Text>
                <TouchableOpacity
                  style={[
                    styles.allHistoryButton,
                    selectedHistoryDay === 'all' && styles.allHistoryButtonActive,
                  ]}
                  onPress={() => setSelectedHistoryDay('all')}
                >
                  <Text
                    style={[
                      styles.allHistoryButtonText,
                      selectedHistoryDay === 'all' && styles.allHistoryButtonTextActive,
                    ]}
                  >
                    전체 보기
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.calendarHeaderRow}>
                <TouchableOpacity
                  style={[
                    styles.calendarNavButton,
                    activeMonthIndex <= 0 && styles.calendarNavButtonDisabled,
                  ]}
                  onPress={() => {
                    if (activeMonthIndex > 0) {
                      setSelectedHistoryDay('all');
                      setSelectedCalendarMonth(parseMonthKey(calendarMonths[activeMonthIndex - 1]));
                    }
                  }}
                  disabled={activeMonthIndex <= 0}
                >
                  <Text style={styles.calendarNavText}>이전</Text>
                </TouchableOpacity>

                <Text style={styles.calendarMonthLabel}>
                  {formatCalendarMonthLabel(visibleCalendarMonth)}
                </Text>

                <TouchableOpacity
                  style={[
                    styles.calendarNavButton,
                    (activeMonthIndex < 0 || activeMonthIndex >= calendarMonths.length - 1) &&
                      styles.calendarNavButtonDisabled,
                  ]}
                  onPress={() => {
                    if (activeMonthIndex >= 0 && activeMonthIndex < calendarMonths.length - 1) {
                      setSelectedHistoryDay('all');
                      setSelectedCalendarMonth(parseMonthKey(calendarMonths[activeMonthIndex + 1]));
                    }
                  }}
                  disabled={activeMonthIndex < 0 || activeMonthIndex >= calendarMonths.length - 1}
                >
                  <Text style={styles.calendarNavText}>다음</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.weekdayRow}>
                {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                  <Text key={day} style={styles.weekdayLabel}>
                    {day}
                  </Text>
                ))}
              </View>

              <View style={styles.calendarGrid}>
                {calendarDays.map((day, index) =>
                  day ? (
                    <TouchableOpacity
                      key={day.key}
                      style={[
                        styles.calendarDayCell,
                        !day.hasItems && styles.calendarDayCellDisabled,
                        selectedHistoryDay === day.key && styles.calendarDayCellActive,
                      ]}
                      onPress={() => {
                        if (day.hasItems) {
                          setSelectedHistoryDay(day.key);
                        }
                      }}
                      disabled={!day.hasItems}
                    >
                      <Text
                        style={[
                          styles.calendarDayText,
                          !day.hasItems && styles.calendarDayTextDisabled,
                          selectedHistoryDay === day.key && styles.calendarDayTextActive,
                        ]}
                      >
                        {day.dayNumber}
                      </Text>
                      {day.hasItems ? <View style={styles.calendarDayDot} /> : null}
                    </TouchableOpacity>
                  ) : (
                    <View key={`empty-${index}`} style={styles.calendarDaySpacer} />
                  )
                )}
              </View>
            </View>
          ) : null}

          {isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="small" color="#05B547" />
              <Text style={styles.stateText}>알림 기록을 불러오는 중입니다.</Text>
            </View>
          ) : error ? (
            <View style={styles.stateCard}>
              <Feather name="alert-circle" size={22} color="#DC2626" />
              <Text style={styles.stateTitle}>알림 기록 조회 실패</Text>
              <Text style={styles.stateText}>{error}</Text>
            </View>
          ) : groupedAlerts.length === 0 ? (
            <View style={styles.stateCard}>
              <Ionicons name="notifications-off-outline" size={22} color="#6B7280" />
              <Text style={styles.stateTitle}>기록된 알림이 없습니다</Text>
              <Text style={styles.stateText}>알림이 생기면 날짜별 기록으로 여기에 쌓입니다.</Text>
            </View>
          ) : (
            groupedAlerts.map((group) => (
              <View key={group.key} style={styles.groupCard}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                {group.items.map((item, index) => {
                  const statusStyle = getAlertStatusStyle(item.status);

                  return (
                    <View
                      key={`${item.id || item.type}-${item.created_at}-${index}`}
                      style={[styles.historyItem, index !== group.items.length - 1 && styles.withDivider]}
                    >
                      <View style={styles.historyItemHeader}>
                        <Text style={styles.historyItemTime}>{formatAlertTime(item.created_at)}</Text>
                        <View style={[styles.historyStatusBadge, statusStyle.container]}>
                          <Text style={[styles.historyStatusText, statusStyle.text]}>
                            {getAlertStatusLabel(item.status)}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.historyMessage}>{item.message}</Text>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  container: {
    padding: 20,
    paddingBottom: 36,
    backgroundColor: '#F3F4F6',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  topTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 18,
  },
  heroLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F97316',
  },
  heroName: {
    marginTop: 6,
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  heroDescription: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: '#374151',
    fontWeight: '600',
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  historySubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },
  countBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFF7ED',
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F97316',
  },
  filterCard: {
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    padding: 14,
    marginBottom: 14,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  filterTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  allHistoryButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#E5E7EB',
  },
  allHistoryButtonActive: {
    backgroundColor: '#05B547',
  },
  allHistoryButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#374151',
  },
  allHistoryButtonTextActive: {
    color: '#FFFFFF',
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  calendarNavButton: {
    minWidth: 54,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  calendarNavButtonDisabled: {
    opacity: 0.45,
  },
  calendarNavText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#374151',
  },
  calendarMonthLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    marginBottom: 8,
  },
  calendarDayCellDisabled: {
    opacity: 0.35,
  },
  calendarDayCellActive: {
    backgroundColor: '#05B547',
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  calendarDayTextDisabled: {
    color: '#CBD5E1',
  },
  calendarDayTextActive: {
    color: '#FFFFFF',
  },
  calendarDayDot: {
    marginTop: 4,
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#05B547',
  },
  calendarDaySpacer: {
    width: '14.2857%',
    aspectRatio: 1,
  },
  stateCard: {
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  stateText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
    fontWeight: '600',
    textAlign: 'center',
  },
  groupCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#F8FAFC',
    marginBottom: 12,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  historyItem: {
    paddingVertical: 10,
  },
  withDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  historyItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  historyItemTime: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  historyStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  historyStatusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  historyStatusOpen: {
    backgroundColor: '#FEF3C7',
  },
  historyStatusOpenText: {
    color: '#B45309',
  },
  historyStatusAcknowledged: {
    backgroundColor: '#E5E7EB',
  },
  historyStatusAcknowledgedText: {
    color: '#4B5563',
  },
  historyStatusResolved: {
    backgroundColor: '#DCFCE7',
  },
  historyStatusResolvedText: {
    color: '#15803D',
  },
  historyMessage: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: '#111827',
    fontWeight: '700',
  },
});

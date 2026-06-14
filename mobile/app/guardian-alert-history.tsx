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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { getGuardianAlertHistory, GuardianAlertItem } from '@/services/guardian';

const GREEN = '#05B547';
const GREEN_DARK = '#047D32';
const GREEN_SOFT = '#EEFDF3';
const BG = '#F1F5F9';
const TEXT = '#111827';
const MUTED = '#64748B';
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

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
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getAlertDayKey(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : getDateDayKey(date);
}

function formatAlertDateTitle(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${days[date.getDay()]}요일`;
}

function formatAlertTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '기록 없음';
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
    if (Number.isNaN(date.getTime())) return;
    const key = formatMonthKey(date);
    if (!seen.has(key)) { seen.add(key); months.push(key); }
  });
  months.sort((a, b) => (a < b ? 1 : -1));
  return months;
}

function buildCalendarDays(monthDate: Date, items: GuardianAlertItem[]) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const availableKeys = new Set(items.map((item) => getAlertDayKey(item.created_at)).filter(Boolean));
  const days: Array<{ key: string; dayNumber: number; hasItems: boolean } | null> = [];

  for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const key = getDateDayKey(new Date(monthDate.getFullYear(), monthDate.getMonth(), d));
    days.push({ key, dayNumber: d, hasItems: availableKeys.has(key) });
  }
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function getStatusLabel(status: GuardianAlertItem['status']) {
  if (status === 'resolved') return '확인 완료';
  if (status === 'acknowledged') return '처리 중';
  return '새 알림';
}

function getStatusColors(status: GuardianAlertItem['status']) {
  if (status === 'resolved') return { bg: '#DCFCE7', text: '#15803D' };
  if (status === 'acknowledged') return { bg: '#E5E7EB', text: '#4B5563' };
  return { bg: '#FEF3C7', text: '#B45309' };
}

function getAlertTypeIcon(type?: string) {
  if (type === 'medication') return <MaterialCommunityIcons name="pill" size={18} color="#7C3AED" />;
  if (type === 'location') return <Ionicons name="location-outline" size={18} color="#0EA5E9" />;
  if (type === 'check_in') return <Ionicons name="checkmark-circle-outline" size={18} color={GREEN} />;
  if (type === 'emergency') return <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />;
  return <Ionicons name="notifications-outline" size={18} color={MUTED} />;
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
  const [selectedDay, setSelectedDay] = React.useState<string>('all');
  const [selectedMonth, setSelectedMonth] = React.useState(() => startOfMonth(new Date()));

  const load = React.useCallback(async (manualRefresh = false) => {
    if (!parentId || !linkCode) {
      setAlerts([]);
      setError('연동 정보가 없어 알림 기록을 불러올 수 없어요.');
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }
    if (manualRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const result = await getGuardianAlertHistory(parentId, linkCode, 120);
      setAlerts(result.items);
      setError(null);
    } catch {
      setAlerts([]);
      setError('알림 기록을 불러오지 못했어요.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [linkCode, parentId]);

  useFocusEffect(React.useCallback(() => { void load(); return undefined; }, [load]));

  const calendarMonths = React.useMemo(() => buildAlertMonthOptions(alerts), [alerts]);
  const selectedMonthKey = formatMonthKey(selectedMonth);
  const activeMonthIndex = calendarMonths.findIndex((k) => k === selectedMonthKey);
  const visibleMonth = activeMonthIndex >= 0
    ? selectedMonth
    : calendarMonths[0] ? parseMonthKey(calendarMonths[0]) : selectedMonth;
  const calendarDays = React.useMemo(() => buildCalendarDays(visibleMonth, alerts), [alerts, visibleMonth]);

  const visibleAlerts = React.useMemo(
    () => selectedDay === 'all' ? alerts : alerts.filter((item) => getAlertDayKey(item.created_at) === selectedDay),
    [alerts, selectedDay],
  );

  const groupedAlerts = React.useMemo(() => {
    const groups = new Map<string, { title: string; items: GuardianAlertItem[] }>();
    visibleAlerts.forEach((item) => {
      const key = getAlertDayKey(item.created_at);
      const title = formatAlertDateTitle(item.created_at);
      const cur = groups.get(key);
      if (cur) { cur.items.push(item); }
      else { groups.set(key, { title, items: [item] }); }
    });
    return Array.from(groups.entries()).map(([key, value]) => ({ key, title: value.title, items: value.items }));
  }, [visibleAlerts]);

  React.useEffect(() => {
    if (calendarMonths.length === 0) return;
    if (!calendarMonths.includes(selectedMonthKey)) {
      setSelectedMonth(parseMonthKey(calendarMonths[0]));
    }
  }, [calendarMonths, selectedMonthKey]);

  React.useEffect(() => {
    if (selectedDay === 'all') return;
    if (!alerts.some((item) => getAlertDayKey(item.created_at) === selectedDay)) {
      setSelectedDay('all');
    }
  }, [alerts, selectedDay]);

  const openCount = alerts.filter((a) => a.status === 'open').length;
  const resolvedCount = alerts.filter((a) => a.status === 'resolved').length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.85} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>알림 기록</Text>
          <Text style={styles.headerSubtitle}>{parentName} 님의 알림 이력</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} activeOpacity={0.85} onPress={() => void load(true)}>
          <Ionicons name="refresh" size={18} color={GREEN_DARK} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void load(true)} tintColor={GREEN} />
        }
      >
        {/* 요약 통계 */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>전체</Text>
            <Text style={styles.statValue}>{alerts.length}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>미확인</Text>
            <Text style={[styles.statValue, openCount > 0 && { color: '#B45309' }]}>{openCount}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>확인 완료</Text>
            <Text style={[styles.statValue, { color: GREEN_DARK }]}>{resolvedCount}</Text>
          </View>
        </View>

        {/* 달력 필터 */}
        {!isLoading && !error && alerts.length > 0 && (
          <View style={styles.calendarCard}>
            <View style={styles.calendarTopRow}>
              <View style={styles.calendarNavRow}>
                <TouchableOpacity
                  style={[styles.monthNavButton, activeMonthIndex <= 0 && styles.monthNavButtonDisabled]}
                  onPress={() => {
                    if (activeMonthIndex > 0) {
                      setSelectedDay('all');
                      setSelectedMonth(parseMonthKey(calendarMonths[activeMonthIndex - 1]));
                    }
                  }}
                  disabled={activeMonthIndex <= 0}
                >
                  <Ionicons name="chevron-back" size={16} color={GREEN_DARK} />
                </TouchableOpacity>
                <Text style={styles.monthLabel}>{formatCalendarMonthLabel(visibleMonth)}</Text>
                <TouchableOpacity
                  style={[
                    styles.monthNavButton,
                    (activeMonthIndex < 0 || activeMonthIndex >= calendarMonths.length - 1) && styles.monthNavButtonDisabled,
                  ]}
                  onPress={() => {
                    if (activeMonthIndex >= 0 && activeMonthIndex < calendarMonths.length - 1) {
                      setSelectedDay('all');
                      setSelectedMonth(parseMonthKey(calendarMonths[activeMonthIndex + 1]));
                    }
                  }}
                  disabled={activeMonthIndex < 0 || activeMonthIndex >= calendarMonths.length - 1}
                >
                  <Ionicons name="chevron-forward" size={16} color={GREEN_DARK} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.allButton, selectedDay === 'all' && styles.allButtonActive]}
                onPress={() => setSelectedDay('all')}
              >
                <Text style={[styles.allButtonText, selectedDay === 'all' && styles.allButtonTextActive]}>전체</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((label) => (
                <Text key={label} style={styles.weekdayLabel}>{label}</Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarDays.map((day, idx) =>
                day ? (
                  <TouchableOpacity
                    key={day.key}
                    style={[
                      styles.dayCell,
                      !day.hasItems && styles.dayCellDisabled,
                      selectedDay === day.key && styles.dayCellSelected,
                    ]}
                    onPress={() => { if (day.hasItems) setSelectedDay(day.key); }}
                    disabled={!day.hasItems}
                    activeOpacity={0.75}
                  >
                    <Text style={[
                      styles.dayText,
                      !day.hasItems && styles.dayTextDisabled,
                      selectedDay === day.key && styles.dayTextSelected,
                    ]}>
                      {day.dayNumber}
                    </Text>
                    {day.hasItems ? (
                      <View style={[styles.dot, selectedDay === day.key && styles.dotSelected]} />
                    ) : (
                      <View style={styles.dotEmpty} />
                    )}
                  </TouchableOpacity>
                ) : (
                  <View key={`empty-${idx}`} style={styles.daySpacer} />
                )
              )}
            </View>
          </View>
        )}

        {/* 알림 목록 */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            {selectedDay === 'all' ? '전체 알림' : formatAlertDateTitle(`${selectedDay}T00:00:00`)}
          </Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{visibleAlerts.length}건</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="small" color={GREEN} />
            <Text style={styles.stateText}>알림 기록을 불러오는 중이에요</Text>
          </View>
        ) : error ? (
          <View style={[styles.stateBox, styles.errorBox]}>
            <Ionicons name="alert-circle-outline" size={20} color="#DC2626" />
            <Text style={[styles.stateText, { color: '#DC2626' }]}>{error}</Text>
          </View>
        ) : groupedAlerts.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="notifications-off-outline" size={28} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>기록된 알림이 없어요</Text>
            <Text style={styles.emptyDesc}>알림이 생기면 날짜별로 여기에 쌓여요.</Text>
          </View>
        ) : (
          <View style={styles.groupList}>
            {groupedAlerts.map((group) => (
              <View key={group.key}>
                <Text style={styles.groupDateLabel}>{group.title}</Text>
                <View style={styles.groupCard}>
                  {group.items.map((item, idx) => {
                    const sc = getStatusColors(item.status);
                    return (
                      <View
                        key={`${item.id || item.type}-${item.created_at}-${idx}`}
                        style={[styles.alertItem, idx !== group.items.length - 1 && styles.alertItemDivider]}
                      >
                        <View style={styles.alertIconWrap}>
                          {getAlertTypeIcon(item.type)}
                        </View>
                        <View style={styles.alertContent}>
                          <View style={styles.alertTopRow}>
                            <Text style={styles.alertTime}>{formatAlertTime(item.created_at)}</Text>
                            <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                              <Text style={[styles.statusBadgeText, { color: sc.text }]}>
                                {getStatusLabel(item.status)}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.alertMessage}>{item.message}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    backgroundColor: BG,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: TEXT },
  headerSubtitle: { marginTop: 2, fontSize: 13, color: MUTED, fontWeight: '600' },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GREEN_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },

  container: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },

  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  statLabel: { fontSize: 12, fontWeight: '700', color: MUTED },
  statValue: { fontSize: 22, fontWeight: '800', color: TEXT },

  calendarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    shadowColor: '#111827',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  calendarTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarNavRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthNavButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: GREEN_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavButtonDisabled: { opacity: 0.35 },
  monthLabel: { fontSize: 16, fontWeight: '800', color: TEXT },
  allButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
  },
  allButtonActive: { backgroundColor: GREEN },
  allButtonText: { fontSize: 12, fontWeight: '800', color: '#374151' },
  allButtonTextActive: { color: '#FFFFFF' },

  weekdayRow: { flexDirection: 'row', marginBottom: 6 },
  weekdayLabel: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: MUTED },

  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.28%',
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayCellDisabled: { opacity: 0.25 },
  dayCellSelected: { backgroundColor: GREEN, borderColor: GREEN },
  dayText: { fontSize: 14, fontWeight: '700', color: TEXT },
  dayTextDisabled: { color: '#CBD5E1' },
  dayTextSelected: { color: '#FFFFFF' },
  dot: { width: 5, height: 5, borderRadius: 999, backgroundColor: GREEN, marginTop: 3 },
  dotSelected: { backgroundColor: '#FFFFFF' },
  dotEmpty: { width: 5, height: 5, marginTop: 3 },
  daySpacer: { width: '14.28%', height: 38 },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: TEXT },
  countBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: GREEN_SOFT,
  },
  countBadgeText: { fontSize: 13, fontWeight: '800', color: GREEN_DARK },

  stateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  errorBox: {},
  stateText: { fontSize: 14, fontWeight: '600', color: MUTED },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 40,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: TEXT },
  emptyDesc: { fontSize: 13, color: MUTED, fontWeight: '600' },

  groupList: { gap: 20 },
  groupDateLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: MUTED,
    marginBottom: 8,
    paddingLeft: 4,
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    shadowColor: '#111827',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  alertItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    alignItems: 'flex-start',
  },
  alertItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  alertIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  alertContent: { flex: 1, gap: 6 },
  alertTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertTime: { fontSize: 12, fontWeight: '700', color: MUTED },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },
  alertMessage: { fontSize: 14, fontWeight: '700', color: TEXT, lineHeight: 21 },
});

import React, { useCallback, useMemo, useState } from 'react';
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
import { getSchedules, ScheduleItem } from '@/services/schedules';

const GREEN = '#05B547';
const GREEN_DARK = '#047D32';
const GREEN_SOFT = '#EEFDF3';
const BG = '#F1F5F9';
const TEXT = '#111827';
const MUTED = '#64748B';
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

type CalendarDay = {
  key: string;
  date: Date;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  schedules: ScheduleItem[];
};

export default function GuardianCalendarScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parentId = String(params.parentId || params.elderUserId || '').trim();
  const parentName = String(params.parentName || '부모님').trim();

  const todayKey = useMemo(() => getDateKey(new Date()), []);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState(todayKey);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const load = useCallback(async (manualRefresh = false) => {
    if (!parentId) {
      setError('연동 정보가 없어요.');
      setIsLoading(false);
      return;
    }
    if (manualRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const items = await getSchedules(parentId);
      setSchedules(sortByTime(items));
      setError(null);
    } catch {
      setSchedules([]);
      setError('일정을 불러오지 못했어요.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [parentId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const schedulesByDay = useMemo(() => groupByDay(schedules), [schedules]);
  const selectedSchedules = schedulesByDay.get(selectedDayKey) ?? [];
  const todaySchedules = schedulesByDay.get(todayKey) ?? [];
  const calendarDays = useMemo(
    () => buildCalendarDays(visibleMonth, selectedDayKey, schedulesByDay),
    [schedulesByDay, selectedDayKey, visibleMonth],
  );

  const selectedDate = useMemo(() => parseDateKey(selectedDayKey), [selectedDayKey]);

  const moveMonth = (amount: number) => {
    setVisibleMonth((cur) => {
      const next = new Date(cur.getFullYear(), cur.getMonth() + amount, 1);
      setSelectedDayKey(getDateKey(next));
      return next;
    });
  };

  const handleSelectDay = (day: CalendarDay) => {
    setSelectedDayKey(day.key);
    if (!day.inCurrentMonth) {
      setVisibleMonth(new Date(day.date.getFullYear(), day.date.getMonth(), 1));
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.85} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>오늘 일정</Text>
          <Text style={styles.headerSubtitle}>{parentName} 님의 날짜별 일정</Text>
        </View>
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
          <StatChip label="오늘" value={`${todaySchedules.length}건`} />
          <StatChip label="선택한 날" value={`${selectedSchedules.length}건`} />
          <StatChip label="전체" value={`${schedules.length}건`} />
        </View>

        {/* 달력 */}
        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <TouchableOpacity style={styles.monthButton} onPress={() => moveMonth(-1)} activeOpacity={0.8}>
              <Ionicons name="chevron-back" size={18} color={GREEN_DARK} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{formatMonthLabel(visibleMonth)}</Text>
            <TouchableOpacity style={styles.monthButton} onPress={() => moveMonth(1)} activeOpacity={0.8}>
              <Ionicons name="chevron-forward" size={18} color={GREEN_DARK} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label) => (
              <Text key={label} style={styles.weekdayLabel}>{label}</Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendarDays.map((day) => (
              <TouchableOpacity
                key={day.key}
                style={[
                  styles.dayCell,
                  !day.inCurrentMonth && styles.dayCellMuted,
                  day.isToday && styles.dayCellToday,
                  day.isSelected && styles.dayCellSelected,
                ]}
                onPress={() => handleSelectDay(day)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.dayText,
                    !day.inCurrentMonth && styles.dayTextMuted,
                    day.isToday && styles.dayTextToday,
                    day.isSelected && styles.dayTextSelected,
                  ]}
                >
                  {day.dayNumber}
                </Text>
                {day.schedules.length > 0 ? (
                  <View style={[styles.dot, day.isSelected && styles.dotSelected]} />
                ) : (
                  <View style={styles.dotEmpty} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 선택 날짜 일정 */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{formatDateLabel(selectedDate)}</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{selectedSchedules.length}건</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="small" color={GREEN} />
            <Text style={styles.stateText}>일정을 불러오는 중이에요</Text>
          </View>
        ) : error ? (
          <View style={[styles.stateBox, styles.errorBox]}>
            <Ionicons name="alert-circle-outline" size={20} color="#DC2626" />
            <Text style={[styles.stateText, { color: '#DC2626' }]}>{error}</Text>
          </View>
        ) : selectedSchedules.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={28} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>이 날은 일정이 없어요</Text>
            <Text style={styles.emptyDesc}>다른 날짜를 선택해 보세요.</Text>
          </View>
        ) : (
          <View style={styles.scheduleList}>
            {selectedSchedules.map((item, idx) => (
              <ScheduleCard key={`${item.id ?? idx}-${item.scheduled_at}`} item={item} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statChip}>
      <Text style={styles.statChipLabel}>{label}</Text>
      <Text style={styles.statChipValue}>{value}</Text>
    </View>
  );
}

function ScheduleCard({ item }: { item: ScheduleItem }) {
  const desc = getVisibleDesc(item.description);
  const status = item.status as string;

  return (
    <View style={styles.scheduleCard}>
      <View style={styles.scheduleCardLeft}>
        <View style={[styles.scheduleTypePill, { backgroundColor: typeColor(item.type) + '18' }]}>
          <Text style={[styles.scheduleTypeText, { color: typeColor(item.type) }]}>
            {formatType(item.type)}
          </Text>
        </View>
        <Text style={styles.scheduleTime}>{getTimeLabel(item)}</Text>
      </View>
      <View style={styles.scheduleCardRight}>
        <View style={styles.scheduleTitleRow}>
          <Text style={styles.scheduleTitle} numberOfLines={1}>{item.title || '일정'}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor(status) + '18' }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor(status) }]}>
              {formatStatus(status)}
            </Text>
          </View>
        </View>
        {desc ? <Text style={styles.scheduleDesc} numberOfLines={2}>{desc}</Text> : null}
      </View>
    </View>
  );
}

function typeColor(type?: string) {
  if (type === 'medication') return '#7C3AED';
  if (type === 'hospital') return '#0EA5E9';
  if (type === 'call') return '#F59E0B';
  return '#64748B';
}

function formatType(type?: string) {
  if (type === 'medication') return '복약';
  if (type === 'hospital') return '병원';
  if (type === 'call') return '전화';
  if (type === 'general') return '일반';
  return '일정';
}

function statusColor(status: string) {
  if (status === 'completed') return '#05B547';
  if (status === 'cancelled') return '#9CA3AF';
  return '#2563EB';
}

function formatStatus(status: string) {
  if (status === 'completed') return '완료';
  if (status === 'cancelled') return '취소';
  if (status === 'missed') return '놓침';
  return '예정';
}

function getVisibleDesc(description?: string | null) {
  const s = description?.trim();
  if (!s) return '';
  if (/^[a-z_]+\s+mode agent action$/i.test(s)) return '';
  return s;
}

function getScheduleDate(item: ScheduleItem): Date | null {
  const src = item.scheduled_at || (item.date && item.time ? `${item.date}T${item.time}:00` : '');
  const d = new Date(src);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getTimeLabel(item: ScheduleItem) {
  const t = String(item.time || '').trim();
  if (/^\d{1,2}:\d{2}/.test(t)) return t.slice(0, 5);
  const d = getScheduleDate(item);
  if (!d) return '시간 미정';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function sortByTime(items: ScheduleItem[]) {
  return [...items].sort((a, b) => (getScheduleDate(a)?.getTime() ?? 0) - (getScheduleDate(b)?.getTime() ?? 0));
}

function getDayKey(item: ScheduleItem) {
  if (item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date)) return item.date;
  const d = getScheduleDate(item);
  return d ? getDateKey(d) : '';
}

function groupByDay(items: ScheduleItem[]) {
  const map = new Map<string, ScheduleItem[]>();
  items.forEach((item) => {
    const key = getDayKey(item);
    if (!key) return;
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  });
  return map;
}

function buildCalendarDays(
  monthDate: Date,
  selectedDayKey: string,
  schedulesByDay: Map<string, ScheduleItem[]>,
): CalendarDay[] {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startDay = new Date(firstDay);
  startDay.setDate(firstDay.getDate() - firstDay.getDay());
  const todayKey = getDateKey(new Date());

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(startDay);
    date.setDate(startDay.getDate() + i);
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

function getDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date();
}

function formatMonthLabel(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function formatDateLabel(date: Date) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${days[date.getDay()]}요일`;
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
  container: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },

  statsRow: { flexDirection: 'row', gap: 10 },
  statChip: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  statChipLabel: { fontSize: 12, fontWeight: '700', color: MUTED },
  statChipValue: { fontSize: 20, fontWeight: '800', color: TEXT },

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
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  monthButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: GREEN_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { fontSize: 18, fontWeight: '800', color: TEXT },
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
  dayCellMuted: { opacity: 0.35 },
  dayCellToday: { borderColor: GREEN, backgroundColor: GREEN_SOFT },
  dayCellSelected: { backgroundColor: GREEN, borderColor: GREEN, opacity: 1 },
  dayText: { fontSize: 14, fontWeight: '700', color: TEXT },
  dayTextMuted: { color: '#94A3B8' },
  dayTextToday: { color: GREEN_DARK },
  dayTextSelected: { color: '#FFFFFF' },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: GREEN,
    marginTop: 3,
  },
  dotSelected: { backgroundColor: '#FFFFFF' },
  dotEmpty: { width: 5, height: 5, marginTop: 3 },

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
    paddingVertical: 36,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: TEXT },
  emptyDesc: { fontSize: 13, color: MUTED, fontWeight: '600' },

  scheduleList: { gap: 10 },
  scheduleCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  scheduleCardLeft: {
    width: 64,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: GREEN_SOFT,
  },
  scheduleTypePill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  scheduleTypeText: { fontSize: 11, fontWeight: '800' },
  scheduleTime: { fontSize: 13, fontWeight: '800', color: GREEN_DARK },
  scheduleCardRight: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
    justifyContent: 'center',
  },
  scheduleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  scheduleTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: TEXT },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusBadgeText: { fontSize: 12, fontWeight: '800' },
  scheduleDesc: { fontSize: 13, color: MUTED, lineHeight: 19 },
});

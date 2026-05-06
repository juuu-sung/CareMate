import React from 'react';
import {
  ActivityIndicator,
  Linking,
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

import { getMedicationAnalytics, getMedications } from '@/services/medications';
import type {
  MedicationAnalytics,
  MedicationItem,
} from '@/services/medications';

type MedicationScheduleCell = MedicationAnalytics['schedule_grid'][number]['cells'][number];
type SelectedScheduleCell = {
  time: string;
  rowLabel: string;
  cell: MedicationScheduleCell;
};

function formatMedicationRecord(medication: MedicationItem) {
  if (!medication.last_recorded_at) {
    return medication.status_label;
  }

  const date = new Date(medication.last_recorded_at);
  if (Number.isNaN(date.getTime())) {
    return `${medication.last_time_scope ?? medication.time} · ${medication.status_label}`;
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const timeScope = medication.last_time_scope ? `${medication.last_time_scope} · ` : '';

  return `${timeScope}${month}.${day} ${hours}:${minutes}`;
}

function getMedicationBadgeStyle(status: MedicationItem['status']) {
  if (status === 'taken') {
    return { backgroundColor: '#DCFCE7', color: '#166534' };
  }

  if (status === 'missed') {
    return { backgroundColor: '#FEE2E2', color: '#B91C1C' };
  }

  return { backgroundColor: '#E5E7EB', color: '#374151' };
}

function extractEasyMedicationNamesFromSummary(summary: string) {
  const text = String(summary || '').trim();

  if (!text) {
    return [];
  }

  const sectionMatch = text.match(/\[쉬운 약 이름\]([\s\S]*?)(?=\n\s*\[|$)/);

  if (!sectionMatch) {
    return [];
  }

  return sectionMatch[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .map((line) => {
      const body = line.replace(/^-+\s*/, '').trim();
      const separatorIndex = Math.max(body.indexOf(':'), body.indexOf('：'));
      return separatorIndex >= 0 ? body.slice(separatorIndex + 1).trim() : body;
    })
    .map((line) => line.replace(/\([^)]*\)/g, '').trim())
    .map((line) => line.replace(/\[[^\]]*\]/g, '').trim())
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .filter((line) => line !== '확인 불가')
    .filter((line) => !line.includes('확인 불가'))
    .filter(Boolean);
}

function uniqueMedicationNames(values: string[]) {
  const seen = new Set<string>();
  const names: string[] = [];

  values.forEach((value) => {
    const name = String(value || '').trim();
    const key = name.replace(/\s+/g, '').toLowerCase();

    if (!name || seen.has(key)) {
      return;
    }

    seen.add(key);
    names.push(name);
  });

  return names;
}

function medicationNameKey(value: string) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

function getMedicationDisplayName(item: MedicationItem) {
  return item.easy_name?.trim() || '이름 미정 약';
}

function groupMedicationItems(items: MedicationItem[]) {
  const groups: Array<{
    key: string;
    name: string;
    displayName: string;
    items: MedicationItem[];
  }> = [];
  const indexByKey = new Map<string, number>();

  items.forEach((item) => {
    const key = medicationNameKey(item.name);
    if (!key) {
      return;
    }

    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      groups[existingIndex].items.push(item);
      if (groups[existingIndex].displayName === groups[existingIndex].name) {
        groups[existingIndex].displayName = getMedicationDisplayName(item);
      }
      return;
    }

    indexByKey.set(key, groups.length);
    groups.push({
      key,
      name: item.name,
      displayName: getMedicationDisplayName(item),
      items: [item],
    });
  });

  return groups.map((group) => ({
    ...group,
    items: [...group.items].sort((left, right) => left.time.localeCompare(right.time)),
  }));
}

function getMedicationGroupBadgeStyle(items: MedicationItem[]) {
  const missedCount = items.filter((item) => item.status === 'missed').length;
  const takenCount = items.filter((item) => item.status === 'taken').length;
  const scheduledCount = items.filter((item) => item.status === 'scheduled').length;

  if (missedCount > 0) {
    return { ...getMedicationBadgeStyle('missed'), label: `${missedCount}건 누락` };
  }

  if (scheduledCount > 0) {
    return { ...getMedicationBadgeStyle('scheduled'), label: `${scheduledCount}건 남음` };
  }

  if (takenCount === items.length && items.length > 0) {
    return { ...getMedicationBadgeStyle('taken'), label: '완료' };
  }

  return { ...getMedicationBadgeStyle('scheduled'), label: '확인중' };
}

function formatMedicationGroupRecord(items: MedicationItem[]) {
  const recordedItems = items
    .filter((item) => item.last_recorded_at)
    .sort((left, right) => {
      const leftTime = new Date(left.last_recorded_at || '').getTime();
      const rightTime = new Date(right.last_recorded_at || '').getTime();
      return rightTime - leftTime;
    });

  if (recordedItems.length === 0) {
    return '기록 없음';
  }

  return formatMedicationRecord(recordedItems[0]);
}

function buildGoogleSearchUrl(name: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(name + ' 약')}`;
}

function formatShortDate(value: string) {
  const parts = value.split('-');
  if (parts.length !== 3) {
    return value;
  }

  return `${Number(parts[1])}/${Number(parts[2])}`;
}

export default function GuardianMedicationsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parentId = String(params.parentId || params.elderUserId || '');
  const parentName = String(params.parentName || '부모님');
  const parentAge = String(params.parentAge || '');
  const parentGender = String(params.parentGender || '');
  const medicationsText = String(params.medications || '');

  const [medicationItems, setMedicationItems] = React.useState<MedicationItem[]>([]);
  const [analytics, setAnalytics] = React.useState<MedicationAnalytics | null>(null);
  const [selectedScheduleCell, setSelectedScheduleCell] =
    React.useState<SelectedScheduleCell | null>(null);
  const [medicationError, setMedicationError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const loadMedicationData = React.useCallback(
    async (manualRefresh = false) => {
      if (!parentId) {
        setMedicationItems([]);
        setAnalytics(null);
        setMedicationError('연동 정보가 없어 복약 현황을 확인할 수 없어요.');
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
        const items = await getMedications(parentId);
        setMedicationItems(items);
        setMedicationError(null);

        try {
          const nextAnalytics = await getMedicationAnalytics(parentId, 7);
          setAnalytics(nextAnalytics);
        } catch (analyticsError) {
          console.log('보호자 복약 통계 조회 오류:', analyticsError);
          setAnalytics(null);
        }
      } catch (error) {
        console.log('보호자 복약 조회 오류:', error);
        setMedicationItems([]);
        setAnalytics(null);
        setMedicationError('복약 현황을 불러오지 못했어요.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [parentId]
  );

  useFocusEffect(
    React.useCallback(() => {
      void loadMedicationData();
      return undefined;
    }, [loadMedicationData])
  );

  const medicationProfile = React.useMemo(() => {
    if (medicationItems.length > 0) {
      return uniqueMedicationNames(
        medicationItems
          .map(getMedicationDisplayName)
          .filter((name) => name !== '이름 미정 약')
      );
    }

    const easyNames = extractEasyMedicationNamesFromSummary(medicationsText);
    if (easyNames.length > 0) {
      return uniqueMedicationNames(easyNames);
    }

    return [];
  }, [medicationItems, medicationsText]);

  const medicationDisplayGroups = React.useMemo(() => {
    return groupMedicationItems(medicationItems);
  }, [medicationItems]);

  const selectedScheduleCellKey = selectedScheduleCell
    ? `${selectedScheduleCell.time}-${selectedScheduleCell.cell.date}`
    : '';

  const medicationSummary = React.useMemo(() => {
    return medicationItems.reduce(
      (summary, item) => {
        summary.total += 1;

        if (item.status === 'taken') {
          summary.taken += 1;
        } else if (item.status === 'missed') {
          summary.missed += 1;
        } else {
          summary.scheduled += 1;
        }

        return summary;
      },
      { total: 0, taken: 0, scheduled: 0, missed: 0 }
    );
  }, [medicationItems]);

  const medicationCompletionRate =
    medicationSummary.total > 0
      ? Math.round((medicationSummary.taken / medicationSummary.total) * 100)
      : 0;

  const missedMedications = React.useMemo(() => {
    return medicationItems.filter((item) => item.status === 'missed');
  }, [medicationItems]);

  const weakestTimeSlot = React.useMemo(() => {
    if (!analytics) {
      return null;
    }

    return [...analytics.time_slots]
      .filter((slot) => slot.expected_count > 0)
      .sort((left, right) => right.missed_rate - left.missed_rate)[0] ?? null;
  }, [analytics]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadMedicationData(true)}
            tintColor="#05B547"
          />
        }
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#111827" />
          </TouchableOpacity>

          <Text style={styles.topTitle}>복약 현황</Text>

          <TouchableOpacity style={styles.iconButton} onPress={() => void loadMedicationData(true)}>
            <Ionicons name="refresh" size={20} color="#111827" />
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.heroLabel}>오늘 복약 확인</Text>
              <Text style={styles.heroName}>{parentName} 님</Text>
              <Text style={styles.heroMeta}>
                {parentAge ? `${parentAge}세` : '나이 정보 없음'}
                {parentGender ? ` · ${parentGender}` : ''}
              </Text>
            </View>

            <View style={styles.heroBadge}>
              <MaterialCommunityIcons name="pill" size={18} color="#05B547" />
              <Text style={styles.heroBadgeText}>남은 복약 {medicationSummary.scheduled}건</Text>
            </View>
          </View>

          <View style={styles.heroSummary}>
            <View style={styles.heroSummaryItem}>
              <Text style={styles.heroSummaryLabel}>오늘 복약률</Text>
              <Text style={styles.heroSummaryValue}>{medicationCompletionRate}%</Text>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.heroSummaryItem}>
              <Text style={styles.heroSummaryLabel}>복용 중인 약</Text>
              <Text style={styles.heroSummaryValue}>
                {medicationProfile.length > 0 ? `${medicationProfile.length}종` : '-'}
              </Text>
            </View>
          </View>
        </View>

        {isLoading && medicationItems.length === 0 ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color="#05B547" />
            <Text style={styles.stateText}>복약 현황을 불러오는 중입니다.</Text>
          </View>
        ) : null}

        {medicationError ? (
          <View style={styles.noticeCard}>
            <Ionicons name="alert-circle-outline" size={18} color="#C2410C" />
            <Text style={styles.noticeText}>{medicationError}</Text>
          </View>
        ) : null}

        {analytics ? (
          <>
            <Text style={styles.sectionTitle}>최근 7일 복약 패턴</Text>

            <View style={styles.analyticsSummaryRow}>
              <AnalyticsStatCard
                label="7일 복약률"
                value={`${analytics.summary.completion_rate}%`}
                tone={analytics.summary.completion_rate >= 80 ? 'good' : 'warning'}
              />
              <AnalyticsStatCard
                label="누락"
                value={`${analytics.summary.missed_count}건`}
                tone={analytics.summary.missed_count > 0 ? 'danger' : 'good'}
              />
              <AnalyticsStatCard
                label="연속 누락"
                value={`${analytics.summary.current_missed_streak}건`}
                tone={analytics.summary.current_missed_streak > 0 ? 'danger' : 'neutral'}
              />
            </View>

            <View style={styles.trendCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.cardTitle}>날짜별 복약률</Text>
                <Text style={styles.cardSubtitle}>최근 {analytics.range.days}일</Text>
              </View>

              {analytics.daily.map((day) => (
                <DailyTrendRow
                  key={day.date}
                  date={formatShortDate(day.date)}
                  rate={day.completion_rate}
                  expectedCount={day.expected_count}
                />
              ))}
            </View>

            <View style={styles.insightCard}>
              <View style={styles.insightHeader}>
                <Ionicons name="analytics-outline" size={20} color="#0369A1" />
                <Text style={styles.insightTitle}>주의해서 볼 패턴</Text>
              </View>
              <Text style={styles.insightText}>
                {weakestTimeSlot && weakestTimeSlot.missed_count > 0
                  ? `${weakestTimeSlot.label} 복약 누락률이 ${weakestTimeSlot.missed_rate}%로 가장 높습니다.`
                  : '최근 7일 동안 특정 시간대에 반복되는 누락 패턴은 아직 없습니다.'}
              </Text>
              <Text style={styles.insightText}>
                아래 표에서 날짜와 회차별 복약 상태를 바로 확인할 수 있습니다.
              </Text>
            </View>

            <View style={styles.scheduleGridCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.cardTitle}>최근 7일 복약표</Text>
                <Text style={styles.cardSubtitle}>날짜 x 회차</Text>
              </View>

              {analytics.schedule_grid.length === 0 ? (
                <Text style={styles.emptyText}>표시할 복약 일정이 없습니다.</Text>
              ) : (
                <>
                  <MedicationScheduleGrid
                    rows={analytics.schedule_grid}
                    selectedKey={selectedScheduleCellKey}
                    onSelectCell={(time, rowLabel, cell) =>
                      setSelectedScheduleCell({ time, rowLabel, cell })
                    }
                  />
                  {selectedScheduleCell ? (
                    <ScheduleGridDetail selectedScheduleCell={selectedScheduleCell} />
                  ) : (
                    <Text style={styles.scheduleGridHint}>
                      칸을 누르면 해당 날짜와 시간의 약 목록을 볼 수 있습니다.
                    </Text>
                  )}
                </>
              )}
            </View>

            <View style={styles.recentMissedCard}>
              <View style={styles.missedHeader}>
                <Ionicons name="time-outline" size={20} color="#B91C1C" />
                <Text style={styles.missedTitle}>최근 누락 기록</Text>
              </View>
              {analytics.recent_missed.length === 0 ? (
                <Text style={styles.emptyText}>최근 7일 동안 누락 기록이 없습니다.</Text>
              ) : (
                analytics.recent_missed.map((item, index) => (
                  <Text key={`${item.date}-${item.time}-${item.medication_name}-${index}`} style={styles.missedText}>
                    {formatShortDate(item.date)} · {item.time} ·{' '}
                    {item.medication_easy_name || '이름 미정 약'}
                  </Text>
                ))
              )}
            </View>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>오늘 복약 요약</Text>

        <View style={styles.medicationSummaryRow}>
          <MiniStatCard label="완료" value={`${medicationSummary.taken}건`} />
          <MiniStatCard label="놓침" value={`${medicationSummary.missed}건`} />
          <MiniStatCard label="남음" value={`${medicationSummary.scheduled}건`} />
        </View>

        {missedMedications.length > 0 ? (
          <View style={styles.missedCard}>
            <View style={styles.missedHeader}>
              <Ionicons name="alert-circle-outline" size={20} color="#B91C1C" />
              <Text style={styles.missedTitle}>오늘 놓친 약</Text>
            </View>
            {missedMedications.map((item, index) => (
              <Text key={`${item.name}-${item.time}-${index}`} style={styles.missedText}>
                {getMedicationDisplayName(item)} · {item.time}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.listCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.cardTitle}>오늘 복약 기록</Text>
            <Text style={styles.cardSubtitle}>
              {medicationDisplayGroups.length}종 / {medicationSummary.total}건
            </Text>
          </View>

          {medicationError ? (
            <Text style={styles.errorText}>{medicationError}</Text>
          ) : medicationItems.length === 0 ? (
            <Text style={styles.emptyText}>등록된 복약 기록이 없습니다.</Text>
          ) : (
            medicationDisplayGroups.map((group, index) => {
              const badgeStyle = getMedicationGroupBadgeStyle(group.items);

              return (
                <View
                  key={`${group.key}-${index}`}
                  style={[
                    styles.medicationRow,
                    index !== medicationDisplayGroups.length - 1 && styles.withDivider,
                  ]}
                >
                  <View style={styles.medicationTextWrap}>
                    <Text style={styles.medicationName}>{group.displayName}</Text>
                    {group.displayName !== '이름 미정 약' ? (
                      <Text style={styles.medicationMeta}>{group.name}</Text>
                    ) : null}
                    <Text style={styles.medicationMeta}>
                      복약 시간 {group.items.map((item) => item.time).join(', ')}
                    </Text>
                    <Text style={styles.medicationMeta}>
                      최근 기록 {formatMedicationGroupRecord(group.items)}
                    </Text>
                    <View style={styles.timeChipRow}>
                      {group.items.map((item) => {
                        const itemBadgeStyle = getMedicationBadgeStyle(item.status);

                        return (
                          <View
                            key={`${group.key}-${item.id || item.time}`}
                            style={[
                              styles.timeChip,
                              { backgroundColor: itemBadgeStyle.backgroundColor },
                            ]}
                          >
                            <Text style={[styles.timeChipText, { color: itemBadgeStyle.color }]}>
                              {item.time} {item.status_label}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  <View
                    style={[
                      styles.medicationStatusBadge,
                      { backgroundColor: badgeStyle.backgroundColor },
                    ]}
                  >
                    <Text style={[styles.medicationStatusText, { color: badgeStyle.color }]}>
                      {badgeStyle.label}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <Text style={styles.sectionTitle}>복용 중인 약</Text>

        <View style={styles.infoCard}>
          <MedicationNameSection
            icon={<MaterialCommunityIcons name="pill" size={18} color="#05B547" />}
            label="약 목록"
            values={medicationProfile}
            fallback="등록된 약 정보가 없습니다."
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MiniStatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStatCard}>
      <Text style={styles.miniStatLabel}>{label}</Text>
      <Text style={styles.miniStatValue}>{value}</Text>
    </View>
  );
}

function AnalyticsStatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'good' | 'warning' | 'danger' | 'neutral';
}) {
  const toneStyle = {
    good: styles.analyticsStatGood,
    warning: styles.analyticsStatWarning,
    danger: styles.analyticsStatDanger,
    neutral: styles.analyticsStatNeutral,
  }[tone];

  return (
    <View style={[styles.analyticsStatCard, toneStyle]}>
      <Text style={styles.analyticsStatLabel}>{label}</Text>
      <Text style={styles.analyticsStatValue}>{value}</Text>
    </View>
  );
}

function DailyTrendRow({
  date,
  rate,
  expectedCount,
}: {
  date: string;
  rate: number;
  expectedCount: number;
}) {
  const barColor = rate >= 80 ? '#16A34A' : rate >= 50 ? '#F59E0B' : '#DC2626';

  return (
    <View style={styles.dailyTrendRow}>
      <Text style={styles.dailyTrendDate}>{date}</Text>
      <View style={styles.dailyTrendTrack}>
        <View
          style={[
            styles.dailyTrendFill,
            {
              width: `${Math.max(rate, expectedCount > 0 ? 6 : 0)}%`,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>
      <Text style={styles.dailyTrendRate}>
        {expectedCount > 0 ? `${rate}%` : '-'}
      </Text>
    </View>
  );
}

function ScheduleGridDetail({
  selectedScheduleCell,
}: {
  selectedScheduleCell: SelectedScheduleCell;
}) {
  const displayNames = selectedScheduleCell.cell.medication_easy_names ?? [];

  return (
    <View style={styles.scheduleGridDetail}>
      <Text style={styles.scheduleGridDetailTitle}>
        {formatShortDate(selectedScheduleCell.cell.date)} ·{' '}
        {selectedScheduleCell.rowLabel} {selectedScheduleCell.time}
      </Text>
      <Text style={styles.scheduleGridDetailMeta}>
        {selectedScheduleCell.cell.label} · 완료{' '}
        {selectedScheduleCell.cell.taken_count}/
        {selectedScheduleCell.cell.total_count}
      </Text>
      <Text style={styles.scheduleGridDetailNames}>
        {displayNames.length > 0
          ? displayNames.join(', ')
          : '쉬운 약 이름이 아직 설정되지 않았습니다.'}
      </Text>
    </View>
  );
}

function getScheduleGridCellColors(status: MedicationScheduleCell['status']) {
  if (status === 'taken') {
    return { backgroundColor: '#DCFCE7', borderColor: '#86EFAC', color: '#166534' };
  }

  if (status === 'missed') {
    return { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', color: '#B91C1C' };
  }

  if (status === 'pending') {
    return { backgroundColor: '#FEF3C7', borderColor: '#FCD34D', color: '#92400E' };
  }

  if (status === 'partial') {
    return { backgroundColor: '#DBEAFE', borderColor: '#93C5FD', color: '#1D4ED8' };
  }

  return { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0', color: '#475569' };
}

function MedicationScheduleGrid({
  rows,
  selectedKey,
  onSelectCell,
}: {
  rows: MedicationAnalytics['schedule_grid'];
  selectedKey: string;
  onSelectCell: (
    time: string,
    rowLabel: string,
    cell: MedicationScheduleCell
  ) => void;
}) {
  const dates = rows[0]?.cells ?? [];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.scheduleGridTable}>
        <View style={styles.scheduleGridHeaderRow}>
          <View style={[styles.scheduleGridTimeCell, styles.scheduleGridHeaderTimeCell]}>
            <Text style={styles.scheduleGridHeaderText}>회차</Text>
          </View>
          {dates.map((cell) => (
            <View key={`date-${cell.date}`} style={styles.scheduleGridDateCell}>
              <Text style={styles.scheduleGridHeaderText}>
                {formatShortDate(cell.date)}
              </Text>
            </View>
          ))}
        </View>

        {rows.map((row) => (
          <View key={`row-${row.time}`} style={styles.scheduleGridDataRow}>
            <View style={styles.scheduleGridTimeCell}>
              <Text style={styles.scheduleGridTimeLabel}>{row.label}</Text>
              <Text style={styles.scheduleGridTimeText}>{row.time}</Text>
            </View>

            {row.cells.map((cell) => {
              const colors = getScheduleGridCellColors(cell.status);
              const key = `${row.time}-${cell.date}`;
              const selected = selectedKey === key;

              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.scheduleGridCell,
                    {
                      backgroundColor: colors.backgroundColor,
                      borderColor: colors.borderColor,
                    },
                    selected && styles.scheduleGridCellSelected,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => onSelectCell(row.time, row.label, cell)}
                >
                  <Text style={[styles.scheduleGridCellText, { color: colors.color }]}>
                    {cell.label}
                  </Text>
                  <Text style={[styles.scheduleGridCellCount, { color: colors.color }]}>
                    {cell.total_count > 0 ? `${cell.taken_count}/${cell.total_count}` : '-'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function MedicationNameSection({
  icon,
  label,
  values,
  fallback,
}: {
  icon: React.ReactNode;
  label: string;
  values: string[];
  fallback: string;
}) {
  const uniqueValues = React.useMemo(() => {
    return Array.from(
      new Set(
        (values ?? [])
          .map((value) => String(value).trim())
          .filter((value) => value.length > 0)
      )
    );
  }, [values]);

  const openDetail = async (name: string) => {
    const url = buildGoogleSearchUrl(name);
    await Linking.openURL(url);
  };

  return (
    <View style={styles.tagSection}>
      <View style={styles.infoHeader}>
        <View style={styles.infoIcon}>{icon}</View>
        <Text style={styles.infoLabel}>{label}</Text>
      </View>

      {uniqueValues.length === 0 ? (
        <Text style={styles.emptyText}>{fallback}</Text>
      ) : (
        <View style={styles.medicationNameList}>
          {uniqueValues.map((name, index) => (
            <View
              key={`${label}-${name}-${index}`}
              style={[
                styles.medicationNameItem,
                index !== uniqueValues.length - 1 && styles.withDivider,
              ]}
            >
              <Text style={styles.onlyMedicationName}>{name}</Text>

              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.detailButton}
                onPress={() => void openDetail(name)}
              >
                <Text style={styles.detailButtonText}>상세보기</Text>
                <Ionicons name="open-outline" size={14} color="#047857" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F7FB',
  },
  container: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: '#F6F7FB',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
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
  topTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 18,
  },
  heroHeader: {
    gap: 14,
  },
  heroLabel: {
    fontSize: 14,
    color: '#05B547',
    fontWeight: '800',
  },
  heroName: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  heroMeta: {
    marginTop: 4,
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEFDF3',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#047857',
  },
  heroSummary: {
    marginTop: 18,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroSummaryItem: {
    flex: 1,
  },
  heroSummaryLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '700',
  },
  heroSummaryValue: {
    marginTop: 6,
    fontSize: 20,
    color: '#111827',
    fontWeight: '800',
  },
  heroDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#E5E7EB',
    marginHorizontal: 14,
  },
  stateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 18,
  },
  stateText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
    fontWeight: '600',
    textAlign: 'center',
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginBottom: 18,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#9A3412',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  analyticsSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  analyticsStatCard: {
    width: '31%',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  analyticsStatGood: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  analyticsStatWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  analyticsStatDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  analyticsStatNeutral: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  analyticsStatLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '800',
    textAlign: 'center',
  },
  analyticsStatValue: {
    marginTop: 7,
    fontSize: 19,
    color: '#0F172A',
    fontWeight: '900',
    textAlign: 'center',
  },
  trendCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  dailyTrendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
  },
  dailyTrendDate: {
    width: 36,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '800',
  },
  dailyTrendTrack: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  dailyTrendFill: {
    height: '100%',
    borderRadius: 999,
  },
  dailyTrendRate: {
    width: 38,
    textAlign: 'right',
    fontSize: 12,
    color: '#334155',
    fontWeight: '900',
  },
  insightCard: {
    backgroundColor: '#F0F9FF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginBottom: 12,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  insightTitle: {
    fontSize: 16,
    color: '#075985',
    fontWeight: '900',
  },
  insightText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#0C4A6E',
    fontWeight: '700',
    marginTop: 4,
  },
  recentMissedCard: {
    backgroundColor: '#FFF1F2',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 18,
  },
  scheduleGridCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  scheduleGridTable: {
    paddingBottom: 4,
  },
  scheduleGridHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  scheduleGridDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  scheduleGridTimeCell: {
    width: 72,
    minHeight: 54,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginRight: 8,
  },
  scheduleGridHeaderTimeCell: {
    minHeight: 38,
  },
  scheduleGridDateCell: {
    width: 76,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  scheduleGridHeaderText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '900',
    textAlign: 'center',
  },
  scheduleGridTimeLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '900',
  },
  scheduleGridTimeText: {
    marginTop: 3,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '900',
  },
  scheduleGridCell: {
    width: 76,
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    paddingHorizontal: 6,
  },
  scheduleGridCellSelected: {
    borderWidth: 2,
    borderColor: '#111827',
  },
  scheduleGridCellText: {
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  scheduleGridCellCount: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '800',
    opacity: 0.85,
  },
  scheduleGridHint: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    color: '#64748B',
    fontWeight: '700',
  },
  scheduleGridDetail: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  scheduleGridDetailTitle: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '900',
  },
  scheduleGridDetailMeta: {
    marginTop: 5,
    fontSize: 13,
    color: '#334155',
    fontWeight: '800',
  },
  scheduleGridDetailNames: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    color: '#64748B',
    fontWeight: '700',
  },
  medicationSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  missedCard: {
    backgroundColor: '#FFF1F2',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 18,
  },
  missedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  missedTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#B91C1C',
  },
  missedText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#7F1D1D',
    fontWeight: '800',
  },
  miniStatCard: {
    width: '31%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  miniStatLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '700',
    textAlign: 'center',
  },
  miniStatValue: {
    marginTop: 6,
    fontSize: 18,
    color: '#111827',
    fontWeight: '800',
    textAlign: 'center',
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '700',
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#DC2626',
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
    fontWeight: '600',
  },
  medicationRow: {
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  medicationTextWrap: {
    flex: 1,
  },
  medicationName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  medicationMeta: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  timeChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  timeChip: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  timeChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  medicationStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  medicationStatusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  tagSection: {
    paddingVertical: 14,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoIcon: {
    width: 24,
    alignItems: 'center',
    marginRight: 8,
  },
  infoLabel: {
    flex: 1,
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '700',
  },
  medicationNameList: {
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
  },
  medicationNameItem: {
    paddingVertical: 13,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  onlyMedicationName: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    fontWeight: '800',
  },
  detailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: '#EEFDF3',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  detailButtonText: {
    fontSize: 12,
    color: '#047857',
    fontWeight: '800',
  },
  withDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
});

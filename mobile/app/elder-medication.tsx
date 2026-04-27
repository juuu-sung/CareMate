import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { getMedications, MedicationItem } from '@/services/medications';

const BLUE = '#4F7CFF';
const BLUE_DARK = '#2F5FEA';
const BLUE_LIGHT = '#EEF3FF';
const BG = '#EEF4FF';
const TEXT = '#16213E';

type MedicationItemWithEasyName = MedicationItem & {
  easy_name?: string | null;
  simple_name?: string | null;
  display_name?: string | null;
  category_name?: string | null;
  easyName?: string | null;
  simpleName?: string | null;
  displayName?: string | null;
  categoryName?: string | null;
};

function cleanMedicationLine(line: string) {
  return String(line || '')
    .replace(/^-+\s*/, '')
    .replace(/^약\s*이름\s*[:：]?\s*/g, '')
    .replace(/^약\s*이름만\s*[:：]?\s*/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSection(summary: string, sectionTitle: string) {
  const text = String(summary || '').trim();

  if (!text) {
    return '';
  }

  const escapedTitle = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionMatch = text.match(
    new RegExp(`\\[${escapedTitle}\\]([\\s\\S]*?)(?=\\n\\s*\\[|$)`)
  );

  return sectionMatch?.[1] ?? '';
}

function isInvalidMedicationText(value: string) {
  const text = String(value || '').trim();

  if (!text) return true;
  if (text === '확인 불가') return true;
  if (text.includes('확인 불가')) return true;
  if (text.includes('복약 안내')) return true;
  if (text.includes('언제 먹는지')) return true;
  if (text.includes('한 번에')) return true;
  if (text.includes('하루에')) return true;
  if (text.includes('쉬운 안내')) return true;
  if (text.includes('이미지에서')) return true;
  if (text.includes('개인정보')) return true;

  return false;
}

function extractEasyMedicationMapFromSummary(summary: string) {
  const sectionText = extractSection(summary, '쉬운 약 이름');
  const result: Record<string, string> = {};

  if (!sectionText) {
    return result;
  }

  sectionText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .forEach((line) => {
      const cleaned = line.replace(/^-+\s*/, '').trim();
      const parts = cleaned.split(/[:：]/);

      if (parts.length < 2) return;

      const officialName = cleanMedicationLine(parts[0]);
      const easyName = parts.slice(1).join(':').trim();

      if (
        !officialName ||
        !easyName ||
        isInvalidMedicationText(officialName) ||
        isInvalidMedicationText(easyName)
      ) {
        return;
      }

      result[officialName] = easyName;
    });

  return result;
}

function normalizeMedicationNameForMatch(value: string) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/[(){}\[\],.·ㆍ]/g, '')
    .toLowerCase();
}

function findEasyNameFromSummaryMap(
  officialName: string,
  easyNameMap: Record<string, string>
) {
  const target = normalizeMedicationNameForMatch(officialName);

  if (!target) return '';

  const exact = easyNameMap[officialName];

  if (exact) return exact;

  const matchedKey = Object.keys(easyNameMap).find((key) => {
    const normalizedKey = normalizeMedicationNameForMatch(key);

    return (
      normalizedKey === target ||
      normalizedKey.includes(target) ||
      target.includes(normalizedKey)
    );
  });

  return matchedKey ? easyNameMap[matchedKey] : '';
}

function getEasyMedicationName(
  medication: MedicationItem,
  easyNameMap: Record<string, string>
): string {
  const item = medication as MedicationItemWithEasyName;

  const fromSummary = findEasyNameFromSummaryMap(item.name, easyNameMap);

  if (fromSummary) {
    return fromSummary;
  }

  const easyName =
    item.easy_name ||
    item.easyName ||
    item.simple_name ||
    item.simpleName ||
    item.display_name ||
    item.displayName ||
    item.category_name ||
    item.categoryName;

  if (typeof easyName === 'string' && easyName.trim().length > 0) {
    return easyName.trim();
  }

  return item.name;
}

function getOfficialMedicationName(
  medication: MedicationItem,
  easyNameMap: Record<string, string>
): string {
  const easyName = getEasyMedicationName(medication, easyNameMap);

  if (easyName === medication.name) {
    return '';
  }

  return medication.name;
}

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

function getStatusInfo(status: MedicationItem['status']) {
  if (status === 'taken') {
    return {
      label: '먹었어요',
      backgroundColor: '#DBEAFE',
      color: '#1D4ED8',
      icon: 'checkmark-circle' as const,
    };
  }

  if (status === 'missed') {
    return {
      label: '놓쳤어요',
      backgroundColor: '#FEE2E2',
      color: '#B91C1C',
      icon: 'alert-circle' as const,
    };
  }

  return {
    label: '먹을 시간',
    backgroundColor: '#EAF0FF',
    color: BLUE_DARK,
    icon: 'time' as const,
  };
}

export default function ElderMedicationsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const elderUserId = String(
    params.elderUserId || params.elder_user_id || params.parentId || ''
  );
  const parentName = String(params.parentName || '어르신');
  const medicationsText = String(params.medications || '');

  const [medicationItems, setMedicationItems] = React.useState<MedicationItem[]>([]);
  const [medicationError, setMedicationError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const easyNameMap = React.useMemo(() => {
    return extractEasyMedicationMapFromSummary(medicationsText);
  }, [medicationsText]);

  const loadMedicationData = React.useCallback(
    async (manualRefresh = false) => {
      if (!elderUserId) {
        setMedicationItems([]);
        setMedicationError('사용자 정보를 찾을 수 없습니다.');
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
        const items = await getMedications(elderUserId);
        setMedicationItems(items);
        setMedicationError(null);
      } catch (error) {
        console.log('노인 복약 조회 오류:', error);
        setMedicationItems([]);
        setMedicationError('복약 정보를 불러오지 못했습니다.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [elderUserId]
  );

  useFocusEffect(
    React.useCallback(() => {
      void loadMedicationData();
      return undefined;
    }, [loadMedicationData])
  );

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

  const nextMedication = React.useMemo(() => {
    return medicationItems.find((item) => item.status !== 'taken') || medicationItems[0];
  }, [medicationItems]);

  const nextOfficialName = nextMedication
    ? getOfficialMedicationName(nextMedication, easyNameMap)
    : '';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadMedicationData(true)}
            tintColor={BLUE}
          />
        }
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-back" size={30} color={BLUE_DARK} />
          </TouchableOpacity>

          <Text style={styles.topTitle}>복약 정보</Text>

          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => void loadMedicationData(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={26} color={BLUE_DARK} />
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroIconCircle}>
            <MaterialCommunityIcons name="pill" size={54} color="#FFFFFF" />
          </View>

          <View style={styles.heroTextArea}>
            <Text style={styles.heroLabel}>오늘 드실 약</Text>
            <Text style={styles.heroTitle}>
              {medicationSummary.scheduled > 0
                ? `${medicationSummary.scheduled}개 남았어요`
                : '남은 약이 없어요'}
            </Text>
            <Text style={styles.heroSubTitle}>
              {parentName} 님의 복약 정보를 확인해 주세요
            </Text>
          </View>
        </View>

        {isLoading && medicationItems.length === 0 ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={BLUE} />
            <Text style={styles.stateText}>복약 정보를 불러오는 중입니다</Text>
          </View>
        ) : null}

        {medicationError ? (
          <View style={styles.noticeCard}>
            <Ionicons name="alert-circle-outline" size={28} color="#B91C1C" />
            <Text style={styles.noticeText}>{medicationError}</Text>
          </View>
        ) : null}

        {nextMedication ? (
          <View style={styles.nextCard}>
            <View style={styles.nextHeader}>
              <Ionicons name="notifications-outline" size={34} color={BLUE_DARK} />
              <Text style={styles.nextTitle}>가장 먼저 확인할 약</Text>
            </View>

            <Text style={styles.nextMedicineName}>
              {getEasyMedicationName(nextMedication, easyNameMap)}
            </Text>

            {nextOfficialName ? (
              <Text style={styles.nextOfficialName}>
                원래 약 이름: {nextOfficialName}
              </Text>
            ) : null}

            <View style={styles.nextTimeBox}>
              <Text style={styles.nextTimeLabel}>복약 시간</Text>
              <Text style={styles.nextTimeText}>{nextMedication.time}</Text>
            </View>

            <Text style={styles.nextRecordText}>
              최근 기록: {formatMedicationRecord(nextMedication)}
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>오늘 복약 요약</Text>

        <View style={styles.summaryRow}>
          <SummaryCard label="전체" value={`${medicationSummary.total}개`} />
          <SummaryCard label="완료" value={`${medicationSummary.taken}개`} />
          <SummaryCard label="남음" value={`${medicationSummary.scheduled}개`} />
        </View>

        <Text style={styles.sectionTitle}>약 목록</Text>

        <View style={styles.listCard}>
          {medicationError ? (
            <Text style={styles.emptyText}>{medicationError}</Text>
          ) : medicationItems.length === 0 && !isLoading ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="pill-off" size={48} color="#8EA4E8" />
              <Text style={styles.emptyTitle}>등록된 약이 없습니다</Text>
              <Text style={styles.emptySubText}>
                보호자가 약 정보를 등록하면 이곳에서 볼 수 있습니다
              </Text>
            </View>
          ) : (
            medicationItems.map((item, index) => {
              const statusInfo = getStatusInfo(item.status);
              const officialName = getOfficialMedicationName(item, easyNameMap);

              return (
                <View
                  key={`${item.name}-${item.time}-${index}`}
                  style={[
                    styles.medicationRow,
                    index !== medicationItems.length - 1 && styles.withDivider,
                  ]}
                >
                  <View style={styles.medicationIconBox}>
                    <MaterialCommunityIcons name="pill" size={34} color={BLUE_DARK} />
                  </View>

                  <View style={styles.medicationContent}>
                    <Text style={styles.medicationName}>
                      {getEasyMedicationName(item, easyNameMap)}
                    </Text>

                    {officialName ? (
                      <Text style={styles.medicationOfficialName}>
                        {officialName}
                      </Text>
                    ) : null}

                    <View style={styles.timeRow}>
                      <Ionicons name="time-outline" size={22} color="#5B6F9F" />
                      <Text style={styles.medicationTime}>{item.time}</Text>
                    </View>

                    <Text style={styles.medicationRecord}>
                      최근 기록 {formatMedicationRecord(item)}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: statusInfo.backgroundColor },
                    ]}
                  >
                    <Ionicons
                      name={statusInfo.icon}
                      size={20}
                      color={statusInfo.color}
                    />
                    <Text style={[styles.statusText, { color: statusInfo.color }]}>
                      {statusInfo.label}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <TouchableOpacity
          style={styles.chatGuideButton}
          onPress={() =>
            router.push({
              pathname: '/chat',
              params: {
                input: 'voice',
                autostart: '0',
                elderUserId,
                elder_user_id: elderUserId,
              },
            })
          }
          activeOpacity={0.9}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={42} color="#FFFFFF" />
          <View style={styles.chatGuideTextArea}>
            <Text style={styles.chatGuideTitle}>약에 대해 물어보기</Text>
            <Text style={styles.chatGuideSubTitle}>궁금하면 비서에게 물어보세요</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 36,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  backButton: {
    width: 58,
    height: 54,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  refreshButton: {
    width: 58,
    height: 54,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '900',
    color: TEXT,
    letterSpacing: -0.7,
  },
  heroCard: {
    backgroundColor: BLUE,
    borderRadius: 32,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 18,
  },
  heroIconCircle: {
    width: 92,
    height: 92,
    borderRadius: 32,
    backgroundColor: BLUE_DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextArea: {
    flex: 1,
  },
  heroLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: '#DDE7FF',
  },
  heroTitle: {
    marginTop: 6,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.8,
  },
  heroSubTitle: {
    marginTop: 8,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    color: '#EAF0FF',
  },
  stateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    marginBottom: 18,
  },
  stateText: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '800',
    color: '#5B6F9F',
    textAlign: 'center',
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF1F2',
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  noticeText: {
    flex: 1,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '800',
    color: '#B91C1C',
  },
  nextCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 22,
    marginBottom: 22,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  nextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  nextTitle: {
    fontSize: 23,
    fontWeight: '900',
    color: '#1F3E8A',
  },
  nextMedicineName: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '900',
    color: TEXT,
    letterSpacing: -0.8,
  },
  nextOfficialName: {
    marginTop: 6,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
    color: '#64748B',
  },
  nextTimeBox: {
    marginTop: 18,
    backgroundColor: BLUE_LIGHT,
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  nextTimeLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#5B6F9F',
  },
  nextTimeText: {
    marginTop: 5,
    fontSize: 30,
    fontWeight: '900',
    color: BLUE_DARK,
  },
  nextRecordText: {
    marginTop: 14,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    color: '#64748B',
  },
  sectionTitle: {
    fontSize: 25,
    fontWeight: '900',
    color: TEXT,
    marginBottom: 12,
    letterSpacing: -0.6,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 22,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 10,
    alignItems: 'center',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  summaryLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: '#5B6F9F',
  },
  summaryValue: {
    marginTop: 8,
    fontSize: 26,
    fontWeight: '900',
    color: BLUE_DARK,
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginBottom: 22,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  medicationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
  },
  medicationIconBox: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicationContent: {
    flex: 1,
  },
  medicationName: {
    fontSize: 25,
    lineHeight: 32,
    fontWeight: '900',
    color: TEXT,
    letterSpacing: -0.5,
  },
  medicationOfficialName: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    color: '#7B8BA8',
  },
  timeRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  medicationTime: {
    fontSize: 20,
    fontWeight: '900',
    color: BLUE_DARK,
  },
  medicationRecord: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: '#64748B',
  },
  statusBadge: {
    minWidth: 88,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '900',
  },
  withDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5EDF8',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 44,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 24,
    fontWeight: '900',
    color: TEXT,
  },
  emptySubText: {
    marginTop: 8,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  emptyText: {
    paddingVertical: 28,
    fontSize: 19,
    lineHeight: 28,
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'center',
  },
  chatGuideButton: {
    backgroundColor: BLUE_DARK,
    borderRadius: 28,
    paddingVertical: 24,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    shadowColor: BLUE_DARK,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  chatGuideTextArea: {
    flex: 1,
  },
  chatGuideTitle: {
    fontSize: 27,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.7,
  },
  chatGuideSubTitle: {
    marginTop: 6,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '700',
    color: '#EAF0FF',
  },
});
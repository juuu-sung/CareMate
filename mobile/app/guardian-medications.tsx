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

import { getMedications, MedicationItem } from '@/services/medications';

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

function extractMedicationNamesFromSummary(summary: string) {
  const text = String(summary || '').trim();

  if (!text) {
    return [];
  }

  const sectionMatch = text.match(/\[복용 중인 약\]([\s\S]*?)(?=\n\s*\[|$)/);

  if (!sectionMatch) {
    return [];
  }

  const sectionText = sectionMatch[1];

  return sectionText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .map((line) => line.replace(/^-+\s*/, '').trim())
    .map((line) => line.replace(/^약\s*이름\s*[:：]?\s*/g, '').trim())
    .map((line) => line.replace(/^약\s*이름만\s*[:：]?\s*/g, '').trim())
    .map((line) => line.replace(/\([^)]*\)/g, '').trim())
    .map((line) => line.replace(/\[[^\]]*\]/g, '').trim())
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .filter((line) => line !== '확인 불가')
    .filter((line) => !line.includes('확인 불가'))
    .filter((line) => !line.includes('복약 안내'))
    .filter((line) => !line.includes('언제 먹는지'))
    .filter((line) => !line.includes('한 번에'))
    .filter((line) => !line.includes('하루에'))
    .filter((line) => !line.includes('쉬운 안내'))
    .filter((line) => !line.includes('이미지에서'))
    .filter((line) => !line.includes('개인정보'))
    .filter(Boolean);
}

function buildGoogleSearchUrl(name: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(name + ' 약')}`;
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
  const [medicationError, setMedicationError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const loadMedicationData = React.useCallback(
    async (manualRefresh = false) => {
      if (!parentId) {
        setMedicationItems([]);
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
      } catch (error) {
        console.log('보호자 복약 조회 오류:', error);
        setMedicationItems([]);
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
    const names = extractMedicationNamesFromSummary(medicationsText);
    return Array.from(new Set(names));
  }, [medicationsText]);

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
                {item.name} · {item.time}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.listCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.cardTitle}>오늘 복약 기록</Text>
            <Text style={styles.cardSubtitle}>총 {medicationSummary.total}건</Text>
          </View>

          {medicationError ? (
            <Text style={styles.errorText}>{medicationError}</Text>
          ) : medicationItems.length === 0 ? (
            <Text style={styles.emptyText}>등록된 복약 기록이 없습니다.</Text>
          ) : (
            medicationItems.map((item, index) => {
              const badgeStyle = getMedicationBadgeStyle(item.status);

              return (
                <View
                  key={`${item.name}-${item.time}-${index}`}
                  style={[
                    styles.medicationRow,
                    index !== medicationItems.length - 1 && styles.withDivider,
                  ]}
                >
                  <View style={styles.medicationTextWrap}>
                    <Text style={styles.medicationName}>{item.name}</Text>
                    <Text style={styles.medicationMeta}>복약 시간 {item.time}</Text>
                    <Text style={styles.medicationMeta}>
                      최근 기록 {formatMedicationRecord(item)}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.medicationStatusBadge,
                      { backgroundColor: badgeStyle.backgroundColor },
                    ]}
                  >
                    <Text style={[styles.medicationStatusText, { color: badgeStyle.color }]}>
                      {item.status_label}
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

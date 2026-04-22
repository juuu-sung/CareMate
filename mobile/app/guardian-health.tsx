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
import {
  Feather,
  Ionicons,
} from '@expo/vector-icons';

import {
  getGuardianAlerts,
  getGuardianDashboard,
  GuardianAlertItem,
} from '@/services/guardian';
import { GuardianDashboard } from '@/types/guardian';
import {
  formatGuardianCheckInStatus,
  getGuardianCareStatus,
} from '@/utils/guardianCare';

function formatRelativeTime(timestamp: string) {
  if (!timestamp) {
    return '기록 없음';
  }

  const target = new Date(timestamp);
  if (Number.isNaN(target.getTime())) {
    return '기록 없음';
  }

  const diffMs = Date.now() - target.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 1) {
    return '방금 전';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}분 전`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}시간 전`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}일 전`;
  }

  return `${target.getMonth() + 1}/${target.getDate()}`;
}

function splitValues(value: string) {
  return value
    .split(/[,/\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function summarizeValues(values: string[], fallback: string) {
  if (values.length === 0) {
    return fallback;
  }
  if (values.length <= 2) {
    return values.join(', ');
  }
  return `${values.slice(0, 2).join(', ')} 외 ${values.length - 2}개`;
}

type SignalTone = 'good' | 'warning' | 'danger' | 'neutral';

type SignalCardItem = {
  label: string;
  value: string;
  hint: string;
  tone: SignalTone;
};

export default function GuardianHealthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parentId = String(params.parentId || params.elderUserId || '');
  const parentName = String(params.parentName || '부모님');
  const parentAge = String(params.parentAge || '');
  const parentGender = String(params.parentGender || '');
  const linkCode = String(params.linkCode || '');

  const medicationsText = String(params.medications || '');
  const diseasesText = String(params.diseases || '');
  const allergiesText = String(params.allergies || '');
  const hospital = String(params.hospital || '');
  const doctorContact = String(params.doctorContact || '');
  const memo = String(params.memo || '');

  const [dashboard, setDashboard] = React.useState<GuardianDashboard | null>(null);
  const [alerts, setAlerts] = React.useState<GuardianAlertItem[]>([]);
  const [dashboardError, setDashboardError] = React.useState<string | null>(null);
  const [alertsError, setAlertsError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isProfileExpanded, setIsProfileExpanded] = React.useState(false);

  const loadCareData = React.useCallback(
    async (manualRefresh = false) => {
      if (!parentId || !linkCode) {
        setDashboard(null);
        setAlerts([]);
        setDashboardError('연동 정보가 없어 건강 상황판을 불러올 수 없어요.');
        setAlertsError('연동 정보가 없어 최근 알림을 확인할 수 없어요.');
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (manualRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const [dashboardResult, alertsResult] = await Promise.allSettled([
        getGuardianDashboard(parentId, linkCode),
        getGuardianAlerts(parentId, linkCode, 5),
      ]);

      if (dashboardResult.status === 'fulfilled') {
        setDashboard(dashboardResult.value);
        setDashboardError(null);
      } else {
        console.log('건강 상황판 대시보드 조회 오류:', dashboardResult.reason);
        setDashboard(null);
        setDashboardError('건강 상황판을 불러오지 못했어요.');
      }

      if (alertsResult.status === 'fulfilled') {
        setAlerts(alertsResult.value.items);
        setAlertsError(null);
      } else {
        console.log('건강 상황판 알림 조회 오류:', alertsResult.reason);
        setAlerts([]);
        setAlertsError('최근 알림을 불러오지 못했어요.');
      }

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [linkCode, parentId]
  );

  useFocusEffect(
    React.useCallback(() => {
      void loadCareData();
      return undefined;
    }, [loadCareData])
  );

  const careStatus = getGuardianCareStatus(dashboard, !!dashboardError);
  const loadWarnings = [dashboardError, alertsError].filter(Boolean);
  const hasCriticalError =
    !isLoading &&
    !!dashboardError &&
    !!alertsError &&
    !dashboard &&
    alerts.length === 0;

  const medicationProfile = React.useMemo(() => splitValues(medicationsText), [medicationsText]);
  const diseaseProfile = React.useMemo(() => splitValues(diseasesText), [diseasesText]);
  const allergyProfile = React.useMemo(() => splitValues(allergiesText), [allergiesText]);

  const openAlertsScreen = React.useCallback(() => {
    router.push({
      pathname: '/guardian-alerts',
      params: {
        parentId,
        parentName,
        linkCode,
      },
    });
  }, [linkCode, parentId, parentName, router]);

  const attentionSignals = React.useMemo<SignalCardItem[]>(() => {
    if (!dashboard) {
      return [
        {
          label: '건강 신호 정리중',
          value: '확인중',
          hint: '주의해서 볼 건강 신호를 정리하고 있습니다.',
          tone: 'neutral',
        },
      ];
    }

    const items: SignalCardItem[] = [];

    if (dashboard.check_in_status === 'missed') {
      items.push({
        label: '체크인 미응답',
        value: '확인 필요',
        hint: '최근 체크인 응답이 확인되지 않았습니다.',
        tone: 'danger',
      });
    } else if (dashboard.check_in_status === 'pending') {
      items.push({
        label: '체크인 지연',
        value: formatGuardianCheckInStatus(dashboard.check_in_status),
        hint: '체크인 응답을 기다리고 있습니다.',
        tone: 'warning',
      });
    }

    if (dashboard.missed_medication_count > 0) {
      items.push({
        label: '복약 누락',
        value: `${dashboard.missed_medication_count}건`,
        hint: '예정된 복약을 놓친 기록이 있습니다.',
        tone: 'danger',
      });
    } else if (dashboard.severe_overdue_medication_count > 0) {
      items.push({
        label: '복약 장기 지연',
        value: `${dashboard.severe_overdue_medication_count}건`,
        hint: '2시간 이상 지난 복약이 있습니다.',
        tone: 'danger',
      });
    } else if (dashboard.overdue_medication_count > 0) {
      items.push({
        label: '복약 지연',
        value: `${dashboard.overdue_medication_count}건`,
        hint: '1시간 이상 지난 복약이 있습니다.',
        tone: 'warning',
      });
    }

    if (
      dashboard.latest_location_status === 'stale' ||
      dashboard.latest_location_status === 'unavailable'
    ) {
      items.push({
        label: '위치 확인 어려움',
        value:
          dashboard.latest_location_status === 'stale' ? '지연' : '미확인',
        hint: dashboard.latest_location_label || '안전 확인을 위해 위치 기록을 확인해 주세요.',
        tone: dashboard.latest_location_status === 'stale' ? 'warning' : 'danger',
      });
    }

    if (items.length === 0) {
      return [
        {
          label: '주의 신호 없음',
          value: '안정',
          hint: '지금 바로 확인이 필요한 건강 신호는 없습니다.',
          tone: 'good',
        },
      ];
    }

    return items.slice(0, 3);
  }, [dashboard]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadCareData(true)}
            tintColor="#05B547"
          />
        }
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>건강 상황판</Text>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => void loadCareData(true)}
          >
            <Ionicons name="refresh" size={20} color="#111827" />
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: careStatus.backgroundColor,
              borderColor: careStatus.color,
            },
          ]}
        >
          <View style={styles.heroTopRow}>
            <View style={styles.heroTextWrap}>
              <Text style={[styles.heroLabel, { color: careStatus.color }]}>
                오늘 건강 상황판
              </Text>
              <Text style={styles.heroName}>{parentName} 님</Text>
              <Text style={styles.heroDescription}>
                {dashboard?.today_risk_reasons.length
                  ? dashboard.today_risk_reasons.slice(0, 2).join(' · ')
                  : careStatus.description}
              </Text>
            </View>

            <View style={styles.scoreWrap}>
              <Text style={[styles.scoreValue, { color: careStatus.color }]}>
                {careStatus.label}
              </Text>
              <Text style={styles.scoreLabel}>오늘 단계</Text>
            </View>
          </View>

          <View style={styles.heroMetaRow}>
            <MetaPill
              label={dashboard ? `오늘 단계 ${careStatus.label}` : '오늘 단계 확인중'}
            />
            <MetaPill
              label={
                dashboard?.latest_location_captured_at
                  ? `최근 업데이트 ${formatRelativeTime(dashboard.latest_location_captured_at)}`
                  : '최근 업데이트 대기중'
              }
            />
          </View>

          <Text style={styles.heroFootnote}>
            {dashboard
              ? '현재 단계와 최근 건강 신호만 간단히 보여줍니다.'
              : '최신 건강 신호를 정리하고 있습니다.'}
          </Text>
        </View>

        {isLoading && !dashboard && alerts.length === 0 ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color="#05B547" />
            <Text style={styles.stateText}>돌봄 상황판을 불러오는 중입니다.</Text>
          </View>
        ) : null}

        {hasCriticalError ? (
          <View style={styles.stateCard}>
            <Feather name="alert-circle" size={22} color="#DC2626" />
            <Text style={styles.stateTitle}>데이터 연결 실패</Text>
            <Text style={styles.stateText}>
              건강 상황판과 최근 알림을 모두 불러오지 못했어요.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => void loadCareData(true)}
            >
              <Text style={styles.primaryButtonText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!hasCriticalError && loadWarnings.length > 0 ? (
          <View style={styles.noticeCard}>
            <Ionicons name="information-circle-outline" size={18} color="#C2410C" />
            <Text style={styles.noticeText}>
              일부 정보가 비어 있습니다. {loadWarnings.join(' ')}
            </Text>
          </View>
        ) : null}

        {!hasCriticalError ? (
          <>
            <Text style={styles.sectionTitle}>주의 신호</Text>
            <View style={styles.listCard}>
              {attentionSignals.map((item, index) => (
                <StatusSignalRow
                  key={`${item.label}-${index}`}
                  label={item.label}
                  value={item.value}
                  hint={item.hint}
                  tone={item.tone}
                  withDivider={index !== attentionSignals.length - 1}
                />
              ))}
            </View>

            <Text style={styles.sectionTitle}>최근 알림</Text>
            <View style={styles.listCard}>
              {alertsError ? (
                <Text style={styles.errorText}>{alertsError}</Text>
              ) : alerts.length === 0 ? (
                <Text style={styles.emptyText}>최근 알림이 없습니다.</Text>
              ) : null}

              {alerts.map((item, index) => (
                <EvidenceRow
                  key={`${item.type}-${item.created_at}-${index}`}
                  label="최근 알림"
                  description={item.message}
                  meta={formatRelativeTime(item.created_at)}
                  tone="warning"
                  onPress={openAlertsScreen}
                  withDivider={index !== alerts.length - 1}
                />
              ))}
            </View>

            <Text style={styles.sectionTitle}>기본 건강 정보</Text>
            <View style={styles.listCard}>
              <TouchableOpacity
                style={styles.expandButton}
                activeOpacity={0.85}
                onPress={() => setIsProfileExpanded((current) => !current)}
              >
                <View style={styles.expandTextWrap}>
                  <Text style={styles.cardTitle}>약, 질환, 병원 정보</Text>
                  <Text style={styles.cardSubtitle}>
                    등록된 건강 프로필을 확인할 수 있어요.
                  </Text>
                </View>
                <Ionicons
                  name={isProfileExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#111827"
                />
              </TouchableOpacity>

              {isProfileExpanded ? (
                <View style={styles.summaryCardBody}>
                  <Divider />
                  <SummaryRow
                    label="나이 / 성별"
                    value={`${parentAge ? `${parentAge}세` : '-'}${parentGender ? ` · ${parentGender}` : ''}`}
                  />
                  <Divider />
                  <SummaryRow
                    label="복용 중인 약"
                    value={summarizeValues(medicationProfile, '등록된 약 정보가 없습니다.')}
                  />
                  <Divider />
                  <SummaryRow
                    label="보유 질환"
                    value={summarizeValues(diseaseProfile, '등록된 질환 정보가 없습니다.')}
                  />
                  <Divider />
                  <SummaryRow
                    label="알레르기"
                    value={summarizeValues(allergyProfile, '등록된 알레르기 정보가 없습니다.')}
                  />
                  <Divider />
                  <SummaryRow label="주치의 / 병원" value={hospital || '-'} />
                  <Divider />
                  <SummaryRow label="비상 연락처" value={doctorContact || '-'} />
                  {memo ? (
                    <>
                      <Divider />
                      <SummaryRow label="보호자 메모" value={memo} multiline />
                    </>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.collapsedHint}>
                  약, 질환, 알레르기, 병원, 메모를 접어서 보고 있습니다.
                </Text>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MetaPill({ label }: { label: string }) {
  return (
    <View style={styles.metaPill}>
      <Text style={styles.metaPillText}>{label}</Text>
    </View>
  );
}

function StatusSignalRow({
  label,
  value,
  hint,
  tone,
  onPress,
  withDivider = false,
}: {
  label: string;
  value: string;
  hint: string;
  tone: SignalTone;
  onPress?: () => void;
  withDivider?: boolean;
}) {
  const toneStyle = getSignalToneStyle(tone);

  const content = (
    <>
      <View style={[styles.statusSignalIconWrap, { backgroundColor: toneStyle.iconBackground }]}>
        <View style={[styles.signalDot, { backgroundColor: toneStyle.dotColor }]} />
      </View>
      <View style={styles.statusSignalTextWrap}>
        <Text style={styles.statusSignalLabel}>{label}</Text>
        <Text style={styles.statusSignalHint}>{hint}</Text>
      </View>
      <View style={styles.statusSignalValueWrap}>
        <Text style={[styles.statusSignalValue, { color: toneStyle.valueColor }]}>{value}</Text>
        {onPress ? (
          <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
        ) : null}
      </View>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.statusSignalRow, withDivider && styles.withDivider]}
        activeOpacity={0.85}
        onPress={onPress}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.statusSignalRow, withDivider && styles.withDivider]}>
      {content}
    </View>
  );
}

function EvidenceRow({
  label,
  description,
  meta,
  tone = 'neutral',
  onPress,
  withDivider = false,
}: {
  label: string;
  description: string;
  meta?: string;
  tone?: SignalTone;
  onPress?: () => void;
  withDivider?: boolean;
}) {
  const toneStyle = getSignalToneStyle(tone);

  const content = (
    <>
      <View style={[styles.evidenceIconWrap, { backgroundColor: toneStyle.iconBackground }]}>
        <View style={[styles.evidenceDot, { backgroundColor: toneStyle.dotColor }]} />
      </View>
      <View style={styles.evidenceTextWrap}>
        <Text style={styles.evidenceLabel}>{label}</Text>
        <Text style={styles.evidenceDescription}>{description}</Text>
        {meta ? <Text style={styles.evidenceMeta}>{meta}</Text> : null}
      </View>
      {onPress ? (
        <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.evidenceRow, withDivider && styles.withDivider]}
        activeOpacity={0.85}
        onPress={onPress}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.evidenceRow, withDivider && styles.withDivider]}>
      {content}
    </View>
  );
}

function SummaryRow({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={[styles.summaryRow, multiline && styles.summaryRowTopAligned]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, multiline && styles.summaryValueMultiline]}>
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function getSignalToneStyle(tone: SignalTone) {
  if (tone === 'danger') {
    return {
      borderColor: '#FECACA',
      iconBackground: '#FEF2F2',
      dotColor: '#DC2626',
      valueColor: '#B91C1C',
    };
  }

  if (tone === 'warning') {
    return {
      borderColor: '#FED7AA',
      iconBackground: '#FFF7ED',
      dotColor: '#F97316',
      valueColor: '#C2410C',
    };
  }

  if (tone === 'good') {
    return {
      borderColor: '#BBF7D0',
      iconBackground: '#F0FDF4',
      dotColor: '#16A34A',
      valueColor: '#15803D',
    };
  }

  return {
    borderColor: '#E5E7EB',
    iconBackground: '#F8FAFC',
    dotColor: '#64748B',
    valueColor: '#111827',
  };
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
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    marginBottom: 18,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroTextWrap: {
    flex: 1,
  },
  heroLabel: {
    fontSize: 14,
    fontWeight: '800',
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
  scoreWrap: {
    minWidth: 112,
    alignItems: 'flex-end',
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'right',
  },
  scoreLabel: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '700',
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  heroFootnote: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
    color: '#4B5563',
    fontWeight: '600',
  },
  metaPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  metaPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  heroFocusCard: {
    marginTop: 16,
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  heroFocusTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6B7280',
  },
  heroFocusValue: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
  },
  heroFocusText: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: '#4B5563',
    fontWeight: '600',
  },
  stateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
  primaryButton: {
    marginTop: 4,
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 18,
    backgroundColor: '#05B547',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
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
    marginTop: 4,
  },
  statusSignalRow: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  statusSignalIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signalDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  statusSignalTextWrap: {
    flex: 1,
  },
  statusSignalLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '800',
  },
  statusSignalValue: {
    fontSize: 16,
    fontWeight: '900',
    paddingTop: 2,
  },
  statusSignalValueWrap: {
    alignItems: 'flex-end',
    gap: 6,
    paddingTop: 2,
  },
  statusSignalHint: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#6B7280',
    fontWeight: '600',
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
  expandButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  expandTextWrap: {
    flex: 1,
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
  evidenceRow: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  evidenceIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evidenceDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  evidenceTextWrap: {
    flex: 1,
  },
  evidenceLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '800',
  },
  evidenceDescription: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 21,
    color: '#111827',
    fontWeight: '700',
  },
  evidenceMeta: {
    marginTop: 6,
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
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
  collapsedHint: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    color: '#6B7280',
    fontWeight: '600',
  },
  reasonRow: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reasonIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EEFDF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonLabel: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    fontWeight: '700',
  },
  breakdownRow: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  breakdownTextWrap: {
    flex: 1,
  },
  breakdownHint: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#6B7280',
    fontWeight: '600',
  },
  breakdownValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  breakdownScoreWrap: {
    alignItems: 'flex-end',
    minWidth: 64,
  },
  breakdownBand: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '700',
  },
  scoreSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  scoreSummaryValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
  },
  reasonPenalty: {
    fontSize: 15,
    fontWeight: '900',
    color: '#DC2626',
  },
  summaryCardBody: {
    marginTop: 8,
  },
  summaryRow: {
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  summaryRowTopAligned: {
    alignItems: 'flex-start',
  },
  summaryLabel: {
    width: '34%',
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '800',
  },
  summaryValue: {
    width: '62%',
    fontSize: 15,
    color: '#111827',
    fontWeight: '700',
    textAlign: 'right',
  },
  summaryValueMultiline: {
    textAlign: 'left',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  withDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
});

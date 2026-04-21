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
  MaterialCommunityIcons,
} from '@expo/vector-icons';

import {
  getGuardianAlerts,
  getGuardianDashboard,
  GuardianAlertItem,
} from '@/services/guardian';
import { getMedications, MedicationItem } from '@/services/medications';
import { GuardianDashboard } from '@/types/guardian';
import {
  formatGuardianCareScore,
  formatGuardianCareMode,
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

function splitValues(value: string) {
  return value
    .split(/[,/\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

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
  const [medicationItems, setMedicationItems] = React.useState<MedicationItem[]>([]);

  const [dashboardError, setDashboardError] = React.useState<string | null>(null);
  const [alertsError, setAlertsError] = React.useState<string | null>(null);
  const [medicationError, setMedicationError] = React.useState<string | null>(null);

  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const loadCareData = React.useCallback(
    async (manualRefresh = false) => {
      if (!parentId || !linkCode) {
        setDashboard(null);
        setAlerts([]);
        setMedicationItems([]);
        setDashboardError('연동 정보가 없어 오늘 돌봄 점수를 불러올 수 없어요.');
        setAlertsError('연동 정보가 없어 최근 알림을 확인할 수 없어요.');
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

      const [dashboardResult, alertsResult, medicationsResult] =
        await Promise.allSettled([
          getGuardianDashboard(parentId, linkCode),
          getGuardianAlerts(parentId, linkCode, 5),
          getMedications(parentId),
        ]);

      if (dashboardResult.status === 'fulfilled') {
        setDashboard(dashboardResult.value);
        setDashboardError(null);
      } else {
        console.log('돌봄 점수 대시보드 조회 오류:', dashboardResult.reason);
        setDashboard(null);
        setDashboardError('오늘 돌봄 점수를 불러오지 못했어요.');
      }

      if (alertsResult.status === 'fulfilled') {
        setAlerts(alertsResult.value.items);
        setAlertsError(null);
      } else {
        console.log('돌봄 점수 알림 조회 오류:', alertsResult.reason);
        setAlerts([]);
        setAlertsError('최근 알림을 불러오지 못했어요.');
      }

      if (medicationsResult.status === 'fulfilled') {
        setMedicationItems(medicationsResult.value);
        setMedicationError(null);
      } else {
        console.log('돌봄 점수 복약 조회 오류:', medicationsResult.reason);
        setMedicationItems([]);
        setMedicationError('복약 현황을 불러오지 못했어요.');
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
  const medicationProfile = React.useMemo(() => splitValues(medicationsText), [medicationsText]);
  const diseaseProfile = React.useMemo(() => splitValues(diseasesText), [diseasesText]);
  const allergyProfile = React.useMemo(() => splitValues(allergiesText), [allergiesText]);
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

  const loadWarnings = [dashboardError, alertsError, medicationError].filter(Boolean);
  const hasCriticalError =
    !isLoading &&
    !!dashboardError &&
    !!alertsError &&
    !!medicationError &&
    !dashboard &&
    alerts.length === 0 &&
    medicationItems.length === 0;

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
          <Text style={styles.topTitle}>오늘 돌봄 점수</Text>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => void loadCareData(true)}
          >
            <Ionicons name="refresh" size={20} color="#111827" />
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroLabel}>실시간 돌봄 모니터링</Text>
              <Text style={styles.heroName}>{parentName} 님</Text>
              <Text style={styles.heroSubtext}>{careStatus.description}</Text>
            </View>

            <View
              style={[
                styles.statusBadgeWrap,
                { backgroundColor: careStatus.backgroundColor },
              ]}
            >
              <MaterialCommunityIcons
                name="heart-pulse"
                size={18}
                color={careStatus.color}
              />
              <Text style={[styles.statusBadgeText, { color: careStatus.color }]}>
                {dashboard
                  ? `${careStatus.label} · ${formatGuardianCareScore(dashboard.care_score)}`
                  : careStatus.label}
              </Text>
            </View>
          </View>

          <View style={styles.heroMetaRow}>
            <MetaChip
              icon={<Ionicons name="shield-checkmark-outline" size={16} color="#0F172A" />}
              label={
                dashboard ? formatGuardianCareMode(dashboard.care_mode) : '돌봄 정보 확인중'
              }
            />
            <MetaChip
              icon={<Ionicons name="time-outline" size={16} color="#0F172A" />}
              label={
                dashboard?.latest_location_captured_at
                  ? `최근 감지 ${formatRelativeTime(dashboard.latest_location_captured_at)}`
                  : '최근 기록 대기중'
              }
            />
          </View>

          <View style={styles.heroSummaryCard}>
            <View style={styles.heroSummaryTextWrap}>
              <Text style={styles.heroSummaryName}>
                {parentAge ? `${parentAge}세` : '나이 정보 없음'}
                {parentGender ? ` · ${parentGender}` : ''}
              </Text>
              <Text style={styles.heroSummarySubtext}>
                {dashboard
                  ? `${formatGuardianCareScore(dashboard.care_score)} · 체크인 ${formatGuardianCheckInStatus(dashboard.check_in_status)}`
                  : '체크인 상태를 불러오는 중입니다.'}
              </Text>
            </View>
            <Text style={styles.heroSummaryCode}>연동코드 {linkCode || '-'}</Text>
          </View>
        </View>

        {isLoading && !dashboard && alerts.length === 0 && medicationItems.length === 0 ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color="#05B547" />
            <Text style={styles.stateText}>오늘 돌봄 점수를 불러오는 중입니다.</Text>
          </View>
        ) : null}

        {hasCriticalError ? (
          <View style={styles.stateCard}>
            <Feather name="alert-circle" size={22} color="#DC2626" />
            <Text style={styles.stateTitle}>데이터 연결 실패</Text>
            <Text style={styles.stateText}>
              돌봄 점수, 복약, 알림 정보를 모두 불러오지 못했어요.
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
            <Text style={styles.sectionTitle}>점수 반영 항목</Text>
            <View style={styles.listCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.cardTitle}>오늘 돌봄 점수</Text>
                <Text style={styles.cardSubtitle}>
                  {dashboard ? `총 감점 ${dashboard.care_penalties.total}점` : ''}
                </Text>
              </View>

              {!dashboard ? (
                <Text style={styles.emptyText}>점수 계산 정보를 확인하는 중입니다.</Text>
              ) : dashboard.care_penalty_items.length === 0 ? (
                <Text style={styles.emptyText}>오늘 감점 요인이 없어 100점을 유지하고 있어요.</Text>
              ) : (
                dashboard.care_penalty_items.map((item, index) => (
                  <View
                    key={`${item.label}-${index}`}
                    style={[
                      styles.alertRow,
                      index !== dashboard.care_penalty_items.length - 1 && styles.withDivider,
                    ]}
                  >
                    <View style={styles.alertIconWrap}>
                      <Ionicons name="pulse-outline" size={18} color="#05B547" />
                    </View>
                    <View style={styles.alertTextWrap}>
                      <Text style={styles.alertTitle}>{item.label}</Text>
                    </View>
                    <Text style={styles.carePenaltyText}>-{item.penalty}점</Text>
                  </View>
                ))
              )}
            </View>

            <Text style={styles.sectionTitle}>핵심 신호</Text>
            <View style={styles.metricsGrid}>
              <MetricCard
                icon={<Ionicons name="chatbubble-ellipses-outline" size={20} color="#05B547" />}
                label="체크인"
                value={
                  dashboard
                    ? formatGuardianCheckInStatus(dashboard.check_in_status)
                    : '확인중'
                }
              />
              <MetricCard
                icon={<MaterialCommunityIcons name="pill" size={20} color="#05B547" />}
                label="미확인 복약"
                value={dashboard ? `${dashboard.today_medication_pending_count}건` : '-'}
              />
              <MetricCard
                icon={<Ionicons name="notifications-outline" size={20} color="#05B547" />}
                label="열린 알림"
                value={dashboard ? `${dashboard.open_alert_count}건` : '-'}
              />
              <MetricCard
                icon={<Ionicons name="calendar-outline" size={20} color="#05B547" />}
                label="오늘 일정"
                value={dashboard ? `${dashboard.today_schedule_count}건` : '-'}
              />
            </View>

            <View style={styles.locationCard}>
              <View style={styles.locationHeader}>
                <View style={styles.locationIconWrap}>
                  <Ionicons name="location-outline" size={18} color="#05B547" />
                </View>
                <View style={styles.locationTextWrap}>
                  <Text style={styles.locationLabel}>현재 위치 상태</Text>
                  <Text style={styles.locationValue}>
                    {dashboard?.latest_location_label || '위치 정보 확인 중'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.inlineActionButton}
                onPress={() =>
                  router.push({
                    pathname: '/guardian-location',
                    params: {
                      parentId,
                      parentName,
                      linkCode,
                    },
                  })
                }
              >
                <Text style={styles.inlineActionButtonText}>위치 보기</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>복약 현황</Text>
            <View style={styles.medicationSummaryRow}>
              <MiniStatCard label="완료" value={`${medicationSummary.taken}건`} />
              <MiniStatCard label="대기" value={`${medicationSummary.scheduled}건`} />
              <MiniStatCard label="놓침" value={`${medicationSummary.missed}건`} />
            </View>

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
                        <Text
                          style={[
                            styles.medicationStatusText,
                            { color: badgeStyle.color },
                          ]}
                        >
                          {item.status_label}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            <Text style={styles.sectionTitle}>건강 정보</Text>
            <View style={styles.infoCard}>
              <TagSection
                icon={<MaterialCommunityIcons name="pill" size={18} color="#05B547" />}
                label="복용 중인 약"
                values={medicationProfile}
                fallback="등록된 약 정보가 없습니다."
              />
              <Divider />
              <TagSection
                icon={<MaterialCommunityIcons name="stethoscope" size={18} color="#05B547" />}
                label="보유 질환"
                values={diseaseProfile}
                fallback="등록된 질환 정보가 없습니다."
              />
              <Divider />
              <TagSection
                icon={<Ionicons name="alert-circle-outline" size={18} color="#05B547" />}
                label="알레르기"
                values={allergyProfile}
                fallback="등록된 알레르기 정보가 없습니다."
              />
              <Divider />
              <InfoRow
                icon={<Ionicons name="medical-outline" size={18} color="#05B547" />}
                label="주치의 / 병원"
                value={hospital || '-'}
              />
              <Divider />
              <InfoRow
                icon={<Ionicons name="call-outline" size={18} color="#05B547" />}
                label="비상 연락처"
                value={doctorContact || '-'}
              />
              <Divider />
              <InfoRow
                icon={<Feather name="edit-3" size={17} color="#05B547" />}
                label="보호자 메모"
                value={memo || '-'}
                multiline
              />
            </View>

            <Text style={styles.sectionTitle}>최근 알림</Text>
            <View style={styles.listCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.cardTitle}>이상 징후 및 알림</Text>
                <Text style={styles.cardSubtitle}>최근 5건</Text>
              </View>

              {alertsError ? (
                <Text style={styles.errorText}>{alertsError}</Text>
              ) : alerts.length === 0 ? (
                <Text style={styles.emptyText}>최근 알림이 없습니다.</Text>
              ) : (
                alerts.map((item, index) => (
                  <View
                    key={`${item.type}-${item.created_at}-${index}`}
                    style={[
                      styles.alertRow,
                      index !== alerts.length - 1 && styles.withDivider,
                    ]}
                  >
                    <View style={styles.alertIconWrap}>
                      <Ionicons name="notifications-outline" size={18} color="#05B547" />
                    </View>
                    <View style={styles.alertTextWrap}>
                      <Text style={styles.alertTitle}>{item.message}</Text>
                      <Text style={styles.alertTime}>
                        {formatRelativeTime(item.created_at)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() =>
                  router.push({
                    pathname: '/guardian-schedules',
                    params: {
                      parentId,
                      parentName,
                      linkCode,
                    },
                  })
                }
              >
                <View style={styles.actionIconWrap}>
                  <Ionicons name="calendar-outline" size={22} color="#05B547" />
                </View>
                <Text style={styles.actionTitle}>병원 일정 보기</Text>
                <Text style={styles.actionSubtitle}>진료와 방문 일정을 관리합니다</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCard}
                onPress={() =>
                  router.push({
                    pathname: '/guardian-parent-info',
                    params: {
                      parentId,
                      parentName,
                      parentAge,
                      parentGender,
                      linkCode,
                      medications: medicationsText,
                      diseases: diseasesText,
                      allergies: allergiesText,
                      hospital,
                      doctorContact,
                      memo,
                    },
                  })
                }
              >
                <View style={styles.actionIconWrap}>
                  <Ionicons name="create-outline" size={22} color="#05B547" />
                </View>
                <Text style={styles.actionTitle}>돌봄 정보 수정</Text>
                <Text style={styles.actionSubtitle}>질환, 약, 메모를 업데이트합니다</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MetaChip({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <View style={styles.metaChip}>
      {icon}
      <Text style={styles.metaChipText}>{label}</Text>
    </View>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIconWrap}>{icon}</View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
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

function TagSection({
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
  return (
    <View style={styles.tagSection}>
      <View style={styles.infoHeader}>
        <View style={styles.infoIcon}>{icon}</View>
        <Text style={styles.infoLabel}>{label}</Text>
      </View>

      {values.length === 0 ? (
        <Text style={styles.emptyInlineText}>{fallback}</Text>
      ) : (
        <View style={styles.tagsWrap}>
          {values.map((value) => (
            <View key={`${label}-${value}`} style={styles.tagChip}>
              <Text style={styles.tagChipText}>{value}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  multiline = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={[styles.infoRow, multiline && styles.infoRowTopAligned]}>
      <View style={styles.infoHeader}>
        <View style={styles.infoIcon}>{icon}</View>
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={[styles.infoValue, multiline && styles.infoValueMultiline]}>
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F1F1F1',
  },
  container: {
    padding: 20,
    paddingBottom: 36,
    backgroundColor: '#F1F1F1',
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
    backgroundColor: '#05D34E',
    borderRadius: 24,
    padding: 16,
    marginBottom: 18,
  },
  heroHeader: {
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
    fontWeight: '700',
    color: '#E8FFF0',
  },
  heroName: {
    marginTop: 6,
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroSubtext: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: '#EFFFF4',
    fontWeight: '600',
  },
  statusBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '800',
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D9FFE7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  metaChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  heroSummaryCard: {
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  heroSummaryTextWrap: {
    flex: 1,
  },
  heroSummaryName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  heroSummarySubtext: {
    marginTop: 6,
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '600',
  },
  heroSummaryCode: {
    fontSize: 13,
    fontWeight: '700',
    color: '#05B547',
  },
  stateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
    marginBottom: 18,
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
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  metricIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#EEFDF3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  metricLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '700',
  },
  metricValue: {
    marginTop: 6,
    fontSize: 20,
    color: '#111827',
    fontWeight: '800',
  },
  locationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  locationIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#EEFDF3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  locationTextWrap: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '700',
  },
  locationValue: {
    marginTop: 4,
    fontSize: 16,
    color: '#111827',
    fontWeight: '800',
  },
  inlineActionButton: {
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#EEFDF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineActionButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#047857',
  },
  medicationSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
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
  infoRow: {
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  infoRowTopAligned: {
    alignItems: 'flex-start',
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '40%',
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
  infoValue: {
    width: '56%',
    fontSize: 15,
    color: '#111827',
    fontWeight: '700',
    textAlign: 'right',
  },
  infoValueMultiline: {
    textAlign: 'left',
  },
  emptyInlineText: {
    marginTop: 10,
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  tagChip: {
    borderRadius: 999,
    backgroundColor: '#EEFDF3',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tagChipText: {
    fontSize: 13,
    color: '#166534',
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },
  alertRow: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  alertIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEFDF3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  alertTextWrap: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 21,
  },
  alertTime: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  carePenaltyText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#C2410C',
  },
  withDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  actionCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 132,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#EEFDF3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  actionSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: '#6B7280',
    fontWeight: '600',
  },
});

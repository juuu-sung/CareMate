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
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  getGuardianDashboard,
  getGuardianSafetyZones,
  GuardianSafetyZoneItem,
} from '@/services/guardian';
import { GuardianDashboard } from '@/types/guardian';
import { getGuardianCareStatus } from '@/utils/guardianCare';
import {
  GuardianLatestLocationResponse,
  getGuardianLatestLocation,
} from '@/services/guardianLocation';

function formatRelativeTime(timestamp: string) {
  if (!timestamp) return '기록 없음';
  const target = new Date(timestamp);
  if (Number.isNaN(target.getTime())) return '기록 없음';
  const diffMs = Date.now() - target.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));
  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  return `${Math.floor(diffHours / 24)}일 전`;
}

function summarizeSafetyZones(zones: GuardianSafetyZoneItem[]) {
  const enabled = zones.filter((z) => z.enabled);
  if (zones.length === 0) return { label: '안전구역 미설정', color: '#64748B' };
  if (enabled.length === 0) return { label: '안전구역 꺼짐', color: '#64748B' };
  if (enabled.some((z) => z.last_status === 'outside')) return { label: '안전구역 벗어남', color: '#DC2626' };
  if (enabled.every((z) => z.last_status === 'inside')) return { label: '안전구역 안', color: '#15803D' };
  return { label: '안전구역 확인 전', color: '#2563EB' };
}

export default function GuardianSafetyDashboardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parentId = String(params.parentId || params.elderUserId || '');
  const parentName = String(params.parentName || '부모님');
  const parentAge = String(params.parentAge || '');
  const parentGender = String(params.parentGender || '');
  const linkCode = String(params.linkCode || '');
  const medications = String(params.medications || '');
  const diseases = String(params.diseases || '');
  const allergies = String(params.allergies || '');
  const hospital = String(params.hospital || '');
  const doctorContact = String(params.doctorContact || '');
  const memo = String(params.memo || '');

  const [dashboard, setDashboard] = React.useState<GuardianDashboard | null>(null);
  const [latestLocation, setLatestLocation] = React.useState<GuardianLatestLocationResponse | null>(null);
  const [safetyZones, setSafetyZones] = React.useState<GuardianSafetyZoneItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const careStatus = getGuardianCareStatus(dashboard, !!error);
  const safetyZoneSummary = React.useMemo(() => summarizeSafetyZones(safetyZones), [safetyZones]);

  const load = React.useCallback(async (manualRefresh = false) => {
    if (!parentId || !linkCode) {
      setError('연동 정보가 없어요.');
      setIsLoading(false);
      return;
    }
    if (manualRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    const [dashRes, locRes, zoneRes] = await Promise.allSettled([
      getGuardianDashboard(parentId, linkCode),
      getGuardianLatestLocation(parentId, linkCode),
      getGuardianSafetyZones(parentId, linkCode),
    ]);

    setDashboard(dashRes.status === 'fulfilled' ? dashRes.value : null);
    setLatestLocation(locRes.status === 'fulfilled' ? locRes.value : null);
    setSafetyZones(zoneRes.status === 'fulfilled' ? (zoneRes.value?.items ?? []) : []);
    setError(dashRes.status === 'rejected' ? '데이터를 불러오지 못했어요.' : null);
    setIsLoading(false);
    setIsRefreshing(false);
  }, [linkCode, parentId]);

  useFocusEffect(React.useCallback(() => { void load(); }, [load]));

  const openHealth = () => router.push({
    pathname: '/guardian-health',
    params: { parentId, parentName, parentAge, parentGender, linkCode, medications, diseases, allergies, hospital, doctorContact, memo },
  } as any);

  const openLocation = () => router.push({
    pathname: '/guardian-location',
    params: { parentId, elderUserId: parentId, parentName, linkCode },
  } as any);

  const openMedications = () => router.push({
    pathname: '/guardian-medications',
    params: { parentId, parentName, parentAge, parentGender, linkCode, medications, diseases, allergies, hospital, doctorContact, memo },
  } as any);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.85} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>안전 대시보드</Text>
          <Text style={styles.headerSubtitle}>{parentName} 님의 건강·위치·복약 현황</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void load(true)} tintColor="#05B547" />
        }
      >
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color="#05B547" />
            <Text style={styles.loadingText}>데이터를 불러오는 중이에요</Text>
          </View>
        ) : (
          <>
            {/* 건강 상황판 */}
            <Text style={styles.sectionTitle}>건강 상황판</Text>
            <TouchableOpacity style={[styles.card, { borderColor: careStatus.color + '44' }]} activeOpacity={0.88} onPress={openHealth}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardIconWrap, { backgroundColor: careStatus.backgroundColor }]}>
                  <MaterialCommunityIcons name="clipboard-pulse-outline" size={24} color={careStatus.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: careStatus.color }]}>{careStatus.label}</Text>
                  {dashboard?.care_summary ? (
                    <Text style={styles.cardDesc} numberOfLines={2}>{dashboard.care_summary}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
              </View>
              {dashboard && (
                <View style={styles.cardBody}>
                  <StatRow label="건강 점수" value={`${dashboard.care_score}점`} />
                  <StatRow label="체크인 상태" value={
                    dashboard.check_in_status === 'responded' ? '응답 완료' :
                    dashboard.check_in_status === 'pending' ? '확인 중' : '미응답'
                  } />
                  {dashboard.today_risk_reasons?.length > 0 && (
                    <StatRow label="주요 신호" value={dashboard.today_risk_reasons[0]} />
                  )}
                </View>
              )}
            </TouchableOpacity>

            {/* 위치 확인 */}
            <Text style={styles.sectionTitle}>위치 확인</Text>
            <TouchableOpacity style={styles.card} activeOpacity={0.88} onPress={openLocation}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <Feather name="map-pin" size={24} color="#05B547" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>
                    {latestLocation?.status === 'available'
                      ? (latestLocation.label || dashboard?.latest_location_label || '위치 확인됨')
                      : (dashboard?.latest_location_label || '위치 확인 중')}
                  </Text>
                  <Text style={[styles.cardDesc, { color: safetyZoneSummary.color }]}>
                    {safetyZoneSummary.label}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
              </View>
              {dashboard?.latest_location_captured_at && (
                <View style={styles.cardBody}>
                  <StatRow
                    label="최근 업데이트"
                    value={formatRelativeTime(dashboard.latest_location_captured_at)}
                  />
                </View>
              )}
            </TouchableOpacity>

            {/* 복약 완료율 */}
            <Text style={styles.sectionTitle}>복약 완료율</Text>
            <TouchableOpacity style={styles.card} activeOpacity={0.88} onPress={openMedications}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <MaterialCommunityIcons name="pill" size={24} color="#05B547" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>
                    오늘 {dashboard?.today_medication_completion_rate ?? 0}% 완료
                  </Text>
                  <Text style={styles.cardDesc}>
                    {dashboard
                      ? `복약 ${dashboard.today_medication_taken_count}/${dashboard.today_medication_total_count}회`
                      : '복약 현황 확인 중'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
              </View>
              {dashboard && (
                <View style={styles.cardBody}>
                  <StatRow label="완료" value={`${dashboard.today_medication_taken_count}회`} />
                  <StatRow label="미복약" value={`${dashboard.missed_medication_count}회`} />
                  {dashboard.overdue_medication_count > 0 && (
                    <StatRow label="지연" value={`${dashboard.overdue_medication_count}회`} valueColor="#DC2626" />
                  )}
                </View>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F1F5F9' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: '#F1F5F9',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  headerSubtitle: { marginTop: 2, fontSize: 13, color: '#64748B', fontWeight: '600' },
  container: { paddingHorizontal: 20, paddingBottom: 40 },
  loadingWrap: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 15, color: '#64748B', fontWeight: '600' },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
    marginTop: 6,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#111827',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#EEFDF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  cardDesc: { marginTop: 3, fontSize: 13, color: '#64748B', fontWeight: '600', lineHeight: 19 },
  cardBody: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 14,
    gap: 8,
  },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statLabel: { fontSize: 14, color: '#6B7280', fontWeight: '600' },
  statValue: { fontSize: 14, color: '#111827', fontWeight: '800' },
});

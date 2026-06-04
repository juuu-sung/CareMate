import React from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Circle, Marker } from 'react-native-maps';
import {
  Ionicons,
  MaterialCommunityIcons,
  Feather,
  FontAwesome6,
} from '@expo/vector-icons';
import {
  buildGuardianAuthSession,
  clearAuthSession,
  saveAuthSession,
} from '@/services/authSession';
import {
  getGuardianAlerts,
  getGuardianDashboard,
  getGuardianSafetyZones,
  GuardianAlertItem,
  GuardianSafetyZoneItem,
} from '@/services/guardian';
import { GuardianDashboard } from '@/types/guardian';
import {
  getGuardianCareStatus,
} from '@/utils/guardianCare';
import {
  GuardianLatestLocationResponse,
  getGuardianLatestLocation,
} from '@/services/guardianLocation';
import { requestGuardianLocationRefresh } from '@/services/locations';

type StatItem = {
  label: string;
  value: string;
  iconType: 'Ionicons' | 'MaterialCommunityIcons' | 'Feather' | 'FontAwesome6';
  iconName: string;
  action?: 'health' | 'medication' | 'schedules' | 'location';
};

type MenuItem = {
  title: string;
  subtitle: string;
  iconType: 'Ionicons' | 'MaterialCommunityIcons' | 'Feather' | 'FontAwesome6';
  iconName: string;
};

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

function getBracketSection(text: string, title: string) {
  const match = String(text || '').match(
    new RegExp(`\\[${title}\\]([\\s\\S]*?)(?=\\n\\s*\\[|$)`)
  );
  return match?.[1]?.trim() || '';
}

function cleanMedicationDisplayName(value: string) {
  return String(value || '')
    .replace(/^\s*[-*.\d)]+/, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isKnownMedicationValue(value: string) {
  const raw = String(value || '').trim();
  return !!raw && !raw.includes('확인 불가') && !raw.includes('확인 필요');
}

function formatStructuredMedicationLine(line: string) {
  const body = String(line || '').replace(/^\s*-\s*/, '').trim();
  if (!body) {
    return '';
  }

  if (body.includes('|')) {
    const fields = body.split('|').reduce<Record<string, string>>((acc, part) => {
      const [rawKey, ...rawValue] = part.split(':');
      if (!rawKey || rawValue.length === 0) {
        return acc;
      }
      acc[rawKey.trim()] = rawValue.join(':').trim();
      return acc;
    }, {});
    const name = cleanMedicationDisplayName(fields['약 이름'] || fields['약이름'] || '');
    if (!name) {
      return '';
    }

    const details = [
      fields['복용 시점'],
      fields['1일 복용 횟수'] || fields['복용 횟수'] || fields['횟수'],
      fields['처방 일수'] || fields['일수'],
      fields['1회 용량'] || fields['투약량'],
    ].filter((item): item is string => isKnownMedicationValue(item || ''));

    return details.length > 0 ? `${name}: ${details.join(' / ')}` : name;
  }

  const separatorIndex = Math.max(body.indexOf(':'), body.indexOf('：'));
  if (separatorIndex >= 0) {
    const name = cleanMedicationDisplayName(body.slice(0, separatorIndex));
    const note = body.slice(separatorIndex + 1).trim();
    if (!name) {
      return '';
    }
    return isKnownMedicationValue(note) ? `${name}: ${note}` : name;
  }

  return cleanMedicationDisplayName(body);
}

function formatMedicationSummaryForDisplay(value: string) {
  const text = String(value || '').trim();
  if (!text) {
    return '-';
  }

  const easyNameSection = getBracketSection(text, '쉬운 약 이름');
  const easyNames = easyNameSection
    ? easyNameSection
        .split(/\n+/)
        .map((line) => {
          const body = String(line || '').replace(/^\s*-\s*/, '').trim();
          const separatorIndex = Math.max(body.indexOf(':'), body.indexOf('：'));
          const valueText =
            separatorIndex >= 0 ? body.slice(separatorIndex + 1) : body;
          return cleanMedicationDisplayName(valueText);
        })
        .filter(isKnownMedicationValue)
    : [];

  if (easyNames.length > 0) {
    return Array.from(new Set(easyNames)).join('\n');
  }

  const medicationListSection = getBracketSection(text, '복용 중인 약');
  const structuredSection = getBracketSection(text, '복약 구조화');
  const guideSection = getBracketSection(text, '복약 안내');
  const section = /[:：]/.test(medicationListSection)
    ? medicationListSection
    : structuredSection || medicationListSection || guideSection;
  const lines = section ? section.split(/\n+/) : text.split(/[\n,;/]+/);
  const seen = new Set<string>();
  const formatted = lines
    .map(formatStructuredMedicationLine)
    .filter((line) => {
      if (!line || seen.has(line)) {
        return false;
      }
      seen.add(line);
      return true;
    });

  return formatted.length > 0 ? formatted.join('\n') : text;
}

export default function GuardianHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const guardianId = String(params.guardianId || params.guardian_id || '');
  const parentId = String(params.parentId || params.elderUserId || '');
  const parentName = String(params.parentName || '김영희');
  const parentAge = String(params.parentAge || '78');
  const parentGender = String(params.parentGender || '여성');
  const linkCode = String(params.linkCode || '');

  const medications = String(params.medications || '');
  const diseases = String(params.diseases || '');
  const hospital = String(params.hospital || '');
  const doctorContact = String(params.doctorContact || '');
  const memo = String(params.memo || '');
  const allergies = String(params.allergies || '');
  const medicationDisplayText = React.useMemo(
    () => formatMedicationSummaryForDisplay(medications),
    [medications]
  );

  const [dashboard, setDashboard] = React.useState<GuardianDashboard | null>(null);
  const [alerts, setAlerts] = React.useState<GuardianAlertItem[]>([]);
  const [isLoadingDashboard, setIsLoadingDashboard] = React.useState(true);
  const [dashboardError, setDashboardError] = React.useState<string | null>(null);
  const [latestLocation, setLatestLocation] =
    React.useState<GuardianLatestLocationResponse | null>(null);
  const [safetyZones, setSafetyZones] = React.useState<GuardianSafetyZoneItem[]>([]);
  const [isRequestingLocation, setIsRequestingLocation] = React.useState(false);

  const careStatus = getGuardianCareStatus(dashboard, !!dashboardError);
  const latestLocationRegion = React.useMemo(() => {
    if (
      latestLocation?.status !== 'available' ||
      latestLocation.latitude == null ||
      latestLocation.longitude == null
    ) {
      return null;
    }

    return {
      latitude: latestLocation.latitude,
      longitude: latestLocation.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
  }, [latestLocation]);
  const safetyZoneSummary = React.useMemo(
    () => summarizeSafetyZones(safetyZones),
    [safetyZones]
  );

  React.useEffect(() => {
    if (!parentId || !linkCode) {
      return;
    }

    void saveAuthSession(
      buildGuardianAuthSession({
        guardianId,
        parentId,
        parentName,
        parentAge,
        parentGender,
        linkCode,
        medications,
        diseases,
        allergies,
        hospital,
        doctorContact,
        memo,
      })
    ).catch((error) => {
      console.log('보호자 홈 세션 동기화 오류:', error);
    });
  }, [
    allergies,
    diseases,
    doctorContact,
    guardianId,
    hospital,
    linkCode,
    medications,
    memo,
    parentAge,
    parentGender,
    parentId,
    parentName,
  ]);

  const quickStats: StatItem[] = [
    {
      label: '건강 상황판',
      value: dashboard ? careStatus.label : '-',
      iconType: 'MaterialCommunityIcons',
      iconName: 'clipboard-pulse-outline',
      action: 'health',
    },
    {
      label: '위치 확인',
      value: dashboard ? dashboard.latest_location_label : '-',
      iconType: 'Feather',
      iconName: 'map-pin',
      action: 'location',
    },
    {
      label: '오늘 일정',
      value: dashboard ? `${dashboard.today_schedule_count}건` : '-',
      iconType: 'Ionicons',
      iconName: 'calendar-outline',
      action: 'schedules',
    },
    {
      label: '복약 완료율',
      value: dashboard ? `${dashboard.today_medication_completion_rate ?? 0}%` : '-',
      iconType: 'MaterialCommunityIcons',
      iconName: 'heart-pulse',
      action: 'medication',
    },
  ];

  const menuItems: MenuItem[] = [
    {
      title: '대화 요약',
      subtitle: '오늘 나눈 대화를 확인해요',
      iconType: 'Ionicons',
      iconName: 'document-text-outline',
    },
    {
      title: '우울증 위험 분석',
      subtitle: '기분 변화와 위험 신호를 살펴봐요',
      iconType: 'MaterialCommunityIcons',
      iconName: 'brain',
    },
    {
      title: '음성 질문',
      subtitle: '부모님 상태를 바로 물어봐요',
      iconType: 'Ionicons',
      iconName: 'mic-outline',
    },
    {
      title: '편지 쓰기',
      subtitle: '부모님께 메시지를 보내요',
      iconType: 'Ionicons',
      iconName: 'mail-outline',
    },
    {
      title: '병원 일정',
      subtitle: '다가오는 일정을 관리해요',
      iconType: 'Ionicons',
      iconName: 'medical-outline',
    },
    {
      title: '알림 기록',
      subtitle: '날짜별 알림을 확인해요',
      iconType: 'Ionicons',
      iconName: 'calendar-outline',
    },
    {
      title: '정보 수정',
      subtitle: '부모님 정보를 수정해요',
      iconType: 'Ionicons',
      iconName: 'settings-outline',
    },
  ];

  const loadGuardianData = React.useCallback(async () => {
    if (!parentId || !linkCode) {
      setDashboard(null);
      setAlerts([]);
      setDashboardError('연동 정보가 없어 보호자 홈 데이터를 불러올 수 없어요.');
      setIsLoadingDashboard(false);
      return;
    }

    setIsLoadingDashboard(true);
    setDashboardError(null);

    try {
      const [dashboardResponse, alertsResponse] = await Promise.all([
        getGuardianDashboard(parentId, linkCode),
        getGuardianAlerts(parentId, linkCode),
      ]);
      const [latestLocationResponse, safetyZoneResponse] = await Promise.all([
        getGuardianLatestLocation(parentId, linkCode).catch((locationError) => {
          console.log('보호자 홈 위치 조회 오류:', locationError);
          return null;
        }),
        getGuardianSafetyZones(parentId, linkCode).catch((zoneError) => {
          console.log('보호자 홈 안전구역 조회 오류:', zoneError);
          return null;
        }),
      ]);

      setDashboard(dashboardResponse);
      setAlerts(alertsResponse.items);
      setLatestLocation(latestLocationResponse);
      setSafetyZones(safetyZoneResponse?.items ?? []);
    } catch (error) {
      console.log('보호자 홈 조회 오류:', error);
      setDashboard(null);
      setAlerts([]);
      setLatestLocation(null);
      setSafetyZones([]);
      setDashboardError('보호자 홈 정보를 불러오지 못했어요.');
    } finally {
      setIsLoadingDashboard(false);
    }
  }, [linkCode, parentId]);

  useFocusEffect(
    React.useCallback(() => {
      void loadGuardianData();
    }, [loadGuardianData])
  );

  const headerStatusText = dashboardError
    ? '데이터 연결 확인 필요'
    : dashboard
      ? `오늘 상태 ${careStatus.label}`
      : '데이터 불러오는 중';

  const openGuardianAlerts = React.useCallback(() => {
    router.push({
      pathname: '/guardian-alerts',
      params: {
        parentId,
        parentName,
        linkCode,
      },
    });
  }, [linkCode, parentId, parentName, router]);

  const openGuardianAlertHistory = React.useCallback(() => {
    router.push({
      pathname: '/guardian-alert-history',
      params: {
        parentId,
        parentName,
        linkCode,
      },
    });
  }, [linkCode, parentId, parentName, router]);

  const openGuardianConversations = React.useCallback(() => {
    router.push({
      pathname: '/guardian-conversations',
      params: {
        parentId,
        parentName,
        linkCode,
      },
    });
  }, [linkCode, parentId, parentName, router]);

  const openGuardianDepressionRisk = React.useCallback(() => {
    router.push({
      pathname: '/guardian-depression-risk',
      params: {
        parentId,
        parentName,
        linkCode,
      },
    } as any);
  }, [linkCode, parentId, parentName, router]);

  const openGuardianSchedules = React.useCallback(() => {
    router.push({
      pathname: '/guardian-schedules',
      params: {
        parentId,
        parentName,
        linkCode,
      },
    });
  }, [linkCode, parentId, parentName, router]);

  const openParentCalendar = React.useCallback(() => {
    router.push({
      pathname: '/calendar',
      params: {
        parentId,
        viewerRole: 'guardian',
      },
    });
  }, [parentId, router]);

  const openGuardianLocation = React.useCallback(() => {
    router.push({
      pathname: '/guardian-location',
      params: {
        parentId,
        elderUserId: parentId,
        parentName,
        linkCode,
      },
    } as any);
  }, [linkCode, parentId, parentName, router]);

  const openGuardianHealth = React.useCallback(() => {
    router.push({
      pathname: '/guardian-health',
      params: {
        parentId,
        parentName,
        parentAge,
        parentGender,
        linkCode,
        medications,
        diseases,
        allergies,
        hospital,
        doctorContact,
        memo,
      },
    } as any);
  }, [
    allergies,
    diseases,
    doctorContact,
    hospital,
    linkCode,
    medications,
    memo,
    parentAge,
    parentGender,
    parentId,
    parentName,
    router,
  ]);

  const openGuardianMedications = React.useCallback(() => {
    router.push({
      pathname: '/guardian-medications',
      params: {
        parentId,
        parentName,
        parentAge,
        parentGender,
        linkCode,
        medications,
        diseases,
        allergies,
        hospital,
        doctorContact,
        memo,
      },
    } as any);
  }, [
    allergies,
    diseases,
    doctorContact,
    hospital,
    linkCode,
    medications,
    memo,
    parentAge,
    parentGender,
    parentId,
    parentName,
    router,
  ]);

  const handleQuickStatPress = React.useCallback(
    (item: StatItem) => {
      if (item.action === 'health') {
        openGuardianHealth();
        return;
      }

      if (item.action === 'schedules') {
        openParentCalendar();
        return;
      }

      if (item.action === 'location') {
        openGuardianLocation();
        return;
      }

      if (item.action === 'medication') {
        openGuardianMedications();
      }
    },
    [openGuardianHealth, openGuardianLocation, openGuardianMedications, openParentCalendar]
  );

  const handleRequestLocationRefresh = React.useCallback(async () => {
    if (!parentId || !linkCode) {
      Alert.alert('위치 요청 실패', '연동 정보가 없어 위치를 요청할 수 없어요.');
      return;
    }

    try {
      setIsRequestingLocation(true);
      await requestGuardianLocationRefresh(parentId, linkCode);
      Alert.alert(
        '위치 요청 전달됨',
        '부모님 앱이 반응하면 잠시 후 지도에 최신 위치가 반영됩니다.'
      );
      setTimeout(() => {
        void loadGuardianData();
      }, 12000);
    } catch (error) {
      Alert.alert(
        '위치 요청 실패',
        error instanceof Error ? error.message : '현재 위치 요청에 실패했습니다.'
      );
    } finally {
      setIsRequestingLocation(false);
    }
  }, [linkCode, loadGuardianData, parentId]);

  const handleMenuPress = (title: string) => {
    if (title === '대화 요약') {
      openGuardianConversations();
      return;
    }

    if (title === '우울증 위험 분석') {
      openGuardianDepressionRisk();
      return;
    }

    if (title === '병원 일정') {
      openGuardianSchedules();
      return;
    }

    if (title === '음성 질문') {
      router.push({
        pathname: '/chat',
        params: {
          input: 'voice',
          autostart: '1',
          elderUserId: parentId,
          elder_user_id: parentId,
          parentId,
          parentName,
          linkCode,
          link_code: linkCode,
          requesterRole: 'guardian',
        },
      });
      return;
    }

    if (title === '알림 기록') {
      openGuardianAlertHistory();
      return;
    }

    if (title === '편지 쓰기') {
      router.push({
        pathname: '/guardian-letter',
        params: {
          parentId,
          elderUserId: parentId,
          parentName,
          parentAge,
          parentGender,
          linkCode,
          medications,
          diseases,
          allergies,
          hospital,
          doctorContact,
          memo,
        },
      });
      return;
    }

    if (title === '정보 수정') {
      router.push({
        pathname: '/guardian-parent-info',
        params: {
          parentId,
          parentName,
          parentAge,
          parentGender,
          linkCode,
          medications,
          diseases,
          allergies,
          hospital,
          doctorContact,
          memo,
        },
      });
      return;
    }
  };

  const handleLogout = () => {
    Alert.alert('로그아웃', '현재 로그인 정보를 지우고 처음 화면으로 돌아갈까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await clearAuthSession();
              router.replace('/');
            } catch (error) {
              console.log('보호자 로그아웃 오류:', error);
            }
          })();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.headerSubtitle}>부모님 케어를 시작했어요</Text>
            </View>
          </View>

          <View style={styles.parentSummaryCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.parentName}>{parentName} 님</Text>
              <Text style={styles.parentMeta}>
                {parentAge}세 · {parentGender}
              </Text>

              <View style={styles.statusRow}>
                <View style={styles.liveDot} />
                <Text style={styles.statusText}>{headerStatusText}</Text>
              </View>
            </View>

            <View style={styles.scoreBox}>
              <MaterialCommunityIcons
                name="heart-pulse"
                size={20}
                color={careStatus.color}
              />
              <Text style={[styles.scoreValue, { color: careStatus.color }]}>
                {careStatus.label}
              </Text>
              <Text style={styles.scoreLabel}>오늘 상태</Text>
              <Text style={styles.scoreSubLabel}>
                {dashboard?.latest_location_captured_at
                  ? `최근 업데이트 ${formatRelativeTime(dashboard.latest_location_captured_at)}`
                  : '최근 업데이트 확인중'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.statsGrid}>
          {quickStats.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={[
                styles.statCard,
                item.action ? styles.statCardInteractive : null,
              ]}
              activeOpacity={item.action ? 0.85 : 1}
              onPress={() => handleQuickStatPress(item)}
              disabled={!item.action}
              accessibilityRole={item.action ? 'button' : undefined}
            >
              <View style={styles.statIconWrap}>
                <AppIcon
                  type={item.iconType}
                  name={item.iconName}
                  size={22}
                  color="#05B547"
                />
              </View>
              <Text style={styles.statLabel}>{item.label}</Text>
              <Text style={styles.statValue}>{item.value}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>실시간 위치</Text>
        <View style={styles.locationCard}>
          <View style={styles.locationHeader}>
            <View style={styles.locationTitleRow}>
              <View style={styles.locationIconWrap}>
                <Feather name="map-pin" size={18} color="#05B547" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.locationTitle}>{parentName} 님 위치</Text>
                <Text style={styles.locationMeta}>
                  {dashboard?.latest_location_captured_at
                    ? `최근 업데이트 ${formatRelativeTime(dashboard.latest_location_captured_at)}`
                    : latestLocation?.label || '위치 기록을 확인하고 있습니다'}
                </Text>
                <Text
                  style={[
                    styles.locationZoneStatus,
                    { color: safetyZoneSummary.color },
                  ]}
                >
                  {safetyZoneSummary.label}
                </Text>
              </View>
            </View>
          </View>

          {latestLocationRegion ? (
            <TouchableOpacity
              style={styles.locationMapWrap}
              activeOpacity={0.9}
              onPress={openGuardianLocation}
            >
              <MapView
                style={styles.locationMap}
                region={latestLocationRegion}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                pointerEvents="none"
              >
                {safetyZones.map((zone) => (
                  <Circle
                    key={zone.id}
                    center={{
                      latitude: zone.center_latitude,
                      longitude: zone.center_longitude,
                    }}
                    radius={zone.radius_meters}
                    strokeWidth={2}
                    strokeColor={getSafetyZoneMapColor(zone)}
                    fillColor={`${getSafetyZoneMapColor(zone)}22`}
                  />
                ))}
                <Marker
                  coordinate={{
                    latitude: latestLocationRegion.latitude,
                    longitude: latestLocationRegion.longitude,
                  }}
                  title={`${parentName} 최근 위치`}
                />
              </MapView>
            </TouchableOpacity>
          ) : (
            <View style={styles.locationEmptyBox}>
              <Ionicons name="location-outline" size={28} color="#64748B" />
              <Text style={styles.locationEmptyTitle}>
                {latestLocation?.label || '아직 표시할 위치가 없습니다'}
              </Text>
              <Text style={styles.locationEmptyText}>
                부모님 기기에서 위치 권한을 허용하면 지도에 표시됩니다.
              </Text>
            </View>
          )}

          <View style={styles.locationActionRow}>
            <TouchableOpacity
              style={styles.locationSecondaryButton}
              activeOpacity={0.85}
              onPress={openGuardianLocation}
            >
              <Text style={styles.locationSecondaryButtonText}>크게 보기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.locationPrimaryButton,
                isRequestingLocation && styles.locationButtonDisabled,
              ]}
              activeOpacity={0.85}
              onPress={() => void handleRequestLocationRefresh()}
              disabled={isRequestingLocation}
            >
              <Text style={styles.locationPrimaryButtonText}>
                {isRequestingLocation ? '요청 중' : '현재 위치 요청'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>부모님 기본 정보</Text>
        <View style={styles.infoCard}>
          <InfoRow
            icon={<Feather name="link" size={16} color="#05B547" />}
            label="연동 코드"
            value={linkCode || '-'}
          />
          <Divider />

          <ExpandableInfoRow
            icon={<MaterialCommunityIcons name="pill" size={16} color="#05B547" />}
            label="복용 중인 약"
            value={medicationDisplayText}
          />
          <Divider />

          <ExpandableInfoRow
            icon={<FontAwesome6 name="virus" size={14} color="#05B547" />}
            label="보유 질환"
            value={diseases || '-'}
          />
          <Divider />

          <ExpandableInfoRow
            icon={
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={16}
                color="#05B547"
              />
            }
            label="알레르기"
            value={allergies || '-'}
          />
          <Divider />

          <InfoRow
            icon={<Ionicons name="medical-outline" size={16} color="#05B547" />}
            label="주치의 / 병원"
            value={hospital || '-'}
            multiline
          />
          <Divider />
          <InfoRow
            icon={<Ionicons name="call-outline" size={16} color="#05B547" />}
            label="비상 연락처"
            value={doctorContact || '-'}
          />
          <Divider />
          <InfoRow
            icon={<Feather name="edit-3" size={16} color="#05B547" />}
            label="추가 메모"
            value={memo || '-'}
            multiline
          />
        </View>

        <Text style={styles.sectionTitle}>주요 기능</Text>
        <View style={styles.menuGrid}>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.title}
              style={styles.menuCard}
              activeOpacity={0.85}
              onPress={() => handleMenuPress(item.title)}
            >
              <View style={styles.menuIconWrap}>
                <AppIcon
                  type={item.iconType}
                  name={item.iconName}
                  size={24}
                  color="#05B547"
                />
              </View>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>최근 알림</Text>
        <View style={styles.alertsCard}>
          {isLoadingDashboard ? (
            <View style={styles.loadingAlertRow}>
              <ActivityIndicator size="small" color="#05B547" />
              <Text style={styles.alertTime}>최근 알림을 불러오는 중이에요</Text>
            </View>
          ) : dashboardError ? (
            <View style={styles.loadingAlertRow}>
              <Text style={styles.alertTitle}>{dashboardError}</Text>
              <Text style={styles.alertTime}>백엔드 연결 상태를 확인해 주세요.</Text>
            </View>
          ) : alerts.length === 0 ? (
            <View style={styles.loadingAlertRow}>
              <Text style={styles.alertTitle}>최근 알림이 없어요</Text>
              <Text style={styles.alertTime}>
                새로운 보호 알림이 생기면 여기에 표시됩니다.
              </Text>
            </View>
          ) : (
            alerts.map((item, index) => (
              <View key={`${item.type}-${item.created_at}-${index}`}>
                <TouchableOpacity
                  style={styles.alertRow}
                  activeOpacity={0.85}
                  onPress={openGuardianAlerts}
                  disabled={!parentId || !linkCode}
                >
                  <View style={styles.alertIconWrap}>
                    <Ionicons name="notifications-outline" size={18} color="#05B547" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertTitle}>{item.message}</Text>
                    <Text style={styles.alertTime}>
                      {formatRelativeTime(item.created_at)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                </TouchableOpacity>
                {index !== alerts.length - 1 && <Divider />}
              </View>
            ))
          )}
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          activeOpacity={0.85}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
          <Text style={styles.logoutButtonText}>로그아웃</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function AppIcon({
  type,
  name,
  size,
  color,
}: {
  type: 'Ionicons' | 'MaterialCommunityIcons' | 'Feather' | 'FontAwesome6';
  name: string;
  size: number;
  color: string;
}) {
  if (type === 'Ionicons') {
    return <Ionicons name={name as any} size={size} color={color} />;
  }
  if (type === 'MaterialCommunityIcons') {
    return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
  }
  if (type === 'Feather') {
    return <Feather name={name as any} size={size} color={color} />;
  }
  return <FontAwesome6 name={name as any} size={size} color={color} />;
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
    <View style={[styles.infoRow, multiline && { alignItems: 'flex-start' }]}>
      <View style={styles.infoLabelWrap}>
        <View style={styles.infoIcon}>{icon}</View>
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={[styles.infoValue, multiline && { flex: 1, textAlign: 'right' }]}>
        {value}
      </Text>
    </View>
  );
}

function ExpandableInfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  const [expanded, setExpanded] = React.useState(false);

  const trimmedValue = value?.trim() || '-';
  const shouldShowToggle = trimmedValue !== '-' && trimmedValue.length > 18;

  return (
    <View style={styles.expandableInfoBlock}>
      <View style={styles.expandableInfoHeader}>
        <View style={styles.infoLabelWrap}>
          <View style={styles.infoIcon}>{icon}</View>
          <Text style={styles.infoLabel}>{label}</Text>
        </View>

        {shouldShowToggle ? (
          <TouchableOpacity
            style={styles.expandButton}
            activeOpacity={0.85}
            onPress={() => setExpanded((prev) => !prev)}
          >
            <Ionicons
              name={expanded ? 'remove' : 'add'}
              size={18}
              color="#05B547"
            />
          </TouchableOpacity>
        ) : null}
      </View>

      <Text
        style={styles.expandableInfoValue}
        numberOfLines={expanded || !shouldShowToggle ? undefined : 1}
      >
        {trimmedValue}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function summarizeSafetyZones(zones: GuardianSafetyZoneItem[]) {
  const enabledZones = zones.filter((zone) => zone.enabled);

  if (zones.length === 0) {
    return {
      label: '안전구역 미설정',
      color: '#64748B',
    };
  }

  if (enabledZones.length === 0) {
    return {
      label: '안전구역 꺼짐',
      color: '#64748B',
    };
  }

  if (enabledZones.some((zone) => zone.last_status === 'outside')) {
    return {
      label: '안전구역 벗어남',
      color: '#DC2626',
    };
  }

  if (enabledZones.every((zone) => zone.last_status === 'inside')) {
    return {
      label: '안전구역 안',
      color: '#15803D',
    };
  }

  return {
    label: '안전구역 확인 전',
    color: '#2563EB',
  };
}

function getSafetyZoneMapColor(zone: GuardianSafetyZoneItem) {
  if (!zone.enabled) {
    return '#94A3B8';
  }
  if (zone.last_status === 'outside') {
    return '#EF4444';
  }
  if (zone.last_status === 'inside') {
    return '#05B547';
  }
  return '#2563EB';
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F1F1F1',
  },
  container: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: '#F1F1F1',
  },
  headerCard: {
    backgroundColor: '#05D34E',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 18,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#E8FFF0',
    fontWeight: '700',
  },
  parentSummaryCard: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  parentName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  parentMeta: {
    marginTop: 4,
    fontSize: 15,
    color: '#6B7280',
  },
  statusRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
  },
  scoreBox: {
    width: 124,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#05B547',
    marginTop: 4,
    textAlign: 'center',
  },
  scoreLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  scoreSubLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statCardInteractive: {
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  statIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#EEFDF3',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  statValue: {
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
  },
  locationHeader: {
    marginBottom: 12,
  },
  locationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  locationIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#EEFDF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  locationMeta: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  locationZoneStatus: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '800',
  },
  locationMapWrap: {
    height: 210,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  locationMap: {
    flex: 1,
  },
  locationEmptyBox: {
    minHeight: 150,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  locationEmptyTitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
  },
  locationEmptyText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  locationActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  locationPrimaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#05B547',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationSecondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#EEFDF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationPrimaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  locationSecondaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#047B35',
  },
  locationButtonDisabled: {
    opacity: 0.55,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
    marginTop: 6,
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
  infoRow: {
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabelWrap: {
    width: '42%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIcon: {
    width: 22,
    alignItems: 'center',
    marginRight: 8,
  },
  infoLabel: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '700',
    flexShrink: 1,
  },
  infoValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '700',
    width: '54%',
    textAlign: 'right',
  },
  expandableInfoBlock: {
    paddingVertical: 14,
  },
  expandableInfoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  expandButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EEFDF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandableInfoValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'left',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  menuCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 132,
  },
  menuIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#EEFDF3',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  menuTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  menuSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: '#6B7280',
    fontWeight: '500',
  },
  alertsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
  },
  alertIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EEFDF3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  alertTitle: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '700',
    lineHeight: 21,
  },
  alertTime: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },
  loadingAlertRow: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutButton: {
    marginTop: 18,
    borderRadius: 18,
    backgroundColor: '#DC2626',
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});

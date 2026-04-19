import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons, Feather } from '@expo/vector-icons';

import {
  GuardianLatestLocationResponse,
  getGuardianLatestLocation,
} from '@/services/guardianLocation';
import { requestGuardianLocationRefresh } from '@/services/locations';

export default function GuardianLocationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const elderUserId = String(params.parentId || params.elderUserId || '');
  const parentName = String(params.parentName || '부모님');
  const linkCode = String(params.linkCode || '');

  const [location, setLocation] = useState<GuardianLatestLocationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadLocation();
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [elderUserId, linkCode]);

  const region = useMemo(() => {
    if (!location || location.status !== 'available' || location.latitude == null || location.longitude == null) {
      return null;
    }

    return {
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
  }, [location]);

  async function loadLocation() {
    if (!elderUserId || !linkCode) {
      setError('연동된 부모님 정보가 없습니다.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const result = await getGuardianLatestLocation(elderUserId, linkCode);
      setLocation(result);
    } catch (loadError: any) {
      setError(loadError.message || '위치 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function openExternalMap() {
    if (!location || location.status !== 'available' || location.latitude == null || location.longitude == null) {
      return;
    }

    const coordinate = `${location.latitude},${location.longitude}`;
    const label = encodeURIComponent(`${parentName} 최근 위치`);
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?ll=${coordinate}&q=${label}`
        : `https://www.google.com/maps/search/?api=1&query=${coordinate}`;

    await Linking.openURL(url);
  }

  async function requestLocationRefresh() {
    if (!elderUserId || !linkCode) {
      Alert.alert('오류', '연동된 부모님 정보가 없습니다.');
      return;
    }

    try {
      setIsRequestingLocation(true);
      await requestGuardianLocationRefresh(elderUserId, linkCode);
      Alert.alert(
        '위치 요청 전달됨',
        '부모님 앱이 열려 있으면 잠시 후 최신 위치가 반영됩니다.'
      );
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        void loadLocation();
      }, 12000);
    } catch (requestError: any) {
      Alert.alert('위치 요청 실패', requestError.message || '현재 위치 요청에 실패했습니다.');
    } finally {
      setIsRequestingLocation(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>위치 확인</Text>
          <TouchableOpacity style={styles.iconButton} onPress={() => void loadLocation()}>
            <Ionicons name="refresh" size={20} color="#111827" />
          </TouchableOpacity>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>확인 대상</Text>
          <Text style={styles.summaryName}>{parentName} 님</Text>
          <Text style={styles.summarySubtext}>
            {location?.captured_at ? `마지막 업데이트 ${formatCapturedAt(location.captured_at)}` : '최신 위치 기록을 확인합니다.'}
          </Text>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color="#05B547" />
            <Text style={styles.stateText}>위치 정보를 불러오는 중입니다.</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <Feather name="alert-circle" size={22} color="#DC2626" />
            <Text style={styles.stateTitle}>위치 조회 실패</Text>
            <Text style={styles.stateText}>{error}</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => void loadLocation()}>
              <Text style={styles.primaryButtonText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        ) : !region ? (
          <>
            <View style={styles.stateCard}>
              <Ionicons name="location-outline" size={24} color="#64748B" />
              <Text style={styles.stateTitle}>위치 기록 없음</Text>
              <Text style={styles.stateText}>{location?.label || '아직 수집된 위치 정보가 없습니다.'}</Text>
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => void requestLocationRefresh()}
              disabled={isRequestingLocation}
            >
              <Text style={styles.primaryButtonText}>
                {isRequestingLocation ? '요청 중...' : '현재 위치 요청'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.mapCard}>
              <MapView style={styles.map} initialRegion={region} region={region}>
                <Marker
                  coordinate={{
                    latitude: region.latitude,
                    longitude: region.longitude,
                  }}
                  title={`${parentName} 최근 위치`}
                  description={location?.captured_at ? formatCapturedAt(location.captured_at) : undefined}
                />
              </MapView>
            </View>

            <View style={styles.infoCard}>
              <InfoRow label="상태" value={location?.label || '확인 가능'} />
              <InfoRow label="좌표" value={`${region.latitude.toFixed(5)}, ${region.longitude.toFixed(5)}`} />
              <InfoRow label="수집 방식" value={formatSource(location?.source)} />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, styles.secondaryButton]}
              onPress={() => void requestLocationRefresh()}
              disabled={isRequestingLocation}
            >
              <Text style={styles.primaryButtonText}>
                {isRequestingLocation ? '요청 중...' : '현재 위치 요청'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryButton} onPress={() => void openExternalMap()}>
              <Text style={styles.primaryButtonText}>지도 앱에서 열기</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function formatCapturedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatSource(source?: string | null) {
  if (source === 'mobile') {
    return '모바일 앱';
  }

  if (!source) {
    return '-';
  }

  return source;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  topTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  summaryName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  summarySubtext: {
    marginTop: 6,
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  mapCard: {
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    height: 320,
  },
  map: {
    flex: 1,
  },
  infoCard: {
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  stateCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 10,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  stateText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748B',
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 16,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#05B547',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#16A34A',
  },
});

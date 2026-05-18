import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import MapView, { Circle, Marker } from 'react-native-maps';
import { Ionicons, Feather } from '@expo/vector-icons';

import {
  createGuardianSafetyZone,
  deleteGuardianSafetyZone,
  getGuardianSafetyZones,
  GuardianSafetyZoneItem,
  updateGuardianSafetyZone,
} from '@/services/guardian';
import {
  GuardianLatestLocationResponse,
  getGuardianLatestLocation,
} from '@/services/guardianLocation';
import { requestGuardianLocationRefresh } from '@/services/locations';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type MapRegion = Coordinate & {
  latitudeDelta: number;
  longitudeDelta: number;
};

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
  const [safetyZones, setSafetyZones] = useState<GuardianSafetyZoneItem[]>([]);
  const [zoneLabel, setZoneLabel] = useState('집 주변');
  const [zoneRadius, setZoneRadius] = useState(300);
  const [draftCenter, setDraftCenter] = useState<Coordinate | null>(null);
  const [isSavingZone, setIsSavingZone] = useState(false);
  const [addressLabel, setAddressLabel] = useState('');
  const [isAddressLoading, setIsAddressLoading] = useState(false);
  const [mapRegion, setMapRegion] = useState<MapRegion | null>(null);
  const [addressQuery, setAddressQuery] = useState('');
  const [zoneAddress, setZoneAddress] = useState('');
  const [zoneAddressById, setZoneAddressById] = useState<Record<string, string>>({});
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
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

  const selectedCenter = useMemo(() => {
    if (draftCenter) {
      return draftCenter;
    }

    if (!region) {
      return null;
    }

    return {
      latitude: region.latitude,
      longitude: region.longitude,
    };
  }, [draftCenter, region]);

  const activeMapRegion = mapRegion ?? region;

  useEffect(() => {
    if (!region || draftCenter) {
      return;
    }

    setDraftCenter({
      latitude: region.latitude,
      longitude: region.longitude,
    });
  }, [draftCenter, region]);

  useEffect(() => {
    if (!region || mapRegion) {
      return;
    }

    setMapRegion(region);
  }, [mapRegion, region]);

  useEffect(() => {
    let cancelled = false;

    if (!region) {
      setAddressLabel('');
      setIsAddressLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsAddressLoading(true);

    void Location.reverseGeocodeAsync({
      latitude: region.latitude,
      longitude: region.longitude,
    })
      .then((addresses) => {
        if (cancelled) {
          return;
        }

        setAddressLabel(formatGeocodedAddress(addresses[0]));
      })
      .catch((addressError) => {
        console.log('보호자 위치 주소 변환 오류:', addressError);
        if (!cancelled) {
          setAddressLabel('');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsAddressLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [region]);

  useEffect(() => {
    let cancelled = false;
    const zonesWithoutAddress = safetyZones.filter(
      (zone) => !zone.address && !zoneAddressById[zone.id]
    );

    zonesWithoutAddress.forEach((zone) => {
      void Location.reverseGeocodeAsync({
        latitude: zone.center_latitude,
        longitude: zone.center_longitude,
      })
        .then((addresses) => {
          if (cancelled) {
            return;
          }

          const resolvedAddress = formatGeocodedAddress(addresses[0]);
          setZoneAddressById((current) => ({
            ...current,
            [zone.id]: resolvedAddress || '주소 확인 불가',
          }));

          if (resolvedAddress) {
            void updateGuardianSafetyZone(elderUserId, linkCode, zone.id, {
              address: resolvedAddress,
            }).catch((updateError) => {
              console.log('안전구역 주소 저장 오류:', updateError);
            });
          }
        })
        .catch((addressError) => {
          console.log('안전구역 목록 주소 변환 오류:', addressError);
          if (!cancelled) {
            setZoneAddressById((current) => ({
              ...current,
              [zone.id]: '주소 확인 불가',
            }));
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [elderUserId, linkCode, safetyZones, zoneAddressById]);

  async function loadLocation() {
    if (!elderUserId || !linkCode) {
      setError('연동된 부모님 정보가 없습니다.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const [result, safetyZoneResult] = await Promise.all([
        getGuardianLatestLocation(elderUserId, linkCode),
        getGuardianSafetyZones(elderUserId, linkCode).catch((zoneError) => {
          console.log('보호자 위치 안전구역 조회 오류:', zoneError);
          return null;
        }),
      ]);
      setLocation(result);
      setSafetyZones(safetyZoneResult?.items ?? []);
      if (result.status === 'available' && result.latitude != null && result.longitude != null) {
        const currentCoordinate = {
          latitude: result.latitude,
          longitude: result.longitude,
        };
        setMapRegion((currentRegion) => currentRegion ?? createMapRegion({
          latitude: currentCoordinate.latitude,
          longitude: currentCoordinate.longitude,
        }));
      }
    } catch (loadError: any) {
      setError(loadError.message || '위치 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function saveSafetyZone() {
    const label = zoneLabel.trim();

    if (!selectedCenter) {
      Alert.alert('중심 위치 필요', '최신 위치가 생기면 지도에서 안전구역 중심을 정할 수 있습니다.');
      return;
    }

    if (!label) {
      Alert.alert('이름 필요', '안전구역 이름을 입력해 주세요.');
      return;
    }

    try {
      setIsSavingZone(true);
      const saved = await createGuardianSafetyZone(elderUserId, linkCode, {
        label,
        address: zoneAddress || addressLabel,
        center_latitude: selectedCenter.latitude,
        center_longitude: selectedCenter.longitude,
        radius_meters: zoneRadius,
        enabled: true,
      });
      setSafetyZones((items) => [saved, ...items]);
      Alert.alert('안전구역 저장됨', `${saved.label} 안전구역을 저장했어요.`);
    } catch (saveError: any) {
      Alert.alert('저장 실패', saveError.message || '안전구역을 저장하지 못했습니다.');
    } finally {
      setIsSavingZone(false);
    }
  }

  async function toggleSafetyZone(zone: GuardianSafetyZoneItem) {
    try {
      const updated = await updateGuardianSafetyZone(elderUserId, linkCode, zone.id, {
        enabled: !zone.enabled,
      });
      setSafetyZones((items) =>
        items.map((item) => (item.id === zone.id ? updated : item))
      );
    } catch (toggleError: any) {
      Alert.alert('변경 실패', toggleError.message || '안전구역 상태를 바꾸지 못했습니다.');
    }
  }

  function confirmDeleteSafetyZone(zone: GuardianSafetyZoneItem) {
    Alert.alert('안전구역 삭제', `${zone.label} 안전구역을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          void deleteSafetyZone(zone);
        },
      },
    ]);
  }

  async function deleteSafetyZone(zone: GuardianSafetyZoneItem) {
    try {
      await deleteGuardianSafetyZone(elderUserId, linkCode, zone.id);
      setSafetyZones((items) => items.filter((item) => item.id !== zone.id));
    } catch (deleteError: any) {
      Alert.alert('삭제 실패', deleteError.message || '안전구역을 삭제하지 못했습니다.');
    }
  }

  function adjustRadius(delta: number) {
    setZoneRadius((current) => Math.max(100, Math.min(2000, current + delta)));
  }

  async function searchAddressForSafetyZone() {
    const query = addressQuery.trim();

    if (!query) {
      Alert.alert('주소 필요', '검색할 주소나 장소명을 입력해 주세요.');
      return;
    }

    try {
      setIsSearchingAddress(true);
      const results = await Location.geocodeAsync(query);
      const firstResult = results[0];

      if (!firstResult) {
        Alert.alert('검색 결과 없음', '주소를 찾지 못했습니다. 도로명이나 건물명을 조금 더 자세히 입력해 주세요.');
        return;
      }

      const center = {
        latitude: firstResult.latitude,
        longitude: firstResult.longitude,
      };

      setDraftCenter(center);
      setZoneAddress(query);
      setMapRegion(createMapRegion(center));
    } catch (searchError: any) {
      Alert.alert('주소 검색 실패', searchError.message || '주소를 좌표로 바꾸지 못했습니다.');
    } finally {
      setIsSearchingAddress(false);
    }
  }

  function selectSafetyZoneCenter(coordinate: Coordinate) {
    setDraftCenter(coordinate);
    setMapRegion((currentRegion) => ({
      ...(currentRegion ?? createMapRegion(coordinate)),
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    }));
    setZoneAddress('');

    void Location.reverseGeocodeAsync(coordinate)
      .then((addresses) => {
        setZoneAddress(formatGeocodedAddress(addresses[0]));
      })
      .catch((addressError) => {
        console.log('안전구역 중심 주소 변환 오류:', addressError);
      });
  }

  async function openExternalMap() {
    const coordinateSource =
      location?.status === 'available' && location.latitude != null && location.longitude != null
        ? {
            latitude: location.latitude,
            longitude: location.longitude,
          }
        : selectedCenter ?? activeMapRegion;

    if (!coordinateSource) {
      return;
    }

    const coordinate = `${coordinateSource.latitude},${coordinateSource.longitude}`;
    const label = encodeURIComponent(
      location?.status === 'available' ? `${parentName} 최근 위치` : '안전구역 중심'
    );
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

  function renderSafetyZonePanel() {
    return (
      <View style={styles.zoneCard}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>안전구역</Text>
            <Text style={styles.sectionSubtitle}>
              주소를 검색하거나 지도에서 중심을 눌러 반경을 저장하세요.
            </Text>
          </View>
          <Ionicons name="shield-checkmark-outline" size={24} color="#05B547" />
        </View>

        <View style={styles.addressSearchBox}>
          <TextInput
            value={addressQuery}
            onChangeText={setAddressQuery}
            placeholder="주소나 장소명 검색"
            placeholderTextColor="#94A3B8"
            returnKeyType="search"
            onSubmitEditing={() => void searchAddressForSafetyZone()}
            style={styles.addressSearchInput}
          />
          <TouchableOpacity
            style={[
              styles.addressSearchButton,
              isSearchingAddress && styles.addressSearchButtonDisabled,
            ]}
            onPress={() => void searchAddressForSafetyZone()}
            disabled={isSearchingAddress}
          >
            {isSearchingAddress ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="search" size={20} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.formField}>
          <Text style={styles.formLabel}>구역 이름</Text>
          <TextInput
            value={zoneLabel}
            onChangeText={setZoneLabel}
            placeholder="집 주변"
            placeholderTextColor="#94A3B8"
            style={styles.textInput}
          />
        </View>

        <View style={styles.radiusControl}>
          <TouchableOpacity style={styles.radiusButton} onPress={() => adjustRadius(-100)}>
            <Ionicons name="remove" size={20} color="#111827" />
          </TouchableOpacity>
          <View style={styles.radiusValueBox}>
            <Text style={styles.radiusValue}>{zoneRadius}m</Text>
            <Text style={styles.radiusLabel}>반경</Text>
          </View>
          <TouchableOpacity style={styles.radiusButton} onPress={() => adjustRadius(100)}>
            <Ionicons name="add" size={20} color="#111827" />
          </TouchableOpacity>
        </View>

        <Text style={styles.zoneHint}>
          {selectedCenter ? formatSelectedCenterLabel(selectedCenter, zoneAddress) : '주소를 검색하거나 지도에서 중심을 정해 주세요.'}
        </Text>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            styles.zoneSaveButton,
            (!selectedCenter || isSavingZone) && styles.disabledButton,
          ]}
          onPress={() => void saveSafetyZone()}
          disabled={!selectedCenter || isSavingZone}
        >
          <Text style={styles.primaryButtonText}>
            {isSavingZone ? '저장 중...' : '안전구역 저장'}
          </Text>
        </TouchableOpacity>

        <View style={styles.zoneList}>
          {safetyZones.length === 0 ? (
            <View style={styles.emptyZoneBox}>
              <Text style={styles.emptyZoneText}>등록된 안전구역이 없습니다.</Text>
            </View>
          ) : (
            safetyZones.map((zone) => (
              <View
                key={zone.id}
                style={[styles.zoneItem, !zone.enabled && styles.zoneItemDisabled]}
              >
                <View style={styles.zoneItemHeader}>
                  <Text style={styles.zoneName}>{zone.label}</Text>
                  <Text style={[styles.zoneStatusBadge, getZoneStatusTone(zone)]}>
                    {formatZoneStatus(zone)}
                  </Text>
                </View>
                <Text style={styles.zoneMeta}>
                  반경 {zone.radius_meters}m · {getSafetyZoneAddressText(zone, zoneAddressById)}
                </Text>
                <View style={styles.zoneActions}>
                  <TouchableOpacity
                    style={styles.zoneActionButton}
                    onPress={() => void toggleSafetyZone(zone)}
                  >
                    <Text style={styles.zoneActionText}>
                      {zone.enabled ? '끄기' : '켜기'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.zoneActionButton, styles.deleteButton]}
                    onPress={() => confirmDeleteSafetyZone(zone)}
                  >
                    <Text style={[styles.zoneActionText, styles.deleteButtonText]}>삭제</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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
        ) : !activeMapRegion ? (
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
              <MapView
                style={styles.map}
                initialRegion={activeMapRegion}
                region={activeMapRegion}
                onRegionChangeComplete={setMapRegion}
                onPress={(event) => selectSafetyZoneCenter(event.nativeEvent.coordinate)}
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
                    strokeColor={getZoneCircleColor(zone)}
                    fillColor={`${getZoneCircleColor(zone)}22`}
                  />
                ))}
                {selectedCenter ? (
                  <Circle
                    center={selectedCenter}
                    radius={zoneRadius}
                    strokeWidth={2}
                    strokeColor="#05B547"
                    fillColor="#05B54720"
                  />
                ) : null}
                {region ? (
                  <Marker
                    coordinate={{
                      latitude: region.latitude,
                      longitude: region.longitude,
                    }}
                    title={`${parentName} 최근 위치`}
                    description={location?.captured_at ? formatCapturedAt(location.captured_at) : undefined}
                  />
                ) : null}
                {selectedCenter ? (
                  <Marker
                    coordinate={selectedCenter}
                    title="안전구역 중심"
                    description={zoneAddress || undefined}
                    pinColor="#05B547"
                  />
                ) : null}
              </MapView>
            </View>

            <View style={styles.infoCard}>
              <InfoRow label="상태" value={location?.label || '확인 가능'} />
              <InfoRow
                label="주소"
                value={
                  isAddressLoading
                    ? '주소 확인 중...'
                    : addressLabel || formatCoordinate(activeMapRegion)
                }
              />
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

        {!loading && !error ? renderSafetyZonePanel() : null}
      </ScrollView>
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

  if (source === 'background') {
    return '백그라운드 위치';
  }

  if (!source) {
    return '-';
  }

  return source;
}

function formatZoneStatus(zone: GuardianSafetyZoneItem) {
  if (!zone.enabled) {
    return '꺼짐';
  }
  if (zone.last_status === 'inside') {
    return '안전구역 안';
  }
  if (zone.last_status === 'outside') {
    return '벗어남';
  }
  return '확인 전';
}

function getZoneCircleColor(zone: GuardianSafetyZoneItem) {
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

function getZoneStatusTone(zone: GuardianSafetyZoneItem) {
  if (!zone.enabled) {
    return {
      backgroundColor: '#F1F5F9',
      color: '#64748B',
    };
  }
  if (zone.last_status === 'outside') {
    return {
      backgroundColor: '#FEE2E2',
      color: '#B91C1C',
    };
  }
  if (zone.last_status === 'inside') {
    return {
      backgroundColor: '#DCFCE7',
      color: '#15803D',
    };
  }
  return {
    backgroundColor: '#DBEAFE',
    color: '#1D4ED8',
  };
}

function formatGeocodedAddress(address?: Location.LocationGeocodedAddress) {
  if (!address) {
    return '';
  }

  const parts = [
    address.region,
    address.city,
    address.district,
    address.street,
    address.streetNumber || address.name,
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean);

  return Array.from(new Set(parts)).join(' ');
}

function createMapRegion(coordinate: Coordinate): MapRegion {
  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };
}

function formatCoordinate(coordinate: Coordinate) {
  return `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
}

function formatSelectedCenterLabel(coordinate: Coordinate, address: string) {
  if (address.trim()) {
    return `선택 주소 ${address.trim()}`;
  }

  return `선택 중심 ${formatCoordinate(coordinate)}`;
}

function getSafetyZoneAddressText(
  zone: GuardianSafetyZoneItem,
  zoneAddressById: Record<string, string>
) {
  return zone.address || zoneAddressById[zone.id] || '주소 확인 중...';
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
    flexGrow: 1,
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
    minHeight: 220,
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
  disabledButton: {
    backgroundColor: '#CBD5E1',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: '#64748B',
  },
  zoneCard: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    gap: 14,
  },
  formField: {
    gap: 8,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
  },
  textInput: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  addressSearchBox: {
    flexDirection: 'row',
    gap: 8,
  },
  addressSearchInput: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  addressSearchButton: {
    width: 54,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#05B547',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressSearchButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  radiusControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  radiusButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radiusValueBox: {
    flex: 1,
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: '#ECFDF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radiusValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#047857',
  },
  radiusLabel: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  zoneHint: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
  },
  zoneSaveButton: {
    marginTop: 0,
  },
  zoneList: {
    gap: 10,
  },
  emptyZoneBox: {
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    paddingVertical: 18,
    alignItems: 'center',
  },
  emptyZoneText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  zoneItem: {
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 10,
  },
  zoneItemDisabled: {
    opacity: 0.72,
  },
  zoneItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  zoneName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
  },
  zoneStatusBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '800',
  },
  zoneMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
  },
  zoneActions: {
    flexDirection: 'row',
    gap: 8,
  },
  zoneActionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneActionText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0369A1',
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
  },
  deleteButtonText: {
    color: '#B91C1C',
  },
});

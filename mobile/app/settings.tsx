import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

type PermissionStatusLabel = '허용됨' | '한 번만 허용됨' | '허용 안 됨' | '확인 필요';

export default function SettingsPage() {
  const router = useRouter();
  const [isLoadingPermission, setIsLoadingPermission] = useState(true);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [permissionLabel, setPermissionLabel] = useState<PermissionStatusLabel>('확인 필요');
  const [permissionDescription, setPermissionDescription] = useState(
    '주변 병원을 찾을 때 현재 위치를 사용할 수 있어요.'
  );
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPermission = useCallback(async () => {
    try {
      setIsLoadingPermission(true);
      setError(null);
      const permission = await Location.getForegroundPermissionsAsync();
      applyPermissionState(permission);
    } catch (permissionError) {
      setError(permissionError instanceof Error ? permissionError.message : '위치 권한 상태를 불러오지 못했습니다.');
    } finally {
      setIsLoadingPermission(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadPermission();
      return undefined;
    }, [loadPermission])
  );

  const handleAllowLocation = async () => {
    try {
      setIsRequestingPermission(true);
      setError(null);
      const permission = await Location.requestForegroundPermissionsAsync();
      applyPermissionState(permission);
    } catch (permissionError) {
      setError(permissionError instanceof Error ? permissionError.message : '위치 권한 요청 중 오류가 발생했습니다.');
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleOpenDeviceSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      setError('기기 설정을 열지 못했습니다.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>설정</Text>
        <Text style={styles.description}>앱 사용에 필요한 권한과 기본 설정을 확인할 수 있습니다.</Text>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="location-outline" size={22} color="#2563EB" />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>위치 권한</Text>
              {isLoadingPermission ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#2563EB" />
                  <Text style={styles.loadingText}>상태를 확인하는 중입니다</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.permissionLabel}>{permissionLabel}</Text>
                  <Text style={styles.permissionDescription}>{permissionDescription}</Text>
                </>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, (isLoadingPermission || isRequestingPermission) && styles.primaryButtonDisabled]}
            onPress={() => void handleAllowLocation()}
            disabled={isLoadingPermission || isRequestingPermission}
          >
            <Text style={styles.primaryButtonText}>
              {isRequestingPermission ? '요청 중...' : canAskAgain ? '위치 권한 허용하기' : '권한 다시 확인하기'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={() => void handleOpenDeviceSettings()}>
            <Text style={styles.secondaryButtonText}>기기 설정에서 권한 열기</Text>
          </TouchableOpacity>

          <Text style={styles.helperText}>
            위치 권한을 허용하면 "주변 병원 찾아줘" 같은 요청에 더 빠르게 답할 수 있습니다.
          </Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>이전으로</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  function applyPermissionState(permission: Location.PermissionResponse) {
    setCanAskAgain(permission.canAskAgain);

    if (permission.granted) {
      setPermissionLabel('허용됨');
      setPermissionDescription('현재 위치를 사용할 수 있습니다. 주변 병원 검색에 바로 반영됩니다.');
      return;
    }

    if (permission.status === Location.PermissionStatus.DENIED) {
      setPermissionLabel('허용 안 됨');
      setPermissionDescription(
        permission.canAskAgain
          ? '앱에서 다시 권한을 요청할 수 있습니다.'
          : '기기 설정에서 직접 위치 권한을 켜야 합니다.'
      );
      return;
    }

    setPermissionLabel('확인 필요');
    setPermissionDescription('위치 권한을 아직 선택하지 않았습니다.');
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EEF4FF',
  },
  container: {
    padding: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    lineHeight: 25,
    color: '#475569',
    marginBottom: 20,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  sectionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DBEAFE',
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  permissionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2563EB',
    marginBottom: 6,
  },
  permissionDescription: {
    fontSize: 15,
    lineHeight: 24,
    color: '#475569',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
  },
  primaryButton: {
    marginTop: 18,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  secondaryButton: {
    marginTop: 12,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
  helperText: {
    marginTop: 14,
    fontSize: 14,
    lineHeight: 22,
    color: '#64748B',
  },
  errorText: {
    marginTop: 16,
    fontSize: 15,
    lineHeight: 22,
    color: '#DC2626',
  },
  backButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '600',
  },
});

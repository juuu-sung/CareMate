import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
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
import { SeniorBottomNav } from '@/components/common/SeniorBottomNav';
import {
  clearAuthSession,
  loadAuthSession,
  ParentAuthSession,
} from '@/services/authSession';
import {
  getMedicationReminderStatus,
  MedicationReminderStatus,
} from '@/services/medicationReminders';
import {
  ensureBackgroundLocationSync,
  stopBackgroundLocationSync,
} from '@/services/locationTask';
import { CHAT_TTS_VOICE_OPTIONS } from '@/services/chat';

type PermissionStatusLabel =
  | '백그라운드 허용됨'
  | '앱 사용 중 허용됨'
  | '허용 안 됨'
  | '확인 필요';

const siriSteps = [
  '1. 앱을 한 번 실행한 뒤 Siri를 켜주세요.',
  '2. "시리야, 케어 대화 시작"이라고 말해보세요.',
  '3. 처음엔 Shortcuts 앱에서 "케어"를 검색해 직접 실행하는 편이 더 잘 잡힐 수 있어요.',
];

const widgetSteps = [
  '1. 홈 화면 또는 잠금 화면을 길게 눌러 위젯 편집으로 들어가세요.',
  '2. 위젯 추가에서 "CareMate" 또는 "케어 대화"를 찾아 추가하세요.',
  '3. 위젯을 한 번 누르면 바로 음성 대화 화면으로 들어갑니다.',
];

const voiceControlSteps = [
  '1. 설정 > 손쉬운 사용 > 음성 명령으로 이동하세요.',
  '2. 명령 사용자화에서 새 명령을 만들고 문구를 "케어야"로 등록하세요.',
  '3. 동작은 "단축어 실행" 또는 케어 열기 흐름으로 연결하세요.',
];

function getVoiceLabel(voiceId?: string) {
  if (!voiceId) {
    return '아직 선택되지 않음';
  }

  return CHAT_TTS_VOICE_OPTIONS.find((voice) => voice.id === voiceId)?.name || voiceId;
}

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
  const [parentSession, setParentSession] = useState<ParentAuthSession | null>(null);
  const [medicationReminderStatus, setMedicationReminderStatus] =
    useState<MedicationReminderStatus | null>(null);

  const loadPermission = useCallback(async () => {
    try {
      setIsLoadingPermission(true);
      setError(null);
      const [foregroundPermission, backgroundPermission] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
      ]);
      applyPermissionState(foregroundPermission, backgroundPermission);
    } catch (permissionError) {
      setError(permissionError instanceof Error ? permissionError.message : '위치 권한 상태를 불러오지 못했습니다.');
    } finally {
      setIsLoadingPermission(false);
    }
  }, []);

  const loadCurrentSession = useCallback(async () => {
    try {
      const session = await loadAuthSession();
      const nextParentSession = session?.role === 'parent' ? session : null;
      setParentSession(nextParentSession);

      if (nextParentSession) {
        const reminderStatus = await getMedicationReminderStatus(
          nextParentSession.elderUserId
        );
        setMedicationReminderStatus(reminderStatus);
      } else {
        setMedicationReminderStatus(null);
      }
    } catch {
      setParentSession(null);
      setMedicationReminderStatus(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadPermission();
      void loadCurrentSession();
      return undefined;
    }, [loadCurrentSession, loadPermission])
  );

  const handleAllowLocation = async () => {
    try {
      setIsRequestingPermission(true);
      setError(null);

      if (parentSession) {
        const status = await ensureBackgroundLocationSync({
          elderUserId: parentSession.elderUserId || parentSession.parentId,
          linkCode: parentSession.linkCode,
        });
        await loadPermission();
        setPermissionDescription(status.message);
        return;
      }

      const foregroundPermission = await Location.requestForegroundPermissionsAsync();
      const backgroundPermission = foregroundPermission.granted
        ? await Location.requestBackgroundPermissionsAsync()
        : await Location.getBackgroundPermissionsAsync();

      applyPermissionState(foregroundPermission, backgroundPermission);
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

  const handleOpenShortcutsApp = async () => {
    try {
      if (Platform.OS === 'ios') {
        await Linking.openURL('shortcuts://');
        return;
      }

      setError('단축어 앱 열기는 iPhone에서만 사용할 수 있습니다.');
    } catch {
      setError('단축어 앱을 열지 못했습니다.');
    }
  };

  const handleChangeAgentName = () => {
    if (!parentSession) {
      setError('부모님 로그인 정보를 먼저 확인해 주세요.');
      return;
    }

    router.push({
      pathname: '/parent-agent-name-setup',
      params: {
        returnTo: 'settings',
        parentId: parentSession.parentId,
        elderUserId: parentSession.elderUserId,
        elder_user_id: parentSession.elderUserId,
        parentName: parentSession.parentName,
        linkCode: parentSession.linkCode,
        link_code: parentSession.linkCode,
        guardianPhone: parentSession.guardianPhone,
        selectedVoice: parentSession.agentVoice,
        agentName: parentSession.agentName,
        agent_name: parentSession.agentName,
      },
    });
  };

  const handleChangeAgentVoice = () => {
    if (!parentSession) {
      setError('부모님 로그인 정보를 먼저 확인해 주세요.');
      return;
    }

    router.push({
      pathname: '/parent-agent-voice-setup',
      params: {
        returnTo: 'settings',
        parentId: parentSession.parentId,
        elderUserId: parentSession.elderUserId,
        elder_user_id: parentSession.elderUserId,
        parentName: parentSession.parentName,
        linkCode: parentSession.linkCode,
        link_code: parentSession.linkCode,
        guardianPhone: parentSession.guardianPhone,
        selectedVoice: parentSession.agentVoice,
        agentName: parentSession.agentName,
        agent_name: parentSession.agentName,
      },
    });
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
              await stopBackgroundLocationSync();
              await clearAuthSession();
              router.replace('/');
            } catch (logoutError) {
              setError(
                logoutError instanceof Error
                  ? logoutError.message
                  : '로그아웃 중 오류가 발생했습니다.'
              );
            }
          })();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>설정</Text>
        <Text style={styles.description}>앱 사용에 필요한 권한과 기본 설정을 확인할 수 있습니다.</Text>

        {parentSession ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, styles.agentIconWrap]}>
                <Ionicons name="person-circle-outline" size={24} color="#2563EB" />
              </View>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>에이전트 설정</Text>
                <Text style={styles.agentNameText}>{parentSession.agentName || '케어'}</Text>
                <Text style={styles.agentVoiceText}>
                  목소리: {getVoiceLabel(parentSession.agentVoice)}
                </Text>
                <Text style={styles.permissionDescription}>
                  홈 화면 호출어와 음성 대화 안내에 사용하는 이름과 목소리입니다.
                </Text>
              </View>
            </View>

            <View style={styles.inlineButtonRow}>
              <TouchableOpacity style={styles.inlinePrimaryButton} onPress={handleChangeAgentName}>
                <Text style={styles.inlinePrimaryButtonText}>이름 변경</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.inlineSecondaryButton} onPress={handleChangeAgentVoice}>
                <Text style={styles.inlineSecondaryButtonText}>목소리 변경</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {parentSession ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, styles.reminderIconWrap]}>
                <Ionicons name="notifications-outline" size={23} color="#0F766E" />
              </View>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>복약 알림 상태</Text>
                <Text style={styles.reminderStateText}>
                  {medicationReminderStatus?.statusLabel || '확인 중'}
                </Text>
                <Text style={styles.permissionDescription}>
                  {medicationReminderStatus?.detail ||
                    '복약 알림 권한과 예약 상태를 확인하고 있습니다.'}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.secondaryButton} onPress={() => void loadCurrentSession()}>
              <Text style={styles.secondaryButtonText}>상태 다시 확인</Text>
            </TouchableOpacity>

            {medicationReminderStatus?.permissionGranted === false ? (
              <TouchableOpacity style={styles.primaryButton} onPress={() => void handleOpenDeviceSettings()}>
                <Text style={styles.primaryButtonText}>기기 알림 설정 열기</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

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

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrap, styles.siriIconWrap]}>
              <Ionicons name="sparkles-outline" size={22} color="#7C3AED" />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>Siri 단축어</Text>
              <Text style={styles.permissionLabel}>앱이 꺼져 있어도 실행 가능</Text>
              <Text style={styles.permissionDescription}>
                가장 안정적인 방법은 Siri 단축어입니다. "시리야, 케어 대화 시작"으로 바로 음성 대화를 열 수 있어요.
              </Text>
            </View>
          </View>

          <View style={styles.stepList}>
            {siriSteps.map((step) => (
              <Text key={step} style={styles.stepText}>
                {step}
              </Text>
            ))}
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={() => void handleOpenShortcutsApp()}>
            <Text style={styles.primaryButtonText}>단축어 앱 열기</Text>
          </TouchableOpacity>

          <Text style={styles.helperText}>
            Siri가 바로 못 알아들으면 앱을 한 번 실행한 뒤 다시 말해보세요.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrap, styles.widgetIconWrap]}>
              <Ionicons name="mic-circle-outline" size={22} color="#C2410C" />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>홈 화면 위젯</Text>
              <Text style={styles.permissionLabel}>한 번 눌러 바로 음성 대화</Text>
              <Text style={styles.permissionDescription}>
                홈 화면이나 잠금 화면에 위젯을 올려두면 앱을 찾지 않아도 바로 음성 대화 화면으로 들어갈 수 있습니다.
              </Text>
            </View>
          </View>

          <View style={styles.stepList}>
            {widgetSteps.map((step) => (
              <Text key={step} style={styles.stepText}>
                {step}
              </Text>
            ))}
          </View>

          <Text style={styles.helperText}>
            위젯은 한 번 추가해두면 가장 빠른 실행 방법입니다. 잠금 화면 위젯은 화면을 깨운 뒤 바로 눌러 진입할 수 있습니다.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrap, styles.voiceControlIconWrap]}>
              <Ionicons name="mic-outline" size={22} color="#0F766E" />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>음성 명령 우회</Text>
              <Text style={styles.permissionLabel}>사용자가 직접 설정해야 함</Text>
              <Text style={styles.permissionDescription}>
                iPhone 접근성의 음성 명령을 이용해 "케어야" 같은 문구를 직접 등록할 수 있습니다.
              </Text>
            </View>
          </View>

          <View style={styles.stepList}>
            {voiceControlSteps.map((step) => (
              <Text key={step} style={styles.stepText}>
                {step}
              </Text>
            ))}
          </View>

          <TouchableOpacity style={styles.secondaryButton} onPress={() => void handleOpenDeviceSettings()}>
            <Text style={styles.secondaryButtonText}>기기 설정 열기</Text>
          </TouchableOpacity>

          <Text style={styles.helperText}>
            이 방법은 앱 기능이 아니라 iPhone 설정 기능입니다. 기기 언어와 지원 상태에 따라 동작이 제한될 수 있습니다.
          </Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrap, styles.logoutIconWrap]}>
              <Ionicons name="log-out-outline" size={22} color="#DC2626" />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>로그아웃</Text>
              <Text style={styles.permissionDescription}>
                현재 기기에 저장된 로그인 정보를 지우고 처음 화면으로 돌아갑니다.
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>로그아웃</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>이전으로</Text>
        </TouchableOpacity>
      </ScrollView>

      {parentSession ? (
        <SeniorBottomNav
          active="settings"
          params={{
            parentId: parentSession.parentId,
            elderUserId: parentSession.elderUserId,
            parentName: parentSession.parentName,
            linkCode: parentSession.linkCode,
            guardianPhone: parentSession.guardianPhone,
            agentName: parentSession.agentName,
            agentVoice: parentSession.agentVoice,
            selectedVoice: parentSession.agentVoice,
          }}
        />
      ) : null}
    </SafeAreaView>
  );

  function applyPermissionState(
    foregroundPermission: Location.PermissionResponse,
    backgroundPermission?: Location.PermissionResponse
  ) {
    setCanAskAgain(
      foregroundPermission.canAskAgain || backgroundPermission?.canAskAgain || false
    );

    if (foregroundPermission.granted && backgroundPermission?.granted) {
      setPermissionLabel('백그라운드 허용됨');
      setPermissionDescription(
        '앱을 닫아도 보호자에게 최신 위치를 공유할 수 있습니다.'
      );
      return;
    }

    if (foregroundPermission.granted) {
      setPermissionLabel('앱 사용 중 허용됨');
      setPermissionDescription(
        '주변 병원 검색은 가능하지만, 앱을 닫으면 위치 공유가 제한됩니다.'
      );
      return;
    }

    if (foregroundPermission.status === Location.PermissionStatus.DENIED) {
      setPermissionLabel('허용 안 됨');
      setPermissionDescription(
        foregroundPermission.canAskAgain
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
    backgroundColor: '#FFFFFF',
  },
  container: {
    padding: 24,
    paddingBottom: 132,
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
    marginBottom: 16,
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
  siriIconWrap: {
    backgroundColor: '#EDE9FE',
  },
  voiceControlIconWrap: {
    backgroundColor: '#CCFBF1',
  },
  reminderIconWrap: {
    backgroundColor: '#CCFBF1',
  },
  widgetIconWrap: {
    backgroundColor: '#FFEDD5',
  },
  agentIconWrap: {
    backgroundColor: '#DBEAFE',
  },
  logoutIconWrap: {
    backgroundColor: '#FEE2E2',
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
  agentNameText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1D4ED8',
    marginBottom: 6,
  },
  agentVoiceText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 6,
  },
  inlineButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  inlinePrimaryButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineSecondaryButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlinePrimaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  inlineSecondaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
  },
  reminderStateText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F766E',
    marginBottom: 6,
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
  logoutButton: {
    marginTop: 18,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  helperText: {
    marginTop: 14,
    fontSize: 14,
    lineHeight: 22,
    color: '#64748B',
  },
  stepList: {
    marginTop: 16,
    gap: 8,
  },
  stepText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#334155',
  },
  errorText: {
    marginTop: 4,
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

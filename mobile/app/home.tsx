import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  Linking,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { SeniorBottomNav } from '@/components/common/SeniorBottomNav';
import { createGuardianEventAlert } from '@/services/alerts';
import {
  buildParentAuthSession,
  saveAuthSession,
} from '@/services/authSession';
import { fetchLettersForElder } from '@/services/letters';
import {
  syncCurrentElderLocation,
  syncRequestedElderLocation,
} from '@/services/locationTask';
import {
  getMedications,
  MedicationItem,
  recordMedicationStatus,
} from '@/services/medications';
import { getSchedules, ScheduleItem } from '@/services/schedules';
import { getAgentProfile } from '@/services/chat';
import { syncMedicationRemindersIfEnabled } from '@/services/medicationReminders';
import { getElderProfileByUserId } from '@/services/elderProfile';

type LetterItem = {
  guardian_user_id: string;
  elder_user_id: string;
  content: string;
  created_at: string;
  link_code: string;
  sender_role: string;
};

function getMedicationDisplayName(medication: MedicationItem) {
  return medication.easy_name?.trim() || '이름 미정 약';
}

const BLUE = '#F97316';
const BLUE_DARK = '#EA580C';
const BLUE_LIGHT = '#FFEDD5';
const BG = '#FFFFFF';
const TEXT = '#111827';

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

function extractMedicationNamesFromProfileText(value: string): string[] {
  const text = String(value || '').trim();

  if (!text) {
    return [];
  }

  const medicationSection = extractSection(text, '복용 중인 약');
  const sourceText = medicationSection || text;

  return sourceText
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*[-*•]\s*/, '')
        .replace(/^\s*\d+[.)]\s*/, '')
        .replace(/^\[복용 중인 약\]\s*/g, '')
        .replace(/^복용 중인 약\s*[:：]?\s*/g, '')
        .trim()
    )
    .filter((line) => {
      if (!line) return false;
      if (line.includes('확인 불가')) return false;
      if (line.includes('복용 중인 약')) return false;
      if (line.includes('쉬운 약 이름')) return false;
      if (line.includes('복약 안내')) return false;
      if (line.includes('언제 먹는지')) return false;
      if (line.includes('하루에')) return false;
      if (line.includes('한 번에')) return false;
      if (line.includes('이미지에서')) return false;
      if (line.includes('개인정보')) return false;
      if (line.startsWith('[') && line.endsWith(']')) return false;
      return true;
    });
}

function buildFallbackMedicationItemsFromProfileText(value: string): MedicationItem[] {
  const names = extractMedicationNamesFromProfileText(value);

  return names.map((name, index) => {
    return {
      id: `profile-medication-${index}`,
      name,
      time: '복약 시간 확인 필요',
      status: 'scheduled',
      status_label: '먹을 시간',
      last_recorded_at: null,
      last_time_scope: null,
    } as unknown as MedicationItem;
  });
}

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const elderUserId = String(
    params.elderUserId || params.elder_user_id || params.parentId || ''
  ).trim();

  const parentName = String(params.parentName || '');
  const linkCode = String(params.linkCode || params.link_code || params.code || '');
  const guardianPhone = String(
    params.guardianPhone ||
      params.guardian_phone ||
      params.phone ||
      params.guardianPhoneNumber ||
      ''
  );

  const initialSelectedVoice = String(params.selectedVoice || params.agent_voice || '');
  const initialAgentName = String(params.agentName || params.agent_name || '케어');

  const [agentName, setAgentName] = useState(initialAgentName || '케어');
  const [selectedVoice, setSelectedVoice] = useState(initialSelectedVoice);

  const [latestLetter, setLatestLetter] = useState<LetterItem | null>(null);
  const [letters, setLetters] = useState<LetterItem[]>([]);
  const [loadingLetter, setLoadingLetter] = useState(true);
  const [isLetterModalVisible, setIsLetterModalVisible] = useState(false);

  const [medications, setMedications] = useState<MedicationItem[]>([]);
  const [isLoadingMedications, setIsLoadingMedications] = useState(true);
  const [medicationError, setMedicationError] = useState<string | null>(null);
  const [isRecordingHomeMedication, setIsRecordingHomeMedication] = useState(false);

  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const medicationPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationRequestPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goToChat = (voiceStart = false) => {
    router.push({
      pathname: '/chat',
      params: {
        input: voiceStart ? 'voice' : 'text',
        autostart: voiceStart ? '1' : '0',
        elderUserId,
        elder_user_id: elderUserId,
        linkCode,
        link_code: linkCode,
        selectedVoice,
        agentName,
        agent_name: agentName,
      },
    });
  };

  const goToElderMedications = () => {
    router.push({
      pathname: '/elder-medication',
      params: {
        elderUserId,
        elder_user_id: elderUserId,
        parentId: elderUserId,
        parentName,
        linkCode,
        link_code: linkCode,
      },
    });
  };

  const loadAgentProfile = async () => {
    if (!elderUserId) return;

    try {
      const profile = await getAgentProfile(elderUserId);
      const syncedAgentName = profile.agent_name?.trim() || agentName || '케어';
      const syncedAgentVoice = profile.agent_voice?.trim() || selectedVoice || '';

      setAgentName(syncedAgentName);
      setSelectedVoice(syncedAgentVoice);

      if (linkCode) {
        await saveAuthSession(
          buildParentAuthSession({
            parentId: elderUserId,
            elderUserId,
            parentName,
            linkCode,
            guardianPhone,
            agentName: syncedAgentName,
            agentVoice: syncedAgentVoice,
          })
        );
      }
    } catch (error) {
      console.log('에이전트 프로필 조회 오류:', error);
    }
  };

  const formatToYearMonthDayHour = (dateString: string) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');

    return `${year}.${month}.${day} ${hour}시`;
  };

  const sanitizePhoneNumber = (phone: string) => {
    return phone.replace(/[^0-9+]/g, '');
  };

  const notifyGuardianEvent = (
    type: string,
    message: string,
    severity: 'low' | 'medium' | 'high'
  ) => {
    if (!elderUserId || !linkCode) return;

    void createGuardianEventAlert({
      elder_user_id: elderUserId,
      link_code: linkCode,
      type,
      message,
      severity,
    }).catch((error) => {
      console.log('보호자 이벤트 알림 생성 오류:', error);
    });

    void syncCurrentElderLocation({
      elderUserId,
      linkCode,
      force: true,
    }).catch((error) => {
      console.log('긴급 위치 동기화 오류:', error);
    });
  };

  const handleCall119 = async () => {
    try {
      const url = 'tel:119';
      const supported = await Linking.canOpenURL(url);

      if (!supported) {
        Alert.alert('오류', '이 기기에서는 전화 연결을 사용할 수 없습니다.');
        return;
      }

      notifyGuardianEvent(
        'emergency_call',
        '부모님이 119 긴급 연락을 시도했어요. 위치 확인이 필요할 수 있어요.',
        'high'
      );

      await Linking.openURL(url);
    } catch (error) {
      console.log('119 전화 연결 오류:', error);
      Alert.alert('오류', '119 전화 연결 중 문제가 발생했습니다.');
    }
  };

  const handleGuardianEmergencyCall = async () => {
    try {
      if (!guardianPhone.trim()) {
        Alert.alert('알림', '보호자 전화번호가 없습니다.');
        return;
      }

      const sanitizedPhone = sanitizePhoneNumber(guardianPhone);

      if (!sanitizedPhone) {
        Alert.alert('알림', '유효한 보호자 전화번호가 없습니다.');
        return;
      }

      const url = `tel:${sanitizedPhone}`;
      const supported = await Linking.canOpenURL(url);

      if (!supported) {
        Alert.alert('오류', '이 기기에서는 전화 연결을 사용할 수 없습니다.');
        return;
      }

      notifyGuardianEvent(
        'guardian_call',
        '부모님이 보호자에게 긴급 연락을 시도했어요.',
        'high'
      );

      await Linking.openURL(url);
    } catch (error) {
      console.log('보호자 전화 연결 오류:', error);
      Alert.alert('오류', '보호자 전화 연결 중 문제가 발생했습니다.');
    }
  };

  const loadLetters = async (showLoading = false) => {
    if (!elderUserId || !linkCode) {
      setLatestLetter(null);
      setLetters([]);
      setLoadingLetter(false);
      return;
    }

    try {
      if (showLoading) setLoadingLetter(true);

      const data = await fetchLettersForElder(elderUserId, linkCode);

      if (data?.letters && Array.isArray(data.letters) && data.letters.length > 0) {
        setLetters(data.letters);
        setLatestLetter(data.letters[0]);
      } else {
        setLetters([]);
        setLatestLetter(null);
      }
    } catch (error) {
      console.log('편지 조회 오류:', error);
      setLetters([]);
      setLatestLetter(null);
    } finally {
      setLoadingLetter(false);
    }
  };

  const loadMedications = async () => {
    if (!elderUserId) {
      setMedications([]);
      setIsLoadingMedications(false);
      return;
    }

    try {
      setIsLoadingMedications(true);
      setMedicationError(null);

      const [items, profile] = await Promise.all([
        getMedications(elderUserId),
        getElderProfileByUserId(elderUserId),
      ]);

      const apiMedicationItems = Array.isArray(items) ? items : [];
      const profileMedicationText = profile?.medications ?? '';

      const finalMedicationItems =
        apiMedicationItems.length > 0
          ? apiMedicationItems
          : buildFallbackMedicationItemsFromProfileText(profileMedicationText);

      setMedications(finalMedicationItems);
      await syncMedicationRemindersIfEnabled({
        elderUserId,
        medications: finalMedicationItems,
      });
    } catch (error) {
      console.log('복약 조회 오류:', error);
      setMedications([]);
      setMedicationError('복약 정보를 불러오지 못했습니다.');
    } finally {
      setIsLoadingMedications(false);
    }
  };

  const loadSchedules = async () => {
    if (!elderUserId) {
      setSchedules([]);
      setIsLoadingSchedules(false);
      return;
    }

    try {
      setIsLoadingSchedules(true);
      setScheduleError(null);

      const items = await getSchedules(elderUserId);
      setSchedules(items);
    } catch (error) {
      console.log('일정 조회 오류:', error);
      setSchedules([]);
      setScheduleError('일정을 불러오지 못했습니다.');
    } finally {
      setIsLoadingSchedules(false);
    }
  };

  const syncLocation = async () => {
    if (!elderUserId || !linkCode) return;

    try {
      await syncCurrentElderLocation({ elderUserId, linkCode });
    } catch (error) {
      console.log('위치 동기화 오류:', error);
    }
  };

  const syncRequestedLocation = async () => {
    if (!elderUserId || !linkCode) return;

    try {
      await syncRequestedElderLocation({ elderUserId, linkCode });
    } catch (error) {
      console.log('위치 요청 처리 오류:', error);
    }
  };

  useEffect(() => {
    if (!elderUserId || !linkCode) return;

    void saveAuthSession(
      buildParentAuthSession({
        parentId: elderUserId,
        elderUserId,
        parentName,
        linkCode,
        guardianPhone,
        agentName,
        agentVoice: selectedVoice,
      })
    ).catch((error) => {
      console.log('부모님 홈 세션 동기화 오류:', error);
    });
  }, [agentName, elderUserId, guardianPhone, linkCode, parentName, selectedVoice]);

  useEffect(() => {
    void loadLetters(true);
    void loadMedications();
    void loadSchedules();
    void syncLocation();
    void syncRequestedLocation();
    void loadAgentProfile();

    if (pollingRef.current) clearInterval(pollingRef.current);
    if (medicationPollingRef.current) clearInterval(medicationPollingRef.current);
    if (locationRequestPollingRef.current) clearInterval(locationRequestPollingRef.current);

    if (elderUserId && linkCode) {
      pollingRef.current = setInterval(() => {
        void loadLetters(false);
      }, 10000);

      medicationPollingRef.current = setInterval(() => {
        void loadMedications();
      }, 60000);

      locationRequestPollingRef.current = setInterval(() => {
        void syncRequestedLocation();
      }, 10000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }

      if (medicationPollingRef.current) {
        clearInterval(medicationPollingRef.current);
        medicationPollingRef.current = null;
      }

      if (locationRequestPollingRef.current) {
        clearInterval(locationRequestPollingRef.current);
        locationRequestPollingRef.current = null;
      }
    };
  }, [elderUserId, linkCode]);

  useFocusEffect(
    useCallback(() => {
      void loadLetters(false);
      void loadMedications();
      void loadSchedules();
      void syncLocation();
      void syncRequestedLocation();
      void loadAgentProfile();

      return undefined;
    }, [elderUserId, linkCode, agentName, selectedVoice])
  );

  const firstSchedule = schedules[0];
  const firstMedication = medications[0];
  const displayName = parentName ? `${parentName}님` : '영희님';

  const handleFirstMedicationTaken = async () => {
    if (!firstMedication) {
      goToElderMedications();
      return;
    }

    if (isRecordingHomeMedication) return;

    setIsRecordingHomeMedication(true);

    try {
      await recordMedicationStatus({
        elder_user_id: elderUserId || undefined,
        medication_id: firstMedication.id ?? null,
        medication_name: firstMedication.name,
        time_scope: firstMedication.time,
        status: 'taken',
      });

      Alert.alert('복약 기록', '먹었다고 기록했어요.');
      await loadMedications();
    } catch (error) {
      console.log('홈 복약 기록 오류:', error);
      Alert.alert('복약 기록 실패', '복약 상태를 기록하지 못했습니다.');
    } finally {
      setIsRecordingHomeMedication(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={styles.connectedPill}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#047A36" />
            <Text style={styles.connectedText}>보호자 연결됨</Text>
          </View>

          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => router.push('/settings')}
            activeOpacity={0.85}
          >
            <Ionicons name="settings-outline" size={28} color={BLUE_DARK} />
          </TouchableOpacity>
        </View>

        <Text style={styles.homeTitle}>
          {displayName},{'\n'}오늘 컨디션은 어떠세요?
        </Text>

        <TouchableOpacity
          style={styles.voiceHeroCard}
          onPress={() => goToChat(true)}
          activeOpacity={0.9}
        >
          <View style={styles.voiceHeroTextArea}>
            <Text style={styles.voiceHeroTitle}>{agentName || '케어'}에게 말하기</Text>
            <Text style={styles.voiceHeroDescription}>누르고 바로 말씀하세요</Text>

            <View style={styles.voiceHeroButton}>
              <Text style={styles.voiceHeroButtonText}>말하기 시작</Text>
            </View>
          </View>

          <View style={styles.voiceHeroMicWrap}>
            <View style={styles.voiceHeroMic}>
              <Ionicons name="mic-outline" size={44} color="#FFFFFF" />
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.medicationNowCard}>
          <View style={styles.cardTopRow}>
            <View style={styles.orangePill}>
              <Text style={styles.orangePillText}>
                {firstMedication?.time || '복약 시간'}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.medicationDoneButton,
                (!firstMedication || isRecordingHomeMedication) && styles.disabledActionButton,
              ]}
              onPress={() => void handleFirstMedicationTaken()}
              disabled={!firstMedication || isRecordingHomeMedication}
              activeOpacity={0.88}
            >
              {isRecordingHomeMedication ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.medicationDoneText}>먹었어요</Text>
              )}
            </TouchableOpacity>
          </View>

          {isLoadingMedications ? (
            <SmallLoading text="복약 확인 중" />
          ) : medicationError ? (
            <Text style={styles.cardErrorText}>{medicationError}</Text>
          ) : firstMedication ? (
            <>
              <Text style={styles.medicationNowTitle}>약 먹을 시간이에요</Text>
              <Text style={styles.medicationNowName}>
                {getMedicationDisplayName(firstMedication)}
              </Text>
              <Text style={styles.medicationNowDescription}>물 한 컵과 함께 드세요.</Text>
            </>
          ) : (
            <>
              <Text style={styles.medicationNowTitle}>등록된 약이 없어요</Text>
              <Text style={styles.medicationNowDescription}>
                보호자가 약 정보를 등록하면 여기에서 볼 수 있어요.
              </Text>
            </>
          )}

          <TouchableOpacity
            style={styles.medicationDetailButton}
            onPress={goToElderMedications}
            activeOpacity={0.88}
          >
            <Text style={styles.medicationDetailButtonText}>약 전체 보기</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.letterCard}
          onPress={() => setIsLetterModalVisible(true)}
          activeOpacity={0.9}
        >
          <View style={styles.letterIconCircle}>
            <Ionicons name="mail-outline" size={28} color={BLUE_DARK} />
          </View>

          <View style={styles.letterTitleArea}>
            <Text style={styles.letterTitle}>보호자 메시지</Text>
            {loadingLetter ? (
              <Text style={styles.letterCount}>메시지를 불러오는 중이에요</Text>
            ) : latestLetter ? (
              <Text style={styles.letterCount} numberOfLines={1}>
                {latestLetter.content}
              </Text>
            ) : (
              <Text style={styles.letterCount}>도착한 메시지가 없어요</Text>
            )}
          </View>

          <Ionicons name="chevron-forward" size={24} color={BLUE_DARK} />
        </TouchableOpacity>

        <View style={styles.summaryGrid}>
          <TouchableOpacity
            style={styles.summaryCard}
            onPress={() => router.push('/calendar')}
            activeOpacity={0.88}
          >
            <View style={styles.summaryIconBox}>
              <Ionicons name="calendar-outline" size={32} color={BLUE_DARK} />
            </View>
            <Text style={styles.summaryTitle}>오늘 일정</Text>

            {isLoadingSchedules ? (
              <SmallLoading text="일정 확인 중" />
            ) : scheduleError ? (
              <Text style={styles.cardErrorText}>{scheduleError}</Text>
            ) : firstSchedule ? (
              <>
                <Text style={styles.summaryValue}>{firstSchedule.time}</Text>
                <Text style={styles.summaryDescription} numberOfLines={2}>
                  {firstSchedule.title}
                </Text>
              </>
            ) : (
              <Text style={styles.emptyCardText}>오늘 일정이 없어요</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.emergencySummaryCard}
            onPress={handleGuardianEmergencyCall}
            activeOpacity={0.88}
          >
            <View style={styles.emergencyIconBox}>
              <Ionicons name="call-outline" size={32} color="#B91C1C" />
            </View>
            <Text style={styles.emergencySummaryTitle}>긴급 도움</Text>
            <Text style={styles.emergencySummaryDescription}>보호자 전화</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.quickActionRow}>
          <TouchableOpacity
            style={styles.call119Button}
            onPress={handleCall119}
            activeOpacity={0.9}
          >
            <Ionicons name="call-outline" size={30} color="#FFFFFF" />
            <Text style={styles.emergencyText}>119 전화</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.guardianCallButton}
            onPress={handleGuardianEmergencyCall}
            activeOpacity={0.9}
          >
            <Ionicons name="person-outline" size={30} color="#FFFFFF" />
            <Text style={styles.emergencyText}>보호자 전화</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.chatButton}
          onPress={() => goToChat(false)}
          activeOpacity={0.9}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={34} color={BLUE_DARK} />
          <View style={styles.chatTextArea}>
            <Text style={styles.chatTitle}>대화 기록 보기</Text>
            <Text style={styles.chatSubTitle}>이전에 나눈 말을 확인해요</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={BLUE_DARK} />
        </TouchableOpacity>
      </ScrollView>

      <SeniorBottomNav
        active="home"
        params={{
          parentId: elderUserId,
          elderUserId,
          parentName,
          linkCode,
          guardianPhone,
          agentName,
          agentVoice: selectedVoice,
          selectedVoice,
        }}
      />

      <Modal
        visible={isLetterModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsLetterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>메시지함</Text>
                <Text style={styles.modalSubTitle}>
                  {letters.length > 0
                    ? `총 ${letters.length}개의 보호자 메시지`
                    : '도착한 메시지가 없습니다'}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsLetterModalVisible(false)}
              >
                <Text style={styles.closeButtonText}>닫기</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {letters.length > 0 ? (
                letters.map((letter, index) => (
                  <View key={`${letter.created_at}-${index}`} style={styles.letterItem}>
                    <View style={styles.letterItemTopRow}>
                      <Text style={styles.letterSender}>보호자 메시지</Text>
                      <Text style={styles.letterItemTime}>
                        {formatToYearMonthDayHour(letter.created_at)}
                      </Text>
                    </View>

                    <Text style={styles.letterItemContent}>{letter.content}</Text>
                  </View>
                ))
              ) : (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyLetterText}>
                    도착한 보호자 메시지가 없습니다.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SmallLoading({ text }: { text: string }) {
  return (
    <View style={styles.smallLoading}>
      <ActivityIndicator size="small" color={BLUE} />
      <Text style={styles.smallLoadingText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 132,
    gap: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  connectedPill: {
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectedText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#047A36',
  },
  settingsButton: {
    width: 54,
    height: 54,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FED7AA',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  homeTitle: {
    fontSize: 33,
    lineHeight: 43,
    fontWeight: '900',
    color: TEXT,
    letterSpacing: -0.5,
  },
  voiceHeroCard: {
    minHeight: 178,
    borderRadius: 30,
    backgroundColor: BLUE_DARK,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 20,
    shadowColor: BLUE_DARK,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 7,
  },
  voiceHeroTextArea: {
    flex: 1,
  },
  voiceHeroTitle: {
    fontSize: 27,
    lineHeight: 35,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  voiceHeroDescription: {
    marginTop: 6,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
    color: '#FFF7ED',
  },
  voiceHeroButton: {
    marginTop: 22,
    alignSelf: 'flex-start',
    minHeight: 48,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceHeroButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: BLUE_DARK,
  },
  voiceHeroMicWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceHeroMic: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicationNowCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: '#FED7AA',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },
  orangePill: {
    minHeight: 36,
    borderRadius: 999,
    backgroundColor: BLUE_LIGHT,
    paddingHorizontal: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orangePillText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    color: BLUE_DARK,
  },
  medicationDoneButton: {
    minHeight: 62,
    minWidth: 124,
    borderRadius: 22,
    backgroundColor: BLUE_DARK,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    shadowColor: BLUE_DARK,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 5,
  },
  medicationDoneText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  medicationNowTitle: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '900',
    color: TEXT,
  },
  medicationNowName: {
    marginTop: 7,
    fontSize: 25,
    lineHeight: 34,
    fontWeight: '900',
    color: TEXT,
  },
  medicationNowDescription: {
    marginTop: 8,
    fontSize: 18,
    lineHeight: 27,
    fontWeight: '700',
    color: '#475569',
  },
  medicationDetailButton: {
    marginTop: 18,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicationDetailButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: BLUE_DARK,
  },
  disabledActionButton: {
    opacity: 0.55,
  },
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '700',
    color: '#3159B8',
  },
  letterCard: {
    minHeight: 82,
    borderRadius: 24,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  letterIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterTitleArea: {
    flex: 1,
  },
  letterTitle: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '900',
    color: TEXT,
  },
  letterCount: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: '#64748B',
  },
  letterText: {
    fontSize: 27,
    lineHeight: 42,
    fontWeight: '900',
    color: TEXT,
    textAlign: 'center',
  },
  letterTime: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'right',
  },
  emptyText: {
    fontSize: 22,
    lineHeight: 32,
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'center',
    paddingVertical: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 14,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    minHeight: 142,
    borderWidth: 1,
    borderColor: '#FED7AA',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  summaryIconBox: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '900',
    color: TEXT,
  },
  summaryValue: {
    marginTop: 8,
    fontSize: 23,
    lineHeight: 31,
    fontWeight: '900',
    color: BLUE_DARK,
  },
  summaryDescription: {
    marginTop: 4,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
    color: '#475569',
  },
  emergencySummaryCard: {
    flex: 1,
    minHeight: 142,
    borderRadius: 24,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  emergencyIconBox: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emergencySummaryTitle: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '900',
    color: '#B91C1C',
  },
  emergencySummaryDescription: {
    marginTop: 8,
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '900',
    color: '#B91C1C',
  },
  emptyCardText: {
    marginTop: 18,
    fontSize: 18,
    lineHeight: 27,
    fontWeight: '800',
    color: '#6B7280',
    textAlign: 'center',
  },
  cardErrorText: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: '#DC2626',
    textAlign: 'center',
  },
  smallLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  smallLoadingText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  call119Button: {
    flex: 1,
    minHeight: 70,
    backgroundColor: '#FF4D4F',
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#FF4D4F',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  guardianCallButton: {
    flex: 1,
    minHeight: 70,
    backgroundColor: BLUE_DARK,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: BLUE_DARK,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  emergencyText: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  chatButton: {
    minHeight: 82,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FED7AA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  chatTextArea: {
    flex: 1,
  },
  chatTitle: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '900',
    color: TEXT,
  },
  chatSubTitle: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: '#64748B',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: '74%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 30,
  },
  modalHandle: {
    width: 56,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
  },
  modalSubTitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  closeButton: {
    backgroundColor: BLUE_LIGHT,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: BLUE_DARK,
  },
  modalScrollContent: {
    paddingBottom: 20,
  },
  letterItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5EDF8',
  },
  letterItemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  letterSender: {
    fontSize: 15,
    fontWeight: '800',
    color: BLUE_DARK,
  },
  letterItemContent: {
    fontSize: 18,
    color: '#111827',
    lineHeight: 27,
    fontWeight: '600',
  },
  letterItemTime: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
  },
  emptyBox: {
    paddingTop: 50,
    alignItems: 'center',
  },
  emptyLetterText: {
    fontSize: 17,
    color: '#64748B',
    textAlign: 'center',
  },
});

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
import { getMedications, MedicationItem } from '@/services/medications';
import { getSchedules, ScheduleItem } from '@/services/schedules';
import { getAgentProfile } from '@/services/chat';
import { syncMedicationRemindersIfEnabled } from '@/services/medicationReminders';

type LetterItem = {
  guardian_user_id: string;
  elder_user_id: string;
  content: string;
  created_at: string;
  link_code: string;
  sender_role: string;
};

const BLUE = '#4F7CFF';
const BLUE_DARK = '#2F5FEA';
const BLUE_LIGHT = '#EEF3FF';
const BG = '#EEF4FF';

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const elderUserId = String(
    params.elderUserId || params.elder_user_id || params.parentId || ''
  );
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
    try {
      setIsLoadingMedications(true);
      setMedicationError(null);
      const items = await getMedications(elderUserId);
      setMedications(items);
      await syncMedicationRemindersIfEnabled({
        elderUserId,
        medications: items,
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.helloText}>안녕하세요!</Text>
            <Text style={styles.subHelloText}>{agentName}가 기다리고 있어요</Text>
          </View>

          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => router.push('/settings')}
            activeOpacity={0.85}
          >
            <Ionicons name="settings-outline" size={30} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.letterCard}
          onPress={() => setIsLetterModalVisible(true)}
          activeOpacity={0.9}
        >
          <View style={styles.letterTopRow}>
            <View style={styles.letterIconCircle}>
              <Ionicons name="mail-outline" size={28} color={BLUE} />
            </View>

            <View style={styles.letterTitleArea}>
              <Text style={styles.letterTitle}>보호자 메시지</Text>
              <Text style={styles.letterCount}>
                {letters.length > 0 ? `총 ${letters.length}개의 메시지` : '최근 메시지'}
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={24} color={BLUE_DARK} />
          </View>

          {loadingLetter ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={BLUE} />
              <Text style={styles.loadingText}>메시지를 불러오는 중입니다</Text>
            </View>
          ) : latestLetter ? (
            <>
              <Text style={styles.letterText} numberOfLines={3}>
                {latestLetter.content}
              </Text>
              <Text style={styles.letterTime}>
                {formatToYearMonthDayHour(latestLetter.created_at)}
              </Text>
            </>
          ) : (
            <Text style={styles.emptyText}>도착한 보호자 메시지가 없습니다.</Text>
          )}
        </TouchableOpacity>

        <View style={styles.micArea}>
          <TouchableOpacity
            style={styles.bigMicButton}
            onPress={() => goToChat(true)}
            activeOpacity={0.9}
          >
            <Ionicons name="mic-outline" size={112} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.micGuide}>버튼을 눌러 말씀하세요</Text>
          <Text style={styles.wakeGuide}>
            {`${agentName}야!라고 부르거나 버튼을 눌러 대화할 수 있어요`}
          </Text>
        </View>

        <View style={styles.summaryGrid}>
          <TouchableOpacity
            style={styles.summaryCard}
            onPress={() => router.push('/calendar')}
            activeOpacity={0.88}
          >
            <View style={styles.summaryHeader}>
              <Ionicons name="calendar-outline" size={34} color={BLUE_DARK} />
              <Text style={styles.summaryTitle}>오늘 일정</Text>
            </View>

            {isLoadingSchedules ? (
              <SmallLoading text="일정 확인 중" />
            ) : scheduleError ? (
              <Text style={styles.cardErrorText}>{scheduleError}</Text>
            ) : firstSchedule ? (
              <>
                <View style={styles.pillBox}>
                  <Text style={styles.pillTime}>{firstSchedule.time}</Text>
                  <Text style={styles.pillText} numberOfLines={1}>
                    {firstSchedule.title}
                  </Text>
                </View>

                {schedules[1] ? (
                  <View style={styles.pillBox}>
                    <Text style={styles.pillTime}>{schedules[1].time}</Text>
                    <Text style={styles.pillText} numberOfLines={1}>
                      {schedules[1].title}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={styles.emptyCardText}>오늘 일정이 없습니다</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.summaryCard}
            onPress={goToElderMedications}
            activeOpacity={0.88}
          >
            <View style={styles.summaryHeader}>
              <Ionicons name="medical-outline" size={34} color={BLUE_DARK} />
              <Text style={styles.summaryTitle}>복약 정보</Text>
            </View>

            {isLoadingMedications ? (
              <SmallLoading text="복약 확인 중" />
            ) : medicationError ? (
              <Text style={styles.cardErrorText}>{medicationError}</Text>
            ) : firstMedication ? (
              <>
                <View style={styles.pillBox}>
                  <Text style={styles.pillTime}>{firstMedication.time}</Text>
                  <Text style={styles.pillText} numberOfLines={1}>
                    {firstMedication.name}
                  </Text>
                </View>

                {medications[1] ? (
                  <View style={styles.pillBox}>
                    <Text style={styles.pillTime}>{medications[1].time}</Text>
                    <Text style={styles.pillText} numberOfLines={1}>
                      {medications[1].name}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={styles.emptyCardText}>등록된 약이 없습니다</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.chatButton}
          onPress={() => goToChat(false)}
          activeOpacity={0.9}
        >
          <Ionicons name="chatbubble-outline" size={48} color="#FFFFFF" />
          <View style={styles.chatTextArea}>
            <Text style={styles.chatTitle}>대화기록 보기</Text>
            
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.call119Button}
          onPress={handleCall119}
          activeOpacity={0.9}
        >
          <Ionicons name="call-outline" size={48} color="#FFFFFF" />
          <Text style={styles.emergencyText}>119 긴급전화</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.guardianCallButton}
          onPress={handleGuardianEmergencyCall}
          activeOpacity={0.9}
        >
          <Ionicons name="call-outline" size={48} color="#FFFFFF" />
          <Text style={styles.emergencyText}>보호자 전화</Text>
        </TouchableOpacity>
      </ScrollView>

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
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 36,
    gap: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  helloText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#16213E',
    letterSpacing: -0.8,
  },
  subHelloText: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '700',
    color: BLUE_DARK,
  },
  settingsButton: {
    width: 72,
    height: 58,
    borderRadius: 22,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },
  letterCard: {
    backgroundColor: '#BFD0FF',
    borderRadius: 30,
    padding: 22,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  letterTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
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
    fontSize: 24,
    fontWeight: '900',
    color: '#163B91',
  },
  letterCount: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '700',
    color: '#3159B8',
  },
  letterText: {
    fontSize: 27,
    lineHeight: 42,
    fontWeight: '900',
    color: '#173E91',
    textAlign: 'center',
  },
  letterTime: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#3159B8',
    textAlign: 'right',
  },
  emptyText: {
    fontSize: 22,
    lineHeight: 32,
    fontWeight: '800',
    color: '#3159B8',
    textAlign: 'center',
    paddingVertical: 16,
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
  micArea: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  bigMicButton: {
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  micGuide: {
    marginTop: 24,
    fontSize: 30,
    fontWeight: '900',
    color: '#1D3F8F',
    letterSpacing: -0.7,
  },
  wakeGuide: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '700',
    color: '#5B6F9F',
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
    minHeight: 220,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    gap: 8,
  },
  summaryTitle: {
    flex: 1,
    fontSize: 23,
    fontWeight: '900',
    color: '#1F3E8A',
    letterSpacing: -0.5,
  },
  pillBox: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 20,
    paddingVertical: 15,
    paddingHorizontal: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  pillTime: {
    fontSize: 19,
    fontWeight: '900',
    color: BLUE_DARK,
    marginBottom: 6,
  },
  pillText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#222B45',
    textAlign: 'center',
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
  chatButton: {
    backgroundColor: BLUE,
    borderRadius: 26,
    paddingVertical: 25,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  chatTextArea: {
    flex: 1,
  },
  chatTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.8,
  },
  chatSubTitle: {
    marginTop: 7,
    fontSize: 22,
    fontWeight: '700',
    color: '#EAF0FF',
  },
  call119Button: {
    backgroundColor: '#FF4D4F',
    borderRadius: 26,
    paddingVertical: 25,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    shadowColor: '#FF4D4F',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  guardianCallButton: {
    backgroundColor: BLUE_DARK,
    borderRadius: 26,
    paddingVertical: 25,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    shadowColor: BLUE_DARK,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  emergencyText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.8,
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

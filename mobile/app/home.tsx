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

type LetterItem = {
  guardian_user_id: string;
  elder_user_id: string;
  content: string;
  created_at: string;
  link_code: string;
  sender_role: string;
};

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const elderUserId = String(
    params.elderUserId || params.elder_user_id || params.parentId || ''
  );
  const parentName = String(params.parentName || '');
  const linkCode = String(
    params.linkCode || params.link_code || params.code || ''
  );
  const guardianPhone = String(
    params.guardianPhone ||
      params.guardian_phone ||
      params.phone ||
      params.guardianPhoneNumber ||
      ''
  );
  const selectedVoice = String(params.selectedVoice || '');
  const agentName = String(params.agentName || '');

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
  const locationRequestPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleMicPress = () => {
    router.push({
      pathname: '/chat',
      params: {
        input: 'voice',
        autostart: '1',
        elderUserId,
        elder_user_id: elderUserId,
        linkCode,
        link_code: linkCode,
        selectedVoice,
        agentName,
      },
    });
  };

  const handleOpenChatHistory = () => {
    router.push({
      pathname: '/chat',
      params: {
        elderUserId,
        elder_user_id: elderUserId,
        linkCode,
        link_code: linkCode,
        selectedVoice,
        agentName,
      },
    });
  };

  const formatToYearMonthDayHour = (dateString: string) => {
    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');

    return `${year}.${month}.${day} ${hour}시`;
  };

  const sanitizePhoneNumber = (phone: string) => {
    return phone.replace(/[^0-9+]/g, '');
  };

  const notifyGuardianEvent = (type: string, message: string, severity: 'low' | 'medium' | 'high') => {
    if (!elderUserId || !linkCode) {
      return;
    }

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
      if (showLoading) {
        setLoadingLetter(true);
      }

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
    } catch (error) {
      console.log('복약 조회 오류:', error);
      setMedications([]);
      setMedicationError('복약 상태를 불러오지 못했습니다.');
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
    if (!elderUserId || !linkCode) {
      return;
    }

    try {
      await syncCurrentElderLocation({
        elderUserId,
        linkCode,
      });
    } catch (error) {
      console.log('위치 동기화 오류:', error);
    }
  };

  const syncRequestedLocation = async () => {
    if (!elderUserId || !linkCode) {
      return;
    }

    try {
      await syncRequestedElderLocation({
        elderUserId,
        linkCode,
      });
    } catch (error) {
      console.log('위치 요청 처리 오류:', error);
    }
  };

  useEffect(() => {
    if (!elderUserId || !linkCode) {
      return;
    }

    void saveAuthSession(
      buildParentAuthSession({
        parentId: elderUserId,
        elderUserId,
        parentName,
        linkCode,
        guardianPhone,
      })
    ).catch((error) => {
      console.log('부모님 홈 세션 동기화 오류:', error);
    });
  }, [elderUserId, guardianPhone, linkCode, parentName]);

  useEffect(() => {
    void loadLetters(true);
    void loadMedications();
    void loadSchedules();
    void syncLocation();
    void syncRequestedLocation();

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    if (locationRequestPollingRef.current) {
      clearInterval(locationRequestPollingRef.current);
    }

    if (elderUserId && linkCode) {
      pollingRef.current = setInterval(() => {
        void loadLetters(false);
      }, 10000);

      locationRequestPollingRef.current = setInterval(() => {
        void syncRequestedLocation();
      }, 10000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
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
      return undefined;
    }, [elderUserId, linkCode])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FB" />

      <View style={styles.container}>
        <View style={styles.topSection}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>
              안녕하세요!
            </Text>

            <View style={styles.linkCodeChip}>
              <Text style={styles.linkCodeLabel}>연동코드</Text>
              <Text style={styles.linkCodeValue}>{linkCode || '없음'}</Text>
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.middleSection}
          contentContainerStyle={styles.middleSectionContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.messageCard}>
            <View style={styles.messageTopRow}>
              <View style={styles.messageLeftArea}>
                <Text style={styles.messageTitle}>보호자 메시지</Text>
                <Text style={styles.messageSubInfo}>
                  {letters.length > 0
                    ? `총 ${letters.length}개의 메시지`
                    : '최근 도착한 메시지를 확인하세요'}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.simpleMessageButton}
                onPress={() => setIsLetterModalVisible(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.simpleMessageButtonText}>전체보기</Text>
                <Ionicons name="chevron-forward" size={16} color="#2563EB" />
              </TouchableOpacity>
            </View>

            {loadingLetter ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color="#3B82F6" />
                <Text style={styles.loadingText}>메시지를 불러오는 중입니다</Text>
              </View>
            ) : latestLetter ? (
              <>
                <Text style={styles.messageText} numberOfLines={3}>
                  {latestLetter.content}
                </Text>
                <Text style={styles.messageTime}>
                  {formatToYearMonthDayHour(latestLetter.created_at)}
                </Text>
              </>
            ) : (
              <Text style={styles.emptyMessageText}>
                도착한 보호자 메시지가 없습니다.
              </Text>
            )}
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoCardHeader}>
              <Text style={styles.messageTitle}>복약 상태</Text>
              <Text style={styles.messageSubInfo}>최근 복약 기록이 반영된 목록입니다</Text>
            </View>

            {isLoadingMedications ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color="#3B82F6" />
                <Text style={styles.loadingText}>복약 상태를 불러오는 중입니다</Text>
              </View>
            ) : null}

            {!isLoadingMedications && medicationError ? (
              <Text style={styles.errorText}>{medicationError}</Text>
            ) : null}

            {!isLoadingMedications && !medicationError && medications.length === 0 ? (
              <Text style={styles.emptyMessageText}>등록된 복약 정보가 없습니다.</Text>
            ) : null}

            {!isLoadingMedications && !medicationError
              ? medications.slice(0, 3).map((medication, index) => (
                  <View key={`${medication.name}-${medication.time}-${index}`} style={styles.infoItem}>
                    <View style={styles.infoItemHeader}>
                      <Text style={styles.infoItemTitle}>{medication.name}</Text>
                      <View style={[styles.statusBadge, getMedicationBadgeStyle(medication.status)]}>
                        <Text style={styles.statusBadgeText}>{medication.status_label}</Text>
                      </View>
                    </View>
                    <Text style={styles.infoItemMeta}>복약 시간: {medication.time}</Text>
                    {medication.last_recorded_at ? (
                      <Text style={styles.infoItemSubMeta}>
                        최근 기록: {formatMedicationRecord(medication)}
                      </Text>
                    ) : null}
                  </View>
                ))
              : null}
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoCardHeader}>
              <Text style={styles.messageTitle}>오늘 일정</Text>
              <Text style={styles.messageSubInfo}>등록된 일정과 방금 추가한 일정이 반영됩니다</Text>
            </View>

            {isLoadingSchedules ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color="#3B82F6" />
                <Text style={styles.loadingText}>일정을 불러오는 중입니다</Text>
              </View>
            ) : null}

            {!isLoadingSchedules && scheduleError ? (
              <Text style={styles.errorText}>{scheduleError}</Text>
            ) : null}

            {!isLoadingSchedules && !scheduleError && schedules.length === 0 ? (
              <Text style={styles.emptyMessageText}>등록된 일정이 없습니다.</Text>
            ) : null}

            {!isLoadingSchedules && !scheduleError
              ? schedules.slice(0, 3).map((schedule, index) => (
                  <View key={`${schedule.date}-${schedule.time}-${schedule.title}-${index}`} style={styles.infoItem}>
                    <View style={styles.infoItemHeader}>
                      <Text style={styles.infoItemTitle}>{schedule.title}</Text>
                      <Text style={styles.scheduleStatusText}>{formatScheduleStatus(schedule.status)}</Text>
                    </View>
                    <Text style={styles.infoItemMeta}>
                      {schedule.date} · {schedule.time}
                    </Text>
                  </View>
                ))
              : null}
          </View>

          <View style={styles.micWrap}>
            <TouchableOpacity
              style={styles.micButton}
              onPress={handleMicPress}
              activeOpacity={0.9}
            >
              <View style={styles.micIconWrap}>
                <Ionicons name="mic" size={32} color="#FFFFFF" />
              </View>

              <Text style={styles.micText}>눌러서 말하기</Text>
              <Text style={styles.micSubText}>터치하면 바로 시작됩니다</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.grid}>
            <TouchableOpacity
              style={styles.card}
              onPress={handleOpenChatHistory}
              activeOpacity={0.88}
            >
              <View style={styles.cardIconWrap}>
                <Ionicons name="chatbubble-ellipses-outline" size={24} color="#2563EB" />
              </View>
              <Text style={styles.cardText}>대화 보기</Text>
              <Text style={styles.cardSubText}>대화 내용을 확인합니다</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.card}
              onPress={() =>
                router.push({
                  pathname: '/calendar',
                  params: {
                    viewerRole: 'parent',
                  },
                })
              }
              activeOpacity={0.88}
            >
              <View style={styles.cardIconWrap}>
                <Ionicons name="calendar-outline" size={24} color="#2563EB" />
              </View>
              <Text style={styles.cardText}>일정 보기</Text>
              <Text style={styles.cardSubText}>오늘 일정을 확인합니다</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.settingsShortcutCard}
            onPress={() => router.push('/settings')}
            activeOpacity={0.88}
          >
            <View style={styles.settingsShortcutIconWrap}>
              <Ionicons name="settings-outline" size={24} color="#2563EB" />
            </View>
            <View style={styles.settingsShortcutContent}>
              <Text style={styles.cardText}>설정</Text>
              <Text style={styles.cardSubText}>위치 권한과 앱 사용 설정을 확인합니다</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={styles.callButton}
            onPress={handleCall119}
            activeOpacity={0.9}
          >
            <View style={styles.emergencyLeft}>
              <Text style={styles.callLabel}>응급 상황</Text>
              <Text style={styles.callText}>119 전화하기</Text>
            </View>
            <Ionicons name="call" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sosButton}
            onPress={handleGuardianEmergencyCall}
            activeOpacity={0.9}
          >
            <View style={styles.emergencyLeft}>
              <Text style={styles.sosLabel}>보호자 긴급 연락</Text>
              <Text style={styles.sosText}>
                {guardianPhone ? guardianPhone : 'SOS 긴급 연락'}
              </Text>
            </View>
            <Ionicons name="warning" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7FB',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
  },
  topSection: {
    paddingTop: 4,
    marginBottom: 12,
  },
  middleSection: {
    flex: 1,
  },
  middleSectionContent: {
    paddingBottom: 20,
    gap: 12,
  },
  bottomSection: {
    paddingTop: 8,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
    fontSize: 30,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
    marginRight: 12,
  },
  subtitle: {
    fontSize: 18,
    color: '#6B7280',
    marginTop: 8,
    fontWeight: '500',
  },
  linkCodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  linkCodeLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '700',
  },
  linkCodeValue: {
    fontSize: 14,
    color: '#2563EB',
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  messageCard: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#EAECEF',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#EAECEF',
  },
  infoCardHeader: {
    marginBottom: 8,
  },
  messageTopRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 10,
    gap: 10,
  },
  messageLeftArea: {
    flex: 1,
    justifyContent: 'center',
  },
  messageTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  messageSubInfo: {
    marginTop: 4,
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  simpleMessageButton: {
    minHeight: 48,
    minWidth: 106,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  simpleMessageButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563EB',
  },
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
  },
  messageText: {
    fontSize: 18,
    color: '#111827',
    lineHeight: 28,
    fontWeight: '600',
  },
  emptyMessageText: {
    fontSize: 17,
    color: '#6B7280',
    lineHeight: 26,
  },
  messageTime: {
    marginTop: 10,
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  infoItem: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 14,
    marginTop: 14,
  },
  infoItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoItemTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  infoItemMeta: {
    marginTop: 8,
    fontSize: 15,
    color: '#475569',
  },
  infoItemSubMeta: {
    marginTop: 6,
    fontSize: 14,
    color: '#64748B',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scheduleStatusText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  errorText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#B91C1C',
  },
  micWrap: {
    alignItems: 'center',
    marginTop: 4,
  },
  micButton: {
    width: '100%',
    borderRadius: 28,
    paddingVertical: 26,
    paddingHorizontal: 20,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  micIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  micText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  micSubText: {
    color: '#DBEAFE',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#EAECEF',
    padding: 18,
  },
  cardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#EEF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  cardSubText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
    color: '#6B7280',
    fontWeight: '600',
  },
  settingsShortcutCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#EAECEF',
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  settingsShortcutIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#EEF4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsShortcutContent: {
    flex: 1,
  },
  callButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 4,
  },
  sosButton: {
    backgroundColor: '#FF9500',
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#FF9500',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 4,
  },
  emergencyLeft: {
    flex: 1,
  },
  callLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFE2E0',
    marginBottom: 4,
  },
  callText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  sosLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFE7CC',
    marginBottom: 4,
  },
  sosText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
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
    fontSize: 21,
    fontWeight: '800',
    color: '#111827',
  },
  modalSubTitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  closeButton: {
    backgroundColor: '#EEF4FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2563EB',
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
    fontSize: 14,
    fontWeight: '700',
    color: '#2563EB',
  },
  letterItemContent: {
    fontSize: 16,
    color: '#111827',
    lineHeight: 24,
  },
  letterItemTime: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyBox: {
    paddingTop: 50,
    alignItems: 'center',
  },
  emptyLetterText: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
  },
});

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
    return { backgroundColor: '#16A34A' };
  }
  if (status === 'missed') {
    return { backgroundColor: '#DC2626' };
  }
  return { backgroundColor: '#64748B' };
}

function formatScheduleStatus(status: string) {
  if (status === 'scheduled') {
    return '예정';
  }
  if (status === 'completed') {
    return '완료';
  }
  return status;
}

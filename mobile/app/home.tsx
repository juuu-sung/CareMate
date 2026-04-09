import React, { useEffect, useRef, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { fetchLettersForElder } from '../lib/letter';
import { fetchGuardianContact } from '../lib/guardian';

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
  const linkCode = String(
    params.linkCode || params.link_code || params.code || ''
  );

  const [isRecording, setIsRecording] = useState(false);
  const [latestLetter, setLatestLetter] = useState<LetterItem | null>(null);
  const [letters, setLetters] = useState<LetterItem[]>([]);
  const [loadingLetter, setLoadingLetter] = useState(true);
  const [isLetterModalVisible, setIsLetterModalVisible] = useState(false);

  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianName, setGuardianName] = useState('');

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleMicPress = () => {
    setIsRecording((prev) => !prev);
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

  const handleCall119 = async () => {
    try {
      const url = 'tel:119';
      const supported = await Linking.canOpenURL(url);

      if (!supported) {
        Alert.alert('오류', '이 기기에서는 전화 연결을 사용할 수 없습니다.');
        return;
      }

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

      await Linking.openURL(url);
    } catch (error) {
      console.log('보호자 전화 연결 오류:', error);
      Alert.alert('오류', '보호자 전화 연결 중 문제가 발생했습니다.');
    }
  };

  const loadLetters = async (showLoading: boolean = false) => {
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

  const loadGuardianContact = async () => {
    try {
      if (!linkCode) return;

      const data = await fetchGuardianContact(linkCode);

      if (data?.guardian_phone) {
        setGuardianPhone(data.guardian_phone);
      }

      if (data?.guardian_name) {
        setGuardianName(data.guardian_name);
      }
    } catch (error: any) {
      console.log('보호자 연락처 조회 오류:', error?.message);
    }
  };

  useEffect(() => {
    loadLetters(true);
  }, [elderUserId, linkCode]);

  useEffect(() => {
    if (linkCode) {
      loadGuardianContact();
    }
  }, [linkCode]);

  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    if (elderUserId && linkCode) {
      pollingRef.current = setInterval(() => {
        loadLetters(false);
      }, 100000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [elderUserId, linkCode]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FB" />

      <View style={styles.container}>
        <View style={styles.topSection}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>안녕하세요</Text>

            <View style={styles.linkCodeChip}>
              <Text style={styles.linkCodeLabel}>연동코드</Text>
              <Text style={styles.linkCodeValue}>{linkCode || '없음'}</Text>
            </View>
          </View>

          <Text style={styles.subtitle}>무엇을 도와드릴까요?</Text>
        </View>

        <View style={styles.middleSection}>
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

          <View style={styles.micWrap}>
            <TouchableOpacity
              style={[styles.micButton, isRecording && styles.micActive]}
              onPress={handleMicPress}
              activeOpacity={0.9}
            >
              <View style={[styles.micIconWrap, isRecording && styles.micIconWrapActive]}>
                <Ionicons name="mic" size={32} color="#FFFFFF" />
              </View>

              <Text style={styles.micText}>
                {isRecording ? '말씀하세요' : '눌러서 말하기'}
              </Text>
              <Text style={styles.micSubText}>
                {isRecording ? '음성을 듣고 있습니다' : '터치하면 바로 시작됩니다'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.grid}>
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push('/chat')}
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
              onPress={() => router.push('/calendar')}
              activeOpacity={0.88}
            >
              <View style={styles.cardIconWrap}>
                <Ionicons name="calendar-outline" size={24} color="#2563EB" />
              </View>
              <Text style={styles.cardText}>일정 보기</Text>
              <Text style={styles.cardSubText}>오늘 일정을 확인합니다</Text>
            </TouchableOpacity>
          </View>
        </View>

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
                {guardianName
                  ? `${guardianName}님께 연락`
                  : guardianPhone
                  ? guardianPhone
                  : 'SOS 긴급 연락'}
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
    justifyContent: 'space-between',
  },

  topSection: {
    paddingTop: 4,
  },
  middleSection: {
    flex: 1,
    justifyContent: 'space-evenly',
  },
  bottomSection: {
    paddingTop: 8,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
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

  micWrap: {
    alignItems: 'center',
    marginVertical: 6,
  },
  micButton: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 32,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  micActive: {
    backgroundColor: '#1D4ED8',
  },
  micIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  micIconWrapActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  micText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  micSubText: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    fontWeight: '500',
  },

  grid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#EAECEF',
  },
  cardIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
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
    fontWeight: '500',
  },

  callButton: {
    marginTop: 10,
    backgroundColor: '#DC2626',
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  callLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '800',
    marginBottom: 4,
  },
  callText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },

  sosButton: {
    marginTop: 12,
    backgroundColor: '#F59E0B',
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sosLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '800',
    marginBottom: 4,
  },
  sosText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  emergencyLeft: {
    flex: 1,
    paddingRight: 10,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.28)',
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
    width: 52,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
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
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
    backgroundColor: '#FAFAFA',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EEEEEE',
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
    fontWeight: '800',
    color: '#2563EB',
  },
  letterItemContent: {
    fontSize: 16,
    color: '#111827',
    lineHeight: 25,
    fontWeight: '600',
  },
  letterItemTime: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  emptyBox: {
    paddingTop: 50,
    alignItems: 'center',
  },
  emptyLetterText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
});
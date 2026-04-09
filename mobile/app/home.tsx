import React, { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Alert,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetchLettersForElder } from '../lib/letter';

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

  // 보호자 전화번호 파라미터
  const guardianPhone = String(
    params.guardianPhone ||
      params.guardian_phone ||
      params.phone ||
      params.guardianPhoneNumber ||
      ''
  );

  const [isRecording, setIsRecording] = useState(false);
  const [latestLetter, setLatestLetter] = useState<LetterItem | null>(null);
  const [letters, setLetters] = useState<LetterItem[]>([]);
  const [loadingLetter, setLoadingLetter] = useState(true);
  const [isLetterModalVisible, setIsLetterModalVisible] = useState(false);

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
    console.log('부모님 홈 params:', params);
    console.log('elderUserId:', elderUserId);
    console.log('linkCode:', linkCode);
    console.log('guardianPhone:', guardianPhone);

    if (!elderUserId || !linkCode) {
      console.log('편지 조회 중단: elderUserId 또는 linkCode 없음');
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

      console.log('편지 조회 응답:', JSON.stringify(data, null, 2));

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

  useEffect(() => {
    loadLetters(true);

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
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>안녕하세요</Text>
          <Text style={styles.subtitle}>무엇을 도와드릴까요?</Text>
        </View>

        <View style={styles.messageCard}>
          <View style={styles.messageTopRow}>
            <View style={styles.messageLeftArea}>
              <Text style={styles.messageTitle}>보호자 메시지</Text>
              {letters.length > 0 ? (
                <Text style={styles.messageSubInfo}>
                  총 {letters.length}개의 메시지
                </Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={styles.simpleMessageButton}
              onPress={() => setIsLetterModalVisible(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.simpleMessageButtonText}>전체보기</Text>
              <Text style={styles.simpleMessageButtonArrow}>›</Text>
            </TouchableOpacity>
          </View>

          {loadingLetter ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" />
              <Text style={styles.loadingText}>메시지를 불러오는 중입니다</Text>
            </View>
          ) : latestLetter ? (
            <>
              <Text style={styles.messageText}>{latestLetter.content}</Text>
              <Text style={styles.messageTime}>
                {formatToYearMonthDayHour(latestLetter.created_at)}
              </Text>
            </>
          ) : (
            <Text style={styles.messageText}>
              도착한 보호자 메시지가 없습니다.
            </Text>
          )}
        </View>

        <View style={styles.micWrap}>
          <TouchableOpacity
            style={[styles.micButton, isRecording && styles.micActive]}
            onPress={handleMicPress}
          >
            <Text style={styles.micIcon}>🎤</Text>
            <Text style={styles.micText}>
              {isRecording ? '말씀하세요' : '눌러서 말하기'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.grid}>
          <TouchableOpacity style={styles.card} onPress={() => router.push('/chat')}>
            <Text style={styles.cardIcon}>💬</Text>
            <Text style={styles.cardText}>대화 보기</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => router.push('/calendar')}>
            <Text style={styles.cardIcon}>📅</Text>
            <Text style={styles.cardText}>일정 보기</Text>
          </TouchableOpacity>
        </View>

        {/* 119 버튼을 위로 */}
        <TouchableOpacity
          style={styles.callButton}
          onPress={handleCall119}
          activeOpacity={0.85}
        >
          <Text style={styles.callText}>119 전화하기</Text>
        </TouchableOpacity>

        {/* SOS 버튼을 아래로 + 보호자 전화 연결 */}
        <TouchableOpacity
          style={styles.sosButton}
          onPress={handleGuardianEmergencyCall}
          activeOpacity={0.85}
        >
          <Text style={styles.sosText}>SOS 긴급 연락</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={isLetterModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsLetterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
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

            <ScrollView contentContainerStyle={styles.modalScrollContent}>
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
    backgroundColor: '#EEF4FF',
  },
  container: {
    padding: 20,
    paddingBottom: 28,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 20,
    color: '#64748B',
    marginTop: 6,
  },

  messageCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 20,
    marginBottom: 24,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  messageTopRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 8,
    gap: 12,
  },
  messageLeftArea: {
    flex: 2,
    justifyContent: 'center',
  },
  messageTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#334155',
  },
  messageSubInfo: {
    marginTop: 2,
    fontSize: 13,
    color: '#94A3B8',
  },
  simpleMessageButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: '#F4F7FF',
    borderWidth: 1,
    borderColor: '#DCE7FF',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  simpleMessageButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#315EDE',
  },
  simpleMessageButtonArrow: {
    fontSize: 18,
    fontWeight: '800',
    color: '#315EDE',
  },
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  loadingText: {
    marginTop: 6,
    fontSize: 14,
    color: '#64748B',
  },
  messageText: {
    fontSize: 18,
    color: '#0F172A',
    lineHeight: 27,
    marginTop: 2,
  },
  messageTime: {
    marginTop: 8,
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },

  micWrap: {
    alignItems: 'center',
    marginVertical: 20,
  },
  micButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#4F7CFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F7CFF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  micActive: {
    backgroundColor: '#7DA2FF',
  },
  micIcon: {
    fontSize: 60,
  },
  micText: {
    marginTop: 10,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },

  grid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
  },
  cardIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  cardText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },

  // 119 = 위 / 빨간색
  callButton: {
    marginTop: 30,
    backgroundColor: '#FF3B30',
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  callText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },

  // SOS = 아래 / 주황색
  sosButton: {
    marginTop: 12,
    backgroundColor: '#FF9500',
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#FF9500',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
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
    color: '#0F172A',
  },
  modalSubTitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#94A3B8',
  },
  closeButton: {
    backgroundColor: '#EAF1FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#315EDE',
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
    color: '#315EDE',
  },
  letterItemContent: {
    fontSize: 16,
    color: '#0F172A',
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
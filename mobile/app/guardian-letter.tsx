import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { sendLetterFromGuardian } from '@/services/letters';

export default function GuardianLetterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const elderUserId = String(params.elderUserId || params.parentId || '');
  const parentName = String(params.parentName || '부모님');
  const parentAge = String(params.parentAge || '');
  const parentGender = String(params.parentGender || '');
  const linkCode = String(params.linkCode || '');

  const medications = String(params.medications || '');
  const diseases = String(params.diseases || '');
  const hospital = String(params.hospital || '');
  const doctorContact = String(params.doctorContact || '');
  const memo = String(params.memo || '');
  const allergies = String(params.allergies || '');

  const [letter, setLetter] = useState('');
  const [loading, setLoading] = useState(false);

  const trimmedLetter = useMemo(() => letter.trim(), [letter]);
  const maxLength = 200;

  const handleSend = async () => {
    if (!trimmedLetter) {
      Alert.alert('알림', '편지 내용을 입력해주세요.');
      return;
    }

    if (!elderUserId || !linkCode) {
      Alert.alert('오류', '연동 정보가 없습니다.');
      return;
    }

    try {
      setLoading(true);

      await sendLetterFromGuardian({
        elderUserId,
        linkCode,
        content: trimmedLetter,
      });

      Alert.alert('전송 완료', `${parentName} 님에게 편지를 보냈습니다.`, [
        {
          text: '확인',
          onPress: () => {
            router.replace({
              pathname: '/guardian-home',
              params: {
                parentId: elderUserId,
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
          },
        },
      ]);
    } catch (error: any) {
      Alert.alert('전송 실패', error.message || '편지 전송에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>💌 사랑의 편지</Text>
            </View>

            <Text style={styles.title}>{parentName} 님께 편지 쓰기</Text>
            <Text style={styles.subtitle}>
              따뜻한 한마디가 부모님께 큰 힘이 됩니다.
            </Text>
          </View>

          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>전달 안내</Text>
            <Text style={styles.previewText}>
              작성한 편지는 데이터베이스에 저장되고 부모님 홈 화면에 표시됩니다.
            </Text>
            <Text style={styles.previewMeta}>연동 코드: {linkCode || '-'}</Text>
          </View>

          <View style={styles.letterCard}>
            <View style={styles.cardTopRow}>
              <Text style={styles.cardTitle}>편지 내용</Text>
              <Text style={styles.countText}>
                {letter.length}/{maxLength}
              </Text>
            </View>

            <TextInput
              style={styles.input}
              placeholder="부모님께 편지 한통 써보세요"
              placeholderTextColor="#9CA3AF"
              multiline
              maxLength={maxLength}
              value={letter}
              onChangeText={setLetter}
              textAlignVertical="top"
            />

            <View style={styles.tipBox}>
              <Text style={styles.tipText}>
                예시: 엄마, 오늘도 건강하게 좋은 하루 보내세요.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, (!trimmedLetter || loading) && styles.buttonDisabled]}
            onPress={handleSend}
            activeOpacity={0.85}
            disabled={!trimmedLetter || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>전송하기</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#EEF4FF' },
  container: { padding: 20, paddingBottom: 36 },
  header: { marginBottom: 20 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DCE8FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: 14,
  },
  badgeText: { fontSize: 14, fontWeight: '700', color: '#315EDE' },
  title: { fontSize: 28, fontWeight: '800', color: '#0F172A' },
  subtitle: { marginTop: 8, fontSize: 16, lineHeight: 24, color: '#64748B' },
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#DCE8FF',
  },
  previewLabel: { fontSize: 14, fontWeight: '700', color: '#4F7CFF', marginBottom: 6 },
  previewText: { fontSize: 15, lineHeight: 22, color: '#334155' },
  previewMeta: { marginTop: 10, fontSize: 13, color: '#64748B', fontWeight: '600' },
  letterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#DCE8FF',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  countText: { fontSize: 13, fontWeight: '700', color: '#94A3B8' },
  input: {
    minHeight: 240,
    borderRadius: 18,
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 17,
    lineHeight: 26,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5EDFF',
  },
  tipBox: {
    marginTop: 14,
    backgroundColor: '#F8FAFF',
    borderRadius: 16,
    padding: 14,
  },
  tipText: { fontSize: 14, lineHeight: 21, color: '#64748B' },
  button: {
    marginTop: 22,
    backgroundColor: '#4F7CFF',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#AFC4FF',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
});

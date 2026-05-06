import React, { useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';

import {
  buildGuardianAuthSession,
  saveAuthSession,
} from '@/services/authSession';
import { guardianLogin } from '@/services/guardian';

export default function GuardianLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [birth, setBirth] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!phone.trim() || !birth.trim()) {
      Alert.alert('입력 확인', '전화번호와 생년월일을 입력해주세요.');
      return;
    }

    try {
      setLoading(true);

      const result = await guardianLogin({
        phone: phone.trim(),
        birth: birth.trim(),
      });

      try {
        await saveAuthSession(
          buildGuardianAuthSession({
            guardianId: result.guardian_id,
            parentId: result.parent_id,
            parentName: result.parent_name,
            parentAge: String(result.parent_age ?? ''),
            parentGender: result.parent_gender ?? '',
            linkCode: result.link_code,
            medications: result.medications,
            diseases: result.diseases,
            allergies: result.allergies,
            hospital: result.hospital,
            doctorContact: result.doctor_contact,
            memo: result.memo,
          })
        );
      } catch (sessionError) {
        console.log('보호자 로그인 세션 저장 오류:', sessionError);
      }

      router.replace({
        pathname: '/guardian-home',
        params: {
          guardianId: result.guardian_id,
          parentId: result.parent_id,
          parentName: result.parent_name,
          parentAge: String(result.parent_age ?? ''),
          parentGender: result.parent_gender ?? '',
          linkCode: result.link_code,
          medications: result.medications,
          diseases: result.diseases,
          allergies: result.allergies,
          hospital: result.hospital,
          doctorContact: result.doctor_contact,
          memo: result.memo,
        },
      });
    } catch (error: any) {
      Alert.alert('로그인 실패', error.message || '보호자 로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>보호자 로그인</Text>
        <Text style={styles.description}>
          가입할 때 입력한 전화번호와 생년월일로 로그인합니다.
        </Text>

        <Text style={styles.label}>전화번호</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="예: 010-9876-5432"
          placeholderTextColor="#94A3B8"
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>생년월일</Text>
        <TextInput
          style={styles.input}
          value={birth}
          onChangeText={setBirth}
          placeholder="예: 1978. 09. 21."
          placeholderTextColor="#94A3B8"
        />

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.disabledButton]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>로그인</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>이전으로</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0FFF4',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 14,
  },
  description: {
    fontSize: 17,
    lineHeight: 26,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 28,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    height: 58,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#0F172A',
  },
  primaryButton: {
    marginTop: 24,
    height: 58,
    borderRadius: 16,
    backgroundColor: '#05D34E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '600',
  },
});

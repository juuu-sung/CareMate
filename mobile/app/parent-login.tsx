import React, { useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';

import {
  buildParentAuthSession,
  saveAuthSession,
} from '@/services/authSession';
import {
  PhoneNumberInput,
  isValidKoreanPhoneNumber,
} from '@/components/common/PhoneNumberInput';
import {
  BirthDateInput,
  isValidBirthDate,
} from '@/components/common/ProfileFormInputs';
import { parentLogin } from '@/services/parents';

export default function ParentLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [birth, setBirth] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!phone.trim() || !birth.trim()) {
      Alert.alert('입력 확인', '전화번호와 생년월일을 입력해주세요.');
      return;
    }

    if (!isValidBirthDate(birth)) {
      Alert.alert('입력 확인', '생년월일을 올바르게 입력해주세요.');
      return;
    }

    if (!isValidKoreanPhoneNumber(phone)) {
      Alert.alert('입력 확인', '전화번호를 올바르게 입력해주세요.');
      return;
    }

    try {
      setLoading(true);

      const result = await parentLogin({
        phone: phone.trim(),
        birth: birth.trim(),
      });

      try {
        await saveAuthSession(
          buildParentAuthSession({
            parentId: result.parent_id,
            elderUserId: result.parent_id,
            parentName: result.parent_name,
            accessToken: result.access_token,
            linkCode: result.link_code,
            guardianPhone: result.guardian_phone,
          })
        );
      } catch (sessionError) {
        console.log('부모님 로그인 세션 저장 오류:', sessionError);
      }

      router.replace({
        pathname: '/home',
        params: {
          parentId: result.parent_id,
          elderUserId: result.parent_id,
          parentName: result.parent_name,
          linkCode: result.link_code,
          guardianPhone: result.guardian_phone,
        },
      });
    } catch (error: any) {
      Alert.alert('로그인 실패', error.message || '부모님 로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>부모님 로그인</Text>
        <Text style={styles.description}>
          가입할 때 입력한 전화번호와 생년월일로 로그인합니다.
        </Text>

        <PhoneNumberInput
          value={phone}
          onChangeText={setPhone}
          accentColor="#2563EB"
          disabled={loading}
        />

        <BirthDateInput
          value={birth}
          onChangeText={setBirth}
          accentColor="#2563EB"
          disabled={loading}
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
    backgroundColor: '#EEF4FF',
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
    backgroundColor: '#3B82F6',
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

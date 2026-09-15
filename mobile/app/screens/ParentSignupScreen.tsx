import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  PhoneNumberInput,
  isValidKoreanPhoneNumber,
} from '@/components/common/PhoneNumberInput';
import {
  AddressInput,
  BirthDateInput,
  GenderSelect,
  NameInput,
  isUsableAddress,
  isValidBirthDate,
  isValidPersonName,
} from '@/components/common/ProfileFormInputs';
import { parentSignup } from '@/services/parents';
import {
  buildParentAuthSession,
  saveAuthSession,
} from '@/services/authSession';

const ORANGE = '#F97316';
const ORANGE_DARK = '#EA580C';
const BG = '#FFFFFF';
const TEXT = '#111827';

export default function ParentSignupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (
      !name.trim() ||
      !birth.trim() ||
      !gender ||
      !address.trim() ||
      !phone.trim() ||
      !password ||
      !passwordConfirm
    ) {
      Alert.alert('입력 확인', '모든 항목을 입력해주세요.');
      return;
    }

    if (!isValidPersonName(name)) {
      Alert.alert('입력 확인', '성명을 올바르게 입력해주세요.');
      return;
    }

    if (!isValidBirthDate(birth)) {
      Alert.alert('입력 확인', '생년월일을 올바르게 입력해주세요.');
      return;
    }

    if (!isUsableAddress(address)) {
      Alert.alert('입력 확인', '주소를 조금 더 자세히 입력해주세요.');
      return;
    }

    if (!isValidKoreanPhoneNumber(phone)) {
      Alert.alert('입력 확인', '전화번호를 올바르게 입력해주세요.');
      return;
    }

    if (password.length < 8) {
      Alert.alert('입력 확인', '비밀번호는 8자 이상 입력해주세요.');
      return;
    }

    if (password !== passwordConfirm) {
      Alert.alert('입력 확인', '비밀번호가 서로 일치하지 않습니다.');
      return;
    }

    if (!agreed) {
      Alert.alert('동의 필요', '개인정보 수집 및 이용에 동의해주세요.');
      return;
    }

    try {
      setLoading(true);

      const result = await parentSignup({
        name: name.trim(),
        birth: birth.trim(),
        gender,
        address: address.trim(),
        phone: phone.trim(),
        password,
      });

      await saveAuthSession(
        buildParentAuthSession({
          parentId: result.parent_id,
          elderUserId: result.parent_id,
          parentName: result.parent_name,
          accessToken: result.access_token,
          expiresAt: result.expires_at,
          linkCode: result.link_code,
        })
      );

      router.push({
        pathname: '/parent-complete',
        params: {
          parentId: result.parent_id,
          parentName: result.parent_name,
          linkCode: result.link_code,
        },
      });
    } catch (error: any) {
      Alert.alert('가입 실패', error.message || '부모님 회원가입에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>부모님 가입</Text>

        <NameInput
          value={name}
          onChangeText={setName}
          required
          accentColor={ORANGE_DARK}
          disabled={loading}
        />

        <BirthDateInput
          value={birth}
          onChangeText={setBirth}
          required
          accentColor={ORANGE_DARK}
          disabled={loading}
        />

        <GenderSelect
          value={gender}
          onChange={setGender}
          required
          accentColor={ORANGE_DARK}
          disabled={loading}
        />

        <AddressInput
          value={address}
          onChangeText={setAddress}
          required
          accentColor={ORANGE_DARK}
          disabled={loading}
        />

        <PhoneNumberInput
          label="전화번호"
          value={phone}
          onChangeText={setPhone}
          required
          accentColor={ORANGE_DARK}
          disabled={loading}
        />

        <Text style={styles.label}>비밀번호 *</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="8자 이상 입력"
          placeholderTextColor="#94A3B8"
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={128}
          editable={!loading}
        />

        <Text style={styles.label}>비밀번호 확인 *</Text>
        <TextInput
          style={styles.input}
          value={passwordConfirm}
          onChangeText={setPasswordConfirm}
          placeholder="비밀번호 다시 입력"
          placeholderTextColor="#94A3B8"
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={128}
          editable={!loading}
        />

        <TouchableOpacity
          style={styles.agreeBox}
          onPress={() => setAgreed((prev) => !prev)}
          activeOpacity={0.8}
        >
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.agreeText}>개인정보 수집 및 이용에 동의합니다.</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.submitButton, loading && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>가입하기</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>이전으로</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    backgroundColor: BG,
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '900',
    color: TEXT,
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    height: 60,
    backgroundColor: '#E9E9EC',
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  genderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  genderButton: {
    width: '48%',
    height: 60,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7F7F7',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  selectedButton: {
    backgroundColor: '#E8F1FF',
    borderColor: '#3B82F6',
  },
  genderText: {
    fontSize: 16,
  },
  selectedText: {
    color: '#2563EB',
    fontWeight: '700',
  },
  agreeBox: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 1,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: '#94A3B8',
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  checkmark: {
    color: '#fff',
    fontWeight: '800',
  },
  agreeText: {
    flex: 1,
    fontSize: 15,
    color: '#334155',
  },
  submitButton: {
    marginTop: 24,
    height: 60,
    backgroundColor: ORANGE_DARK,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    shadowColor: ORANGE_DARK,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 5,
  },
  submitText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  backButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  backText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
});

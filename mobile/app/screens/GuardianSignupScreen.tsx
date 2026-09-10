import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  View,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  PhoneNumberInput,
  isValidKoreanPhoneNumber,
} from '@/components/common/PhoneNumberInput';
import {
  BirthDateInput,
  GenderSelect,
  NameInput,
  isValidBirthDate,
  isValidPersonName,
} from '@/components/common/ProfileFormInputs';
import { guardianSignup } from '@/services/guardian';
import { buildGuardianAuthSession, saveAuthSession } from '@/services/authSession';

const relationOptions = ['아들', '딸', '며느리', '사위', '손주', '기타'];
const ORANGE = '#F97316';
const ORANGE_DARK = '#EA580C';
const ORANGE_SOFT = '#FFEDD5';
const CARD_BORDER = '#FED7AA';
const BG = '#FFFFFF';
const TEXT = '#111827';

export default function GuardianSignupScreen() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [relation, setRelation] = useState('');
  const [linkCode, setLinkCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (
      !name.trim() ||
      !birth.trim() ||
      !gender ||
      !phone.trim() ||
      !password ||
      !passwordConfirm ||
      !relation ||
      !linkCode.trim()
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

    const normalizedCode = linkCode.trim().toUpperCase();

    try {
      setLoading(true);

      const signupResult = await guardianSignup({
        name: name.trim(),
        birth: birth.trim(),
        phone: phone.trim(),
        password,
        gender,
        relation,
        link_code: normalizedCode,
      });

      await saveAuthSession(
        buildGuardianAuthSession({
          guardianId: signupResult.guardian_id,
          parentId: signupResult.parent_id,
          parentName: signupResult.parent_name,
          parentAge: String(signupResult.parent_age ?? ''),
          parentGender: signupResult.parent_gender ?? '',
          linkId: signupResult.link_id,
          accessToken: signupResult.access_token,
        })
      );

      router.push({
        pathname: '/guardian-parent-info',
        params: {
          guardianName: name.trim(),
          guardianBirth: birth.trim(),
          guardianPhone: phone.trim(),
          guardianRelation: relation,
          guardianId: signupResult.guardian_id,
          linkCode: signupResult.link_id,
          parentId: signupResult.parent_id,
          parentName: signupResult.parent_name,
          parentAge: String(signupResult.parent_age ?? ''),
          parentGender: signupResult.parent_gender ?? '',
        },
      });
    } catch (error: any) {
      Alert.alert('연동 실패', error.message || '연동 코드 확인 또는 보호자 가입에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>보호자 가입</Text>

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
          placeholderTextColor="#A0A0A0"
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
          placeholderTextColor="#A0A0A0"
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={128}
          editable={!loading}
        />

        <Text style={styles.label}>부모님과의 관계 *</Text>
        <View style={styles.relationGrid}>
          {relationOptions.map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.relationButton, relation === item && styles.selectedButton]}
              onPress={() => setRelation(item)}
              activeOpacity={0.85}
              disabled={loading}
            >
              <Text
                style={[styles.relationText, relation === item && styles.selectedText]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>부모님 연동 코드 *</Text>
        <View style={styles.linkInputWrap}>
          <TextInput
            style={styles.linkInput}
            value={linkCode}
            onChangeText={setLinkCode}
            placeholder="예: PC0Y7EH2"
            placeholderTextColor="#A0A0A0"
            autoCapitalize="characters"
            maxLength={8}
          />
          <Ionicons name="link-outline" size={23} color={ORANGE_DARK} />
        </View>

        <Text style={styles.helperText}>
          부모님 가입 완료 화면에 표시된 8자리 일회용 연동 코드를 입력해주세요.
        </Text>

        <TouchableOpacity
          style={[styles.submitButton, loading && { opacity: 0.7 }]}
          onPress={handleSubmit}
          activeOpacity={0.85}
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
    paddingBottom: 36,
    backgroundColor: BG,
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '900',
    color: TEXT,
    marginBottom: 14,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    height: 60,
    backgroundColor: '#E9E9EC',
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#111827',
  },
  relationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  relationButton: {
    width: '31%',
    height: 70,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: CARD_BORDER,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  relationText: {
    fontSize: 16,
    fontWeight: '900',
    color: TEXT,
  },
  selectedButton: {
    backgroundColor: ORANGE_SOFT,
    borderColor: ORANGE_DARK,
  },
  selectedText: {
    color: ORANGE_DARK,
  },
  linkInputWrap: {
    height: 70,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: CARD_BORDER,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  linkInput: {
    flex: 1,
    fontSize: 20,
    color: '#111827',
    textAlign: 'center',
    fontWeight: '500',
  },
  helperText: {
    marginTop: 8,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '700',
  },
  submitButton: {
    marginTop: 24,
    height: 60,
    backgroundColor: ORANGE_DARK,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
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

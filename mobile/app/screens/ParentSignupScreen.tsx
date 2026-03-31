import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';

export default function ParentSignupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);

  const handleSubmit = () => {
    if (!name.trim() || !birth.trim() || !gender || !address.trim() || !phone.trim()) {
      Alert.alert('입력 확인', '모든 항목을 입력해주세요.');
      return;
    }

    if (!agreed) {
      Alert.alert('동의 필요', '개인정보 수집 및 이용에 동의해주세요.');
      return;
    }

    router.push('/parent-complete');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>부모님 가입</Text>

        <Text style={styles.label}>성명</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="이름 입력"
          placeholderTextColor="#A0A0A0"
        />

        <Text style={styles.label}>생년월일 *</Text>
        <TextInput
          style={styles.input}
          value={birth}
          onChangeText={setBirth}
          placeholder="YYYY. MM. DD."
          placeholderTextColor="#A0A0A0"
        />

        <Text style={styles.label}>성별 *</Text>
        <View style={styles.genderRow}>
          <TouchableOpacity
            style={[styles.genderButton, gender === '남성' && styles.selectedButton]}
            onPress={() => setGender('남성')}
          >
            <Text style={[styles.genderText, gender === '남성' && styles.selectedText]}>
              남성
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.genderButton, gender === '여성' && styles.selectedButton]}
            onPress={() => setGender('여성')}
          >
            <Text style={[styles.genderText, gender === '여성' && styles.selectedText]}>
              여성
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>주소 *</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="주소 입력"
          placeholderTextColor="#A0A0A0"
        />

        <Text style={styles.label}>전화번호 *</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="010-0000-0000"
          placeholderTextColor="#A0A0A0"
          keyboardType="phone-pad"
        />

        <TouchableOpacity
          style={styles.agreeBox}
          onPress={() => setAgreed((prev) => !prev)}
          activeOpacity={0.8}
        >
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.agreeText}>
            개인정보 수집 및 이용에 동의합니다.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
          <Text style={styles.submitText}>가입하기</Text>
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
    backgroundColor: '#F1F1F1',
  },
  container: {
    paddingHorizontal: 28,
    paddingTop: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
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
  },
  checkboxChecked: {
    backgroundColor: '#3B82F6',
  },
  checkmark: {
    color: '#fff',
  },
  agreeText: {
    flex: 1,
  },
  submitButton: {
    marginTop: 24,
    height: 60,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
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
});
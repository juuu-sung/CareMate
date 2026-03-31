import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

const relationOptions = ['아들', '딸', '며느리', '사위', '손주', '기타'];

const mockParentMap: Record<
  string,
  { name: string; age: number; gender: string }
> = {
  PC0YEH: { name: '김영희', age: 78, gender: '여성' },
  AB12CD: { name: '이철수', age: 82, gender: '남성' },
  QW9E2R: { name: '박순자', age: 75, gender: '여성' },
};

export default function GuardianSignupScreen() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [linkCode, setLinkCode] = useState('');

  const handleSubmit = () => {
    const normalizedCode = linkCode.trim().toUpperCase() || 'AAAAAA';

    const parentInfo = mockParentMap[normalizedCode] || {
      name: '부모님 성함',
      age: 75,
      gender: '여성',
    };

    router.push({
      pathname: '/guardian-parent-info',
      params: {
        guardianName: name || '홍길동',
        guardianBirth: birth || '1970. 01. 01.',
        guardianPhone: phone || '010-0000-0000',
        guardianRelation: relation || '아들',
        linkCode: normalizedCode,
        parentName: parentInfo.name,
        parentAge: String(parentInfo.age),
        parentGender: parentInfo.gender,
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>보호자 가입</Text>

        <Text style={styles.label}>성명 *</Text>
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

        <Text style={styles.label}>전화번호 *</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="010-0000-0000"
          placeholderTextColor="#A0A0A0"
        />

        <Text style={styles.label}>부모님과의 관계 *</Text>
        <View style={styles.relationGrid}>
          {relationOptions.map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.relationButton, relation === item && styles.selectedButton]}
              onPress={() => setRelation(item)}
              activeOpacity={0.85}
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
            placeholder="연동 코드 입력"
            placeholderTextColor="#A0A0A0"
            autoCapitalize="characters"
            maxLength={6}
          />
          <Text style={styles.linkIcon}>🔗</Text>
        </View>

        <Text style={styles.helperText}>
          지금은 테스트용이라 아무 코드나 입력해도 진행됩니다
        </Text>

        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} activeOpacity={0.85}>
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
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 36,
    backgroundColor: '#F1F1F1',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
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
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    marginBottom: 10,
  },
  relationText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  selectedButton: {
    backgroundColor: '#E8FFEF',
    borderColor: '#05D34E',
  },
  selectedText: {
    color: '#059669',
  },
  linkInputWrap: {
    height: 70,
    backgroundColor: '#E9E9EC',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  linkInput: {
    flex: 1,
    fontSize: 20,
    color: '#111827',
    textAlign: 'center',
    fontWeight: '500',
  },
  linkIcon: {
    fontSize: 22,
    marginLeft: 8,
  },
  helperText: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
  },
  submitButton: {
    marginTop: 24,
    height: 60,
    backgroundColor: '#05D34E',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
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
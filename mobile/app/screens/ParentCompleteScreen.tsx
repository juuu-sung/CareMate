import React from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function ParentCompleteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const linkCode = String(params.linkCode || params.link_code || '');
  const parentId = String(params.parentId || params.elderUserId || params.elder_user_id || '');
  const parentName = String(params.parentName || '부모님');

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.checkCircle}>
            <Text style={styles.checkText}>✓</Text>
          </View>

          <Text style={styles.title}>가입 완료!</Text>
          <Text style={styles.subtitle}>{parentName}님의 연동 코드가 생성되었습니다</Text>

          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>연동 코드</Text>
            <Text style={styles.codeText}>{linkCode || '생성 중'}</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              이 코드를 보호자가 입력하면 서로 연동됩니다
            </Text>
          </View>

          <TouchableOpacity
            style={styles.startButton}
            onPress={() =>
              router.replace({
                pathname: '/parent-agent-voice-setup',
                params: {
                  parentId,
                  elderUserId: parentId,
                  parentName,
                  linkCode,
                },
              })
            }
            activeOpacity={0.85}
          >
            <Text style={styles.startButtonText}>시작하기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFF7ED',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: '#FFF7ED',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 42,
    paddingHorizontal: 24,
    paddingVertical: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  checkCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#05D34E',
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 26,
  },
  checkText: {
    fontSize: 70,
    color: '#fff',
    fontWeight: '800',
  },
  title: {
    textAlign: 'center',
    fontSize: 34,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 18,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 18,
    color: '#475569',
    marginBottom: 28,
  },
  codeBox: {
    backgroundColor: '#FFEDD5',
    borderRadius: 30,
    paddingVertical: 30,
    alignItems: 'center',
    marginBottom: 26,
  },
  codeLabel: {
    fontSize: 18,
    color: '#4B5563',
    marginBottom: 18,
  },
  codeText: {
    fontSize: 54,
    fontWeight: '900',
    color: '#EA580C',
    letterSpacing: 2,
  },
  infoBox: {
    backgroundColor: '#F5F2DE',
    borderWidth: 1.2,
    borderColor: '#E7D35A',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 26,
    marginBottom: 28,
  },
  infoText: {
    fontSize: 17,
    color: '#334155',
    lineHeight: 30,
    fontWeight: '500',
    textAlign: 'center',
  },
  startButton: {
    height: 74,
    backgroundColor: '#F97316',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
});
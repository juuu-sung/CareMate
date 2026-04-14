import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

export default function GuardianLoginPage() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>보호자 로그인</Text>
        <Text style={styles.description}>
          로그인 화면은 아직 연결 전입니다. 현재는 테스트용으로 보호자 홈 가입 흐름으로 이동합니다.
        </Text>

        <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/guardian-signup')}>
          <Text style={styles.primaryButtonText}>보호자 가입 화면으로 이동</Text>
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
  primaryButton: {
    height: 58,
    borderRadius: 16,
    backgroundColor: '#05D34E',
    justifyContent: 'center',
    alignItems: 'center',
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

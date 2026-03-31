import React from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';

const { width, height } = Dimensions.get('window');

export default function SignupSelectScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#E5E7EB" />
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <View style={styles.topIconWrapper}>
            <Text style={styles.topIcon}>♡</Text>
          </View>

          <Text style={styles.title}>CareMate</Text>
          <Text style={styles.subtitle}>가입 유형을 선택해주세요</Text>

          <TouchableOpacity
            style={[styles.cardButton, styles.parentButton]}
            activeOpacity={0.85}
            onPress={() => router.push('/parent-signup')}
          >
            <Text style={styles.cardIcon}>♡</Text>
            <Text style={styles.cardText}>부모님 가입</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.cardButton, styles.guardianButton]}
            activeOpacity={0.85}
            onPress={() => router.push('/guardian-signup')}
          >
            <Text style={styles.cardIcon}>♡</Text>
            <Text style={styles.cardText}>보호자 가입</Text>
          </TouchableOpacity>

          <View style={styles.loginSection}>
            <Text style={styles.loginQuestion}>이미 가입하셨나요?</Text>

            <View style={styles.loginRow}>
              <TouchableOpacity onPress={() => router.push('/parent-login')}>
                <Text style={styles.parentLogin}>부모님 로그인</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.push('/guardian-login')}>
                <Text style={styles.guardianLogin}>보호자 로그인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const CARD_HEIGHT = height * 0.22;
const ICON_SIZE = Math.min(width * 0.32, 140);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#E5E7EB',
  },
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    paddingHorizontal: width * 0.05,
    paddingTop: height * 0.045,
    paddingBottom: height * 0.04,
  },
  topIconWrapper: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: height * 0.03,
  },
  topIcon: {
    color: '#fff',
    fontSize: ICON_SIZE * 0.37,
    fontWeight: '700',
  },
  title: {
    fontSize: Math.min(width * 0.09, 34),
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: Math.min(width * 0.045, 17),
    color: '#6B7280',
    marginBottom: height * 0.04,
  },
  cardButton: {
    width: '100%',
    height: CARD_HEIGHT,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: height * 0.025,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 7,
  },
  parentButton: {
    backgroundColor: '#3B82F6',
  },
  guardianButton: {
    backgroundColor: '#05D34E',
  },
  cardIcon: {
    color: '#fff',
    fontSize: Math.min(width * 0.08, 32),
    marginBottom: 14,
  },
  cardText: {
    color: '#fff',
    fontSize: Math.min(width * 0.07, 28),
    fontWeight: '700',
  },
  loginSection: {
    marginTop: height * 0.01,
    alignItems: 'center',
  },
  loginQuestion: {
    fontSize: Math.min(width * 0.045, 17),
    color: '#6B7280',
    marginBottom: 14,
  },
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    flexWrap: 'wrap',
  },
  parentLogin: {
    fontSize: Math.min(width * 0.048, 18),
    fontWeight: '700',
    color: '#2563EB',
  },
  guardianLogin: {
    fontSize: Math.min(width * 0.048, 18),
    fontWeight: '700',
    color: '#16A34A',
  },
});
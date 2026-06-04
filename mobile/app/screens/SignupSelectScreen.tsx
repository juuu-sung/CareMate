import React from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const ORANGE_DARK = '#EA580C';
const ORANGE_SOFT = '#FFEDD5';
const ORANGE_LIGHT = '#FFF7ED';
const ORANGE_TINT = '#FFE8CC';
const BG = '#FFFFFF';
const TEXT = '#111827';
const MUTED = '#64748B';
const BORDER = '#FED7AA';

export default function SignupSelectScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Ionicons name="heart-outline" size={54} color={ORANGE_DARK} />
          </View>

          <Text style={styles.title}>CareMate</Text>
          <Text style={styles.subtitle}>어떤 사용자로 시작할까요?</Text>
        </View>

        <View style={styles.actionStack}>
          <TouchableOpacity
            style={[styles.roleCard, styles.primaryRoleCard]}
            activeOpacity={0.88}
            onPress={() => router.push('/parent-signup')}
            accessibilityRole="button"
            accessibilityLabel="부모님 가입으로 이동"
          >
            <View style={styles.primaryIconBox}>
              <Ionicons name="person-outline" size={34} color={ORANGE_DARK} />
            </View>

            <View style={styles.roleTextArea}>
              <Text style={styles.primaryRoleTitle}>부모님 가입</Text>
              <Text style={styles.primaryRoleDescription}>
                CareMate와 대화하고 돌봄 알림을 받아요
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={28} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleCard, styles.guardianRoleCard]}
            activeOpacity={0.88}
            onPress={() => router.push('/guardian-signup')}
            accessibilityRole="button"
            accessibilityLabel="보호자 가입으로 이동"
          >
            <View style={styles.guardianIconBox}>
              <Ionicons name="people-outline" size={34} color={ORANGE_DARK} />
            </View>

            <View style={styles.roleTextArea}>
              <Text style={styles.guardianRoleTitle}>보호자 가입</Text>
              <Text style={styles.guardianRoleDescription}>
                부모님의 일정, 복약, 안전 상태를 확인해요
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={28} color={ORANGE_DARK} />
          </TouchableOpacity>
        </View>

        <View style={styles.loginSection}>
          <Text style={styles.loginQuestion}>이미 가입하셨나요?</Text>

          <View style={styles.loginRow}>
            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => router.push('/parent-login')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="부모님 로그인으로 이동"
            >
              <Ionicons name="person-circle-outline" size={22} color={ORANGE_DARK} />
              <Text style={styles.loginText}>부모님 로그인</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.loginButton, styles.guardianLoginButton]}
              onPress={() => router.push('/guardian-login')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="보호자 로그인으로 이동"
            >
              <Ionicons name="shield-checkmark-outline" size={22} color={ORANGE_DARK} />
              <Text style={styles.guardianLoginText}>보호자 로그인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 34,
    backgroundColor: BG,
  },
  header: {
    alignItems: 'center',
    paddingTop: 8,
    marginBottom: 32,
  },
  logoCircle: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: ORANGE_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: ORANGE_DARK,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 6,
    marginBottom: 22,
  },
  title: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '900',
    color: TEXT,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 20,
    lineHeight: 29,
    fontWeight: '800',
    color: MUTED,
  },
  actionStack: {
    gap: 18,
  },
  roleCard: {
    minHeight: 164,
    borderRadius: 30,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  primaryRoleCard: {
    backgroundColor: ORANGE_DARK,
    borderColor: ORANGE_DARK,
    shadowColor: ORANGE_DARK,
    shadowOpacity: 0.2,
    elevation: 7,
  },
  guardianRoleCard: {
    backgroundColor: ORANGE_LIGHT,
    borderColor: BORDER,
    shadowColor: ORANGE_DARK,
    shadowOpacity: 0.12,
  },
  primaryIconBox: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guardianIconBox: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: ORANGE_TINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleTextArea: {
    flex: 1,
  },
  primaryRoleTitle: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  primaryRoleDescription: {
    marginTop: 7,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '800',
    color: '#FFF7ED',
  },
  guardianRoleTitle: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '900',
    color: ORANGE_DARK,
  },
  guardianRoleDescription: {
    marginTop: 7,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '800',
    color: '#9A3412',
  },
  loginSection: {
    marginTop: 32,
    alignItems: 'center',
  },
  loginQuestion: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
    color: MUTED,
    marginBottom: 12,
  },
  loginRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  loginButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: ORANGE_SOFT,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  guardianLoginButton: {
    backgroundColor: ORANGE_LIGHT,
    borderWidth: 1,
    borderColor: BORDER,
  },
  loginText: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
    color: ORANGE_DARK,
  },
  guardianLoginText: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
    color: ORANGE_DARK,
  },
});

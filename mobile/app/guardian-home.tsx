import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function GuardianHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parentName = String(params.parentName || '김영희');
  const parentAge = String(params.parentAge || '78');
  const parentGender = String(params.parentGender || '여성');
  const medications = String(params.medications || '혈압약, 당뇨약');
  const diseases = String(params.diseases || '고혈압, 당뇨');
  const hospital = String(params.hospital || '강남서울내과');
  const doctorContact = String(params.doctorContact || '02-123-4567');
  const memo = String(params.memo || '매일 아침 8시에 약 복용');
  const allergies = String(params.allergies || '없음');

  const quickStats = [
    { label: '오늘 대화', value: '12회', emoji: '💬' },
    { label: '건강 점수', value: '85점', emoji: '💚' },
    { label: '다음 일정', value: '내일 병원', emoji: '📅' },
    { label: '현재 위치', value: '집', emoji: '📍' },
  ];

  const menuItems = [
    { title: '대화 요약', subtitle: '오늘 나눈 대화를 확인해요', emoji: '📝' },
    { title: '건강 상태', subtitle: '건강 기록과 상태를 봐요', emoji: '🩺' },
    { title: '편지 쓰기', subtitle: '부모님께 메시지를 보내요', emoji: '💌' },
    { title: '병원 일정', subtitle: '다가오는 일정을 관리해요', emoji: '🏥' },
    { title: '위치 확인', subtitle: '현재 위치를 확인해요', emoji: '🗺️' },
    { title: '정보 수정', subtitle: '부모님 정보를 수정해요', emoji: '⚙️' },
  ];

  const alerts = [
    { title: '오늘 12회의 대화를 나누셨어요', time: '10분 전' },
    { title: '건강 상태가 전반적으로 안정적이에요', time: '1시간 전' },
    { title: '내일 오후 2시 병원 일정이 있어요', time: '2시간 전' },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.headerTitle}>보호자 홈</Text>
              <Text style={styles.headerSubtitle}>부모님 케어를 시작했어요</Text>
            </View>
            <View style={styles.heartBadge}>
              <Text style={styles.heartText}>💚</Text>
            </View>
          </View>

          <View style={styles.parentSummaryCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.parentName}>{parentName} 님</Text>
              <Text style={styles.parentMeta}>
                {parentAge}세 · {parentGender}
              </Text>

              <View style={styles.statusRow}>
                <View style={styles.liveDot} />
                <Text style={styles.statusText}>마지막 활동 5분 전</Text>
              </View>
            </View>

            <View style={styles.scoreBox}>
              <Text style={styles.scoreValue}>85</Text>
              <Text style={styles.scoreLabel}>건강 점수</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsGrid}>
          {quickStats.map((item) => (
            <View key={item.label} style={styles.statCard}>
              <Text style={styles.statEmoji}>{item.emoji}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
              <Text style={styles.statValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>부모님 기본 정보</Text>
        <View style={styles.infoCard}>
          <InfoRow label="복용 중인 약" value={medications} />
          <Divider />
          <InfoRow label="보유 질환" value={diseases} />
          <Divider />
          <InfoRow label="알레르기" value={allergies} />
          <Divider />
          <InfoRow label="주치의 / 병원" value={hospital} />
          <Divider />
          <InfoRow label="비상 연락처" value={doctorContact} />
          <Divider />
          <InfoRow label="추가 메모" value={memo} multiline />
        </View>

        <Text style={styles.sectionTitle}>주요 기능</Text>
        <View style={styles.menuGrid}>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.title}
              style={styles.menuCard}
              activeOpacity={0.85}
              onPress={() => {}}
            >
              <Text style={styles.menuEmoji}>{item.emoji}</Text>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>최근 알림</Text>
        <View style={styles.alertsCard}>
          {alerts.map((item, index) => (
            <View key={index}>
              <View style={styles.alertRow}>
                <View style={styles.alertIconWrap}>
                  <Text style={styles.alertIcon}>🔔</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertTitle}>{item.title}</Text>
                  <Text style={styles.alertTime}>{item.time}</Text>
                </View>
              </View>
              {index !== alerts.length - 1 && <Divider />}
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.editButton}
          activeOpacity={0.85}
          onPress={() => router.push('/guardian-signup')}
        >
          <Text style={styles.editButtonText}>다른 부모님 정보로 다시 테스트하기</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={[styles.infoRow, multiline && { alignItems: 'flex-start' }]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, multiline && { flex: 1, textAlign: 'right' }]}>
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F1F1F1',
  },
  container: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: '#F1F1F1',
  },
  headerCard: {
    backgroundColor: '#05D34E',
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#E8FFF0',
  },
  heartBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heartText: {
    fontSize: 24,
  },
  parentSummaryCard: {
    marginTop: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  parentName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  parentMeta: {
    marginTop: 4,
    fontSize: 15,
    color: '#6B7280',
  },
  statusRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
  },
  scoreBox: {
    width: 90,
    alignItems: 'center',
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#05B547',
  },
  scoreLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statEmoji: {
    fontSize: 24,
    marginBottom: 10,
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  statValue: {
    marginTop: 6,
    fontSize: 20,
    color: '#111827',
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
    marginTop: 6,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  infoRow: {
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '700',
    width: '38%',
  },
  infoValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '700',
    width: '58%',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  menuCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 128,
  },
  menuEmoji: {
    fontSize: 28,
    marginBottom: 10,
  },
  menuTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  menuSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: '#6B7280',
    fontWeight: '500',
  },
  alertsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
  },
  alertIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EEFDF3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  alertIcon: {
    fontSize: 16,
  },
  alertTitle: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '700',
    lineHeight: 21,
  },
  alertTime: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },
  editButton: {
    marginTop: 20,
    height: 56,
    backgroundColor: '#111827',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
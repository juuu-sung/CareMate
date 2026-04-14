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
import {
  Ionicons,
  MaterialCommunityIcons,
  Feather,
  FontAwesome6,
} from '@expo/vector-icons';

type StatItem = {
  label: string;
  value: string;
  iconType: 'Ionicons' | 'MaterialCommunityIcons' | 'Feather' | 'FontAwesome6';
  iconName: string;
};

type MenuItem = {
  title: string;
  subtitle: string;
  iconType: 'Ionicons' | 'MaterialCommunityIcons' | 'Feather' | 'FontAwesome6';
  iconName: string;
};

type AlertItem = {
  title: string;
  time: string;
};

export default function GuardianHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parentId = String(params.parentId || params.elderUserId || '');
  const parentName = String(params.parentName || '김영희');
  const parentAge = String(params.parentAge || '78');
  const parentGender = String(params.parentGender || '여성');
  const linkCode = String(params.linkCode || '');

  const medications = String(params.medications || '');
  const diseases = String(params.diseases || '');
  const hospital = String(params.hospital || '');
  const doctorContact = String(params.doctorContact || '');
  const memo = String(params.memo || '');
  const allergies = String(params.allergies || '');

  const quickStats: StatItem[] = [
    {
      label: '오늘 대화',
      value: '12회',
      iconType: 'Ionicons',
      iconName: 'chatbubble-ellipses-outline',
    },
    {
      label: '건강 점수',
      value: '85점',
      iconType: 'MaterialCommunityIcons',
      iconName: 'heart-pulse',
    },
    {
      label: '다음 일정',
      value: '내일 병원',
      iconType: 'Ionicons',
      iconName: 'calendar-outline',
    },
    {
      label: '현재 위치',
      value: '확인 가능',
      iconType: 'Ionicons',
      iconName: 'location-outline',
    },
  ];

  const menuItems: MenuItem[] = [
    {
      title: '대화 요약',
      subtitle: '오늘 나눈 대화를 확인해요',
      iconType: 'Ionicons',
      iconName: 'document-text-outline',
    },
    {
      title: '건강 상태',
      subtitle: '건강 기록과 상태를 봐요',
      iconType: 'MaterialCommunityIcons',
      iconName: 'stethoscope',
    },
    {
      title: '편지 쓰기',
      subtitle: '부모님께 메시지를 보내요',
      iconType: 'Ionicons',
      iconName: 'mail-outline',
    },
    {
      title: '병원 일정',
      subtitle: '다가오는 일정을 관리해요',
      iconType: 'Ionicons',
      iconName: 'medical-outline',
    },
    {
      title: '위치 확인',
      subtitle: '현재 위치를 확인해요',
      iconType: 'Feather',
      iconName: 'map-pin',
    },
    {
      title: '정보 수정',
      subtitle: '부모님 정보를 수정해요',
      iconType: 'Ionicons',
      iconName: 'settings-outline',
    },
  ];

  const alerts: AlertItem[] = [
    { title: '오늘 12회의 대화를 나누셨어요', time: '10분 전' },
    { title: '건강 상태가 전반적으로 안정적이에요', time: '1시간 전' },
    { title: '내일 오후 2시 병원 일정이 있어요', time: '2시간 전' },
  ];

  const handleMenuPress = (title: string) => {
    if (title === '위치 확인') {
      router.push({
        pathname: '/guardian-location',
        params: {
          parentId,
          parentName,
          linkCode,
        },
      });
      return;
    }

    if (title === '편지 쓰기') {
      router.push({
        pathname: '/guardian-letter',
        params: {
          parentId,
          elderUserId: parentId,
          parentName,
          parentAge,
          parentGender,
          linkCode,
          medications,
          diseases,
          allergies,
          hospital,
          doctorContact,
          memo,
        },
      });
      return;
    }

    if (title === '정보 수정') {
      router.push({
        pathname: '/guardian-parent-info',
        params: {
          parentId,
          parentName,
          parentAge,
          parentGender,
          linkCode,
          medications,
          diseases,
          allergies,
          hospital,
          doctorContact,
          memo,
        },
      });
      return;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.headerSubtitle}>부모님 케어를 시작했어요</Text>
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
              <MaterialCommunityIcons name="heart-pulse" size={20} color="#05B547" />
              <Text style={styles.scoreValue}>85</Text>
              <Text style={styles.scoreLabel}>건강 점수</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsGrid}>
          {quickStats.map((item) => (
            <View key={item.label} style={styles.statCard}>
              <View style={styles.statIconWrap}>
                <AppIcon
                  type={item.iconType}
                  name={item.iconName}
                  size={22}
                  color="#05B547"
                />
              </View>
              <Text style={styles.statLabel}>{item.label}</Text>
              <Text style={styles.statValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>부모님 기본 정보</Text>
        <View style={styles.infoCard}>
          <InfoRow
            icon={<Feather name="link" size={16} color="#05B547" />}
            label="연동 코드"
            value={linkCode || '-'}
          />
          <Divider />
          <InfoRow
            icon={<MaterialCommunityIcons name="pill" size={16} color="#05B547" />}
            label="복용 중인 약"
            value={medications || '-'}
            multiline
          />
          <Divider />
          <InfoRow
            icon={<FontAwesome6 name="virus" size={14} color="#05B547" />}
            label="보유 질환"
            value={diseases || '-'}
            multiline
          />
          <Divider />
          <InfoRow
            icon={<MaterialCommunityIcons name="alert-circle-outline" size={16} color="#05B547" />}
            label="알레르기"
            value={allergies || '-'}
            multiline
          />
          <Divider />
          <InfoRow
            icon={<Ionicons name="medical-outline" size={16} color="#05B547" />}
            label="주치의 / 병원"
            value={hospital || '-'}
            multiline
          />
          <Divider />
          <InfoRow
            icon={<Ionicons name="call-outline" size={16} color="#05B547" />}
            label="비상 연락처"
            value={doctorContact || '-'}
          />
          <Divider />
          <InfoRow
            icon={<Feather name="edit-3" size={16} color="#05B547" />}
            label="추가 메모"
            value={memo || '-'}
            multiline
          />
        </View>

        <Text style={styles.sectionTitle}>주요 기능</Text>
        <View style={styles.menuGrid}>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.title}
              style={styles.menuCard}
              activeOpacity={0.85}
              onPress={() => handleMenuPress(item.title)}
            >
              <View style={styles.menuIconWrap}>
                <AppIcon
                  type={item.iconType}
                  name={item.iconName}
                  size={24}
                  color="#05B547"
                />
              </View>
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
                  <Ionicons name="notifications-outline" size={18} color="#05B547" />
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
      </ScrollView>
    </SafeAreaView>
  );
}

function AppIcon({
  type,
  name,
  size,
  color,
}: {
  type: 'Ionicons' | 'MaterialCommunityIcons' | 'Feather' | 'FontAwesome6';
  name: string;
  size: number;
  color: string;
}) {
  if (type === 'Ionicons') {
    return <Ionicons name={name as any} size={size} color={color} />;
  }
  if (type === 'MaterialCommunityIcons') {
    return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
  }
  if (type === 'Feather') {
    return <Feather name={name as any} size={size} color={color} />;
  }
  return <FontAwesome6 name={name as any} size={size} color={color} />;
}

function InfoRow({
  icon,
  label,
  value,
  multiline = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={[styles.infoRow, multiline && { alignItems: 'flex-start' }]}>
      <View style={styles.infoLabelWrap}>
        <View style={styles.infoIcon}>{icon}</View>
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
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
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 18,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#E8FFF0',
    fontWeight: '700',
  },
  parentSummaryCard: {
    marginTop: 10,
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
    justifyContent: 'center',
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#05B547',
    marginTop: 4,
  },
  scoreLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
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
  statIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#EEFDF3',
    justifyContent: 'center',
    alignItems: 'center',
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
  infoLabelWrap: {
    width: '42%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIcon: {
    width: 22,
    alignItems: 'center',
    marginRight: 8,
  },
  infoLabel: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '700',
    flexShrink: 1,
  },
  infoValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '700',
    width: '54%',
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
    minHeight: 132,
  },
  menuIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#EEFDF3',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
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
});
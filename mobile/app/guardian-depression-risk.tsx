import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  GuardianConversationDay,
  getGuardianConversations,
} from '@/services/guardian';

type RiskLevel = 'stable' | 'watch' | 'caution' | 'urgent';

type DayRisk = {
  day: GuardianConversationDay;
  score: number;
  highRiskHits: number;
  moodHits: number;
  cognitiveHits: number;
  socialHits: number;
  appetiteHits: number;
  energyHits: number;
  signals: string[];
};

type RiskAnalysis = {
  level: RiskLevel;
  score: number;
  summary: string;
  actionText: string;
  signalStats: Array<{
    key: string;
    label: string;
    value: string;
    description: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    color: string;
  }>;
  dayRisks: DayRisk[];
  attentionDays: number;
};

const HIGH_RISK_PATTERNS = [
  /죽고\s*싶/g,
  /살기\s*싫/g,
  /자살/g,
  /극단/g,
  /사라지고\s*싶/g,
  /끝내고\s*싶/g,
  /희망이\s*없/g,
  /무가치/g,
  /더\s*살고\s*싶지/g,
];

const MOOD_PATTERNS = [
  /우울/g,
  /불안/g,
  /슬프/g,
  /눈물/g,
  /외롭/g,
  /고독/g,
  /걱정/g,
  /허전/g,
  /쓸쓸/g,
  /기분이\s*안/g,
  /마음이\s*힘/g,
];

const COGNITIVE_PATTERNS = [
  /기억이\s*안/g,
  /기억\s*안/g,
  /깜빡/g,
  /헷갈/g,
  /혼동/g,
  /생각이\s*안/g,
  /집중이\s*안/g,
  /집중하기\s*힘/g,
  /말이\s*안\s*나/g,
  /단어가\s*안/g,
  /길을\s*잃/g,
  /오늘이\s*며칠/g,
  /날짜가\s*헷갈/g,
];

const SOCIAL_PATTERNS = [
  /혼자/g,
  /아무도/g,
  /찾아오지/g,
  /말할\s*사람/g,
  /연락이\s*없/g,
  /만날\s*사람/g,
];

const APPETITE_PATTERNS = [
  /입맛/g,
  /식욕/g,
  /밥맛/g,
  /밥을\s*못/g,
  /잘\s*못\s*먹/g,
];

const ENERGY_PATTERNS = [
  /무기력/g,
  /의욕/g,
  /기운이\s*없/g,
  /피곤/g,
  /힘들/g,
  /아무것도\s*하기\s*싫/g,
];

const RISK_META: Record<
  RiskLevel,
  {
    label: string;
    tone: string;
    background: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
  }
> = {
  stable: {
    label: '낮음',
    tone: '#047857',
    background: '#ECFDF3',
    icon: 'shield-check-outline',
  },
  watch: {
    label: '관찰 필요',
    tone: '#D97706',
    background: '#FFFBEB',
    icon: 'eye-outline',
  },
  caution: {
    label: '주의 필요',
    tone: '#EA580C',
    background: '#FFF7ED',
    icon: 'alert-outline',
  },
  urgent: {
    label: '높음',
    tone: '#DC2626',
    background: '#FEF2F2',
    icon: 'alert-octagon-outline',
  },
};

function parseConversationDate(value: string) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const parsed = new Date(`${normalized}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getConversationTimestamp(day: GuardianConversationDay) {
  const date = parseConversationDate(day.ended_at || day.started_at || day.date_key);
  return date?.getTime() ?? 0;
}

function formatDateLabel(value: string) {
  const date = parseConversationDate(value);
  if (!date) {
    return '기록 없음';
  }

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDate = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();

  if (sameDate(date, today)) {
    return '오늘';
  }

  if (sameDate(date, yesterday)) {
    return '어제';
  }

  return date.toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function countPatternHits(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => {
    const matches = text.match(pattern);
    return count + (matches?.length ?? 0);
  }, 0);
}

function buildAnalysisText(day: GuardianConversationDay) {
  const parentMessages = day.items
    .filter((item) => item.role === 'user')
    .map((item) => item.content)
    .join('\n');
  const summaryText = [
    day.headline,
    day.summary,
    day.attention_reason,
    day.topics.join(' '),
  ]
    .filter(Boolean)
    .join('\n');

  return `${parentMessages}\n${summaryText}`.toLowerCase();
}

function analyzeDay(day: GuardianConversationDay): DayRisk {
  const text = buildAnalysisText(day);
  const highRiskHits = countPatternHits(text, HIGH_RISK_PATTERNS);
  const moodHits = countPatternHits(text, MOOD_PATTERNS);
  const cognitiveHits = countPatternHits(text, COGNITIVE_PATTERNS);
  const socialHits = countPatternHits(text, SOCIAL_PATTERNS);
  const appetiteHits = countPatternHits(text, APPETITE_PATTERNS);
  const energyHits = countPatternHits(text, ENERGY_PATTERNS);
  const attentionScore = day.attention_needed ? 12 : 0;
  const score = Math.min(
    100,
    highRiskHits * 45 +
      moodHits * 9 +
      cognitiveHits * 8 +
      socialHits * 7 +
      appetiteHits * 6 +
      energyHits * 7 +
      attentionScore
  );
  const signals = [
    highRiskHits > 0 ? '위험 표현' : '',
    moodHits > 0 ? '기분 저하' : '',
    cognitiveHits > 0 ? '인지기능' : '',
    socialHits > 0 ? '외로움' : '',
    appetiteHits > 0 ? '식사 변화' : '',
    energyHits > 0 ? '무기력' : '',
  ].filter(Boolean);

  return {
    day,
    score,
    highRiskHits,
    moodHits,
    cognitiveHits,
    socialHits,
    appetiteHits,
    energyHits,
    signals,
  };
}

function buildRiskAnalysis(days: GuardianConversationDay[]): RiskAnalysis {
  const dayRisks = [...days]
    .sort((left, right) => getConversationTimestamp(right) - getConversationTimestamp(left))
    .slice(0, 14)
    .map(analyzeDay);
  const attentionDays = dayRisks.filter((item) => item.day.attention_needed).length;
  const urgentSignals = dayRisks.reduce((count, item) => count + item.highRiskHits, 0);
  const peakScore = dayRisks.reduce((peak, item) => Math.max(peak, item.score), 0);
  const averageScore =
    dayRisks.length > 0
      ? dayRisks.reduce((sum, item) => sum + item.score, 0) / dayRisks.length
      : 0;
  const signalDays = dayRisks.filter((item) => item.signals.length > 0).length;
  const score = Math.min(
    100,
    Math.round(peakScore * 0.55 + averageScore * 0.3 + signalDays * 3 + attentionDays * 4)
  );

  let level: RiskLevel = 'stable';
  if (urgentSignals > 0 || score >= 75) {
    level = 'urgent';
  } else if (score >= 50) {
    level = 'caution';
  } else if (score >= 24) {
    level = 'watch';
  }

  const summaries: Record<RiskLevel, string> = {
    stable: '최근 대화에서 큰 위험 신호는 적게 보입니다.',
    watch: '기분 저하나 생활 변화 신호가 일부 보입니다.',
    caution: '반복되는 우울 신호가 있어 보호자 확인이 필요합니다.',
    urgent: '즉시 확인해야 할 위험 표현이나 강한 우울 신호가 보입니다.',
  };
  const actions: Record<RiskLevel, string> = {
    stable: '평소처럼 안부를 이어가며 변화가 생기는지 살펴보세요.',
    watch: '오늘 안부를 묻고 식사, 기억, 외출 변화를 확인해 보세요.',
    caution: '가족 연락과 병원 또는 상담 기관 연결을 검토해 주세요.',
    urgent: '자해 표현이 있거나 안전이 걱정되면 즉시 직접 확인하고 119 또는 전문기관에 연락하세요.',
  };

  const totals = {
    mood: dayRisks.reduce((sum, item) => sum + item.moodHits, 0),
    cognitive: dayRisks.reduce((sum, item) => sum + item.cognitiveHits, 0),
    social: dayRisks.reduce((sum, item) => sum + item.socialHits, 0),
    appetite: dayRisks.reduce((sum, item) => sum + item.appetiteHits, 0),
    energy: dayRisks.reduce((sum, item) => sum + item.energyHits, 0),
    urgent: urgentSignals,
  };

  return {
    level,
    score,
    summary: summaries[level],
    actionText: actions[level],
    attentionDays,
    dayRisks,
    signalStats: [
      {
        key: 'mood',
        label: '기분 신호',
        value: `${totals.mood}회`,
        description: '우울, 불안, 슬픔 표현',
        icon: 'emoticon-sad-outline',
        color: '#7C3AED',
      },
      {
        key: 'cognitive',
        label: '인지기능',
        value: `${totals.cognitive}회`,
        description: '기억, 혼동, 집중 어려움',
        icon: 'brain',
        color: '#2563EB',
      },
      {
        key: 'social',
        label: '외로움',
        value: `${totals.social}회`,
        description: '혼자 있음, 단절 표현',
        icon: 'account-heart-outline',
        color: '#DB2777',
      },
      {
        key: 'energy',
        label: '활력 변화',
        value: `${totals.energy + totals.appetite}회`,
        description: '무기력, 식사 변화 표현',
        icon: 'battery-low',
        color: '#EA580C',
      },
    ],
  };
}

export default function GuardianDepressionRiskScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parentId = String(params.parentId || params.elderUserId || '');
  const parentName = String(params.parentName || '부모님');
  const linkCode = String(params.linkCode || '');

  const [days, setDays] = React.useState<GuardianConversationDay[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const analysis = React.useMemo(() => buildRiskAnalysis(days), [days]);
  const riskMeta = RISK_META[analysis.level];

  const loadAnalysis = React.useCallback(async (isManualRefresh = false) => {
    if (!parentId || !linkCode) {
      setDays([]);
      setError('연동 정보가 없어 분석 데이터를 불러올 수 없어요.');
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const response = await getGuardianConversations(parentId, linkCode, 60);
      setDays(response.days);
      setError(null);
    } catch (riskError) {
      console.log('보호자 우울증 위험 분석 조회 오류:', riskError);
      setDays([]);
      setError('우울증 위험 분석을 불러오지 못했어요.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [linkCode, parentId]);

  useFocusEffect(
    React.useCallback(() => {
      void loadAnalysis();
      return undefined;
    }, [loadAnalysis])
  );

  const openGuardianChat = React.useCallback(() => {
    router.push({
      pathname: '/chat',
      params: {
        input: 'voice',
        autostart: '1',
        elderUserId: parentId,
        elder_user_id: parentId,
        parentId,
        parentName,
        linkCode,
        link_code: linkCode,
        requesterRole: 'guardian',
      },
    });
  }, [linkCode, parentId, parentName, router]);

  const openConversationSummary = React.useCallback(() => {
    router.push({
      pathname: '/guardian-conversations',
      params: {
        parentId,
        parentName,
        linkCode,
      },
    });
  }, [linkCode, parentId, parentName, router]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.85}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </TouchableOpacity>

        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>우울증 위험 분석</Text>
          <Text style={styles.headerSubtitle}>
            {parentName} 님의 최근 대화 신호를 살펴봅니다
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void loadAnalysis(true);
            }}
            tintColor="#05B547"
          />
        }
      >
        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="small" color="#05B547" />
            <Text style={styles.stateTitle}>분석 데이터를 불러오는 중이에요</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={30}
              color="#EF4444"
            />
            <Text style={styles.stateTitle}>{error}</Text>
            <Text style={styles.stateDescription}>잠시 뒤 다시 시도해 주세요.</Text>
          </View>
        ) : days.length === 0 ? (
          <View style={styles.centerState}>
            <MaterialCommunityIcons
              name="message-text-outline"
              size={30}
              color="#94A3B8"
            />
            <Text style={styles.stateTitle}>아직 분석할 대화가 없어요</Text>
            <Text style={styles.stateDescription}>
              부모님이 CareMate와 대화하면 위험 신호가 여기에 표시됩니다.
            </Text>
          </View>
        ) : (
          <>
            <View
              style={[
                styles.riskCard,
                {
                  backgroundColor: riskMeta.background,
                  borderColor: riskMeta.tone,
                },
              ]}
            >
              <View style={styles.riskHeader}>
                <View style={styles.riskIconWrap}>
                  <MaterialCommunityIcons
                    name={riskMeta.icon}
                    size={28}
                    color={riskMeta.tone}
                  />
                </View>
                <View style={styles.riskTitleWrap}>
                  <Text style={[styles.riskLabel, { color: riskMeta.tone }]}>
                    위험도 {riskMeta.label}
                  </Text>
                  <Text style={styles.riskSummary}>{analysis.summary}</Text>
                </View>
              </View>

              <View style={styles.scoreRow}>
                <Text style={[styles.scoreNumber, { color: riskMeta.tone }]}>
                  {analysis.score}
                </Text>
                <Text style={styles.scoreUnit}>/ 100</Text>
              </View>

              <Text style={styles.actionText}>{analysis.actionText}</Text>
            </View>

            <View style={styles.noticeCard}>
              <MaterialCommunityIcons
                name="information-outline"
                size={20}
                color="#475569"
              />
              <Text style={styles.noticeText}>
                대화 기반 참고 신호이며 의학적 진단이 아닙니다. 위험 표현이 보이면
                직접 확인하고 전문가 도움을 받아야 합니다.
              </Text>
            </View>

            <Text style={styles.sectionTitle}>주요 신호</Text>
            <View style={styles.signalGrid}>
              {analysis.signalStats.map((item) => (
                <View key={item.key} style={styles.signalCard}>
                  <View style={styles.signalHeader}>
                    <View
                      style={[
                        styles.signalIconWrap,
                        { backgroundColor: `${item.color}12` },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={item.icon}
                        size={22}
                        color={item.color}
                      />
                    </View>
                    <Text style={styles.signalValue}>{item.value}</Text>
                  </View>
                  <Text style={styles.signalLabel}>{item.label}</Text>
                  <Text style={styles.signalDescription}>{item.description}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>보호자 확인</Text>
            <View style={styles.actionCard}>
              <TouchableOpacity
                style={styles.primaryButton}
                activeOpacity={0.85}
                onPress={openGuardianChat}
              >
                <Ionicons name="mic-outline" size={20} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>상태 물어보기</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                activeOpacity={0.85}
                onPress={openConversationSummary}
              >
                <Ionicons name="document-text-outline" size={20} color="#0F172A" />
                <Text style={styles.secondaryButtonText}>최근 대화 보기</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>최근 변화</Text>
            {analysis.dayRisks.slice(0, 7).map((item) => {
              const dayMeta =
                item.signals.length > 0 ? item.signals.join(' · ') : '특이 신호 적음';
              const isAttention = item.day.attention_needed || item.score >= 40;

              return (
                <View key={item.day.date_key} style={styles.dayCard}>
                  <View style={styles.dayHeader}>
                    <View style={styles.dayTitleWrap}>
                      <Text style={styles.dayDate}>
                        {formatDateLabel(item.day.date_key)}
                      </Text>
                      <Text style={styles.dayMeta}>{dayMeta}</Text>
                    </View>
                    <View
                      style={[
                        styles.dayScoreBadge,
                        isAttention ? styles.dayScoreBadgeHigh : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayScoreText,
                          isAttention ? styles.dayScoreTextHigh : null,
                        ]}
                      >
                        {item.score}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.dayHeadline}>{item.day.headline}</Text>
                  <Text style={styles.daySummary}>{item.day.summary}</Text>
                  {item.day.attention_reason ? (
                    <Text style={styles.attentionReason}>
                      {item.day.attention_reason}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: '#F1F5F9',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: '#64748B',
  },
  container: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 42,
  },
  stateTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  stateDescription: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: '#64748B',
    textAlign: 'center',
  },
  riskCard: {
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginBottom: 14,
  },
  riskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  riskIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskTitleWrap: {
    flex: 1,
  },
  riskLabel: {
    fontSize: 22,
    fontWeight: '900',
  },
  riskSummary: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 22,
    color: '#334155',
  },
  scoreRow: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  scoreNumber: {
    fontSize: 52,
    fontWeight: '900',
  },
  scoreUnit: {
    marginBottom: 9,
    marginLeft: 6,
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
  },
  actionText: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 23,
    color: '#111827',
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 22,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: '#475569',
  },
  sectionTitle: {
    marginBottom: 12,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  signalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 22,
  },
  signalCard: {
    width: '48%',
    minHeight: 134,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  signalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  signalIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signalValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
  },
  signalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  signalDescription: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: '#64748B',
  },
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 24,
    gap: 10,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#05B547',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  secondaryButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  dayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 14,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  dayTitleWrap: {
    flex: 1,
  },
  dayDate: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },
  dayMeta: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    color: '#64748B',
  },
  dayScoreBadge: {
    minWidth: 46,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ECFDF3',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  dayScoreBadgeHigh: {
    backgroundColor: '#FEF2F2',
  },
  dayScoreText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#047857',
  },
  dayScoreTextHigh: {
    color: '#DC2626',
  },
  dayHeadline: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  daySummary: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 23,
    color: '#334155',
  },
  attentionReason: {
    marginTop: 9,
    fontSize: 14,
    lineHeight: 21,
    color: '#DC2626',
  },
});

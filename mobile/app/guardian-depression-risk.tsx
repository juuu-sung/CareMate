import React from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
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
  DailyHealthItem,
  GuardianConversationDay,
  UtteranceHealthItem,
  getDailyHealthAnalysis,
  getGuardianConversations,
  getHealthExplanation,
  getUtteranceHealthAnalysis,
} from '@/services/guardian';

const SCREEN_WIDTH = Dimensions.get('window').width;

type RiskLevel = 'stable' | 'watch' | 'caution' | 'urgent';
type ExplainMetric = 'depression' | 'insomnia' | 'cognitive';
type Period = 'daily' | 'weekly' | 'monthly';

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
  dayRisks: DayRisk[];
  attentionDays: number;
};

type ChartPoint = { label: string; value: number };

const HIGH_RISK_PATTERNS = [/죽고\s*싶/g, /살기\s*싫/g, /자살/g, /극단/g, /사라지고\s*싶/g, /끝내고\s*싶/g, /희망이\s*없/g, /무가치/g, /더\s*살고\s*싶지/g];
const MOOD_PATTERNS = [/우울/g, /불안/g, /슬프/g, /눈물/g, /외롭/g, /고독/g, /걱정/g, /허전/g, /쓸쓸/g, /기분이\s*안/g, /마음이\s*힘/g];
const COGNITIVE_PATTERNS = [/기억이\s*안/g, /기억\s*안/g, /깜빡/g, /헷갈/g, /혼동/g, /생각이\s*안/g, /집중이\s*안/g, /집중하기\s*힘/g, /말이\s*안\s*나/g, /단어가\s*안/g, /길을\s*잃/g, /오늘이\s*며칠/g, /날짜가\s*헷갈/g];
const SOCIAL_PATTERNS = [/혼자/g, /아무도/g, /찾아오지/g, /말할\s*사람/g, /연락이\s*없/g, /만날\s*사람/g];
const APPETITE_PATTERNS = [/입맛/g, /식욕/g, /밥맛/g, /밥을\s*못/g, /잘\s*못\s*먹/g];
const ENERGY_PATTERNS = [/무기력/g, /의욕/g, /기운이\s*없/g, /피곤/g, /힘들/g, /아무것도\s*하기\s*싫/g];

const RISK_META: Record<RiskLevel, { label: string; tone: string; background: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  stable: { label: '낮음', tone: '#047857', background: '#ECFDF3', icon: 'shield-check-outline' },
  watch: { label: '관찰 필요', tone: '#D97706', background: '#FFFBEB', icon: 'eye-outline' },
  caution: { label: '주의 필요', tone: '#EA580C', background: '#FFF7ED', icon: 'alert-outline' },
  urgent: { label: '높음', tone: '#DC2626', background: '#FEF2F2', icon: 'alert-octagon-outline' },
};

const METRIC_META: Record<ExplainMetric, { title: string; subtitle: string; color: string; rgb: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  depression: { title: '우울 지수', subtitle: '우울·불안·감정 저하 신호', color: '#7C3AED', rgb: '124, 58, 237', icon: 'emoticon-sad-outline' },
  insomnia: { title: '불면 지수', subtitle: '수면 문제·불면 신호', color: '#EA580C', rgb: '234, 88, 12', icon: 'moon-waning-crescent' },
  cognitive: { title: '인지기능 지수', subtitle: '기억력·집중력·언어 능력 저하 신호', color: '#2563EB', rgb: '37, 99, 235', icon: 'brain' },
};

// ── 날짜 유틸 ──────────────────────────────────────────
function parseDate(value: string): Date | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? new Date(`${normalized}T00:00:00`)
    : new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateLabel(value: string) {
  const date = parseDate(value);
  if (!date) return '기록 없음';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (l: Date, r: Date) => l.getFullYear() === r.getFullYear() && l.getMonth() === r.getMonth() && l.getDate() === r.getDate();
  if (same(date, today)) return '오늘';
  if (same(date, yesterday)) return '어제';
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

// ── 차트 데이터 변환 ────────────────────────────────────
type ScoreKey = 'depression_score' | 'insomnia_score' | 'cognitive_score';

const SCORE_KEY: Record<ExplainMetric, ScoreKey> = {
  depression: 'depression_score',
  insomnia: 'insomnia_score',
  cognitive: 'cognitive_score',
};

type CognitiveDualPoint = { label: string; wav: number; text: number };

// 0~1 확률 → 소수점 2자리 퍼센트 (0.003461 → 0.35)
const toPercent = (v: number) => Math.round(v * 10000) / 100;

function _utteranceLabel(item: UtteranceHealthItem) {
  const d = item.recorded_at ? new Date(item.recorded_at) : null;
  return d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '?';
}

// 일간: 챗봇 사용 1건마다 막대 1개, 라벨은 HH:MM (최근 10건)
function prepareUtteranceByConversation(utterances: UtteranceHealthItem[], key: ScoreKey): ChartPoint[] {
  return utterances
    .filter((item) => item[key] !== null)
    .slice(-10)
    .map((item) => ({ label: _utteranceLabel(item), value: toPercent(item[key] as number) }));
}

// 일간 인지기능 이중 선 데이터
function prepareCognitiveDualByConversation(utterances: UtteranceHealthItem[]): CognitiveDualPoint[] {
  return utterances
    .filter((item) => item.cognitive_score !== null || item.cognitive_text_score !== null)
    .slice(-10)
    .map((item) => ({
      label: _utteranceLabel(item),
      wav: item.cognitive_score !== null ? toPercent(item.cognitive_score) : 0,
      text: item.cognitive_text_score !== null ? toPercent(item.cognitive_text_score) : 0,
    }));
}

// 주간: 최근 7일 날짜별 하루 평균
function prepareLast7DaysData(items: DailyHealthItem[], key: ScoreKey): ChartPoint[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const dateStr = d.toISOString().slice(0, 10);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    const dayItem = items.find((item) => item.date === dateStr);
    const value = dayItem && dayItem[key] !== null ? toPercent(dayItem[key] as number) : 0;
    return { label, value };
  });
}

// 주간 인지기능 이중 선 데이터
function prepareCognitiveDualWeekly(items: DailyHealthItem[]): CognitiveDualPoint[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const dateStr = d.toISOString().slice(0, 10);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    const day = items.find((item) => item.date === dateStr);
    return {
      label,
      wav: day && day.cognitive_wav_score !== null ? toPercent(day.cognitive_wav_score) : 0,
      text: day && day.cognitive_text_score !== null ? toPercent(day.cognitive_text_score) : 0,
    };
  });
}

// 월간: 최근 6개월 월별 평균
function prepareMonthlyData(items: DailyHealthItem[], key: ScoreKey): ChartPoint[] {
  const today = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const monthItems = items.filter((item) => {
      const d = parseDate(item.date);
      return d && d.getFullYear() === year && d.getMonth() === month && item[key] !== null;
    });
    const avg = monthItems.length > 0
      ? monthItems.reduce((s, it) => s + (it[key] as number), 0) / monthItems.length
      : 0;
    return { label: `${month + 1}월`, value: toPercent(avg) };
  });
}

// 월간 인지기능 이중 선 데이터
function prepareCognitiveDualMonthly(items: DailyHealthItem[]): CognitiveDualPoint[] {
  const today = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const monthItems = items.filter((item) => {
      const d = parseDate(item.date);
      return d && d.getFullYear() === year && d.getMonth() === month;
    });
    const wavItems = monthItems.filter((it) => it.cognitive_wav_score !== null);
    const textItems = monthItems.filter((it) => it.cognitive_text_score !== null);
    return {
      label: `${month + 1}월`,
      wav: wavItems.length > 0 ? toPercent(wavItems.reduce((s, it) => s + (it.cognitive_wav_score as number), 0) / wavItems.length) : 0,
      text: textItems.length > 0 ? toPercent(textItems.reduce((s, it) => s + (it.cognitive_text_score as number), 0) / textItems.length) : 0,
    };
  });
}

// ── 동적 Y축 계산 ─────────────────────────────────────────
type AxisConfig = { min: number; max: number; ticks: number[]; fmt: (v: number) => string };

function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const exp = Math.floor(Math.log10(rough));
  const f = rough / Math.pow(10, exp);
  const nice = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return nice * Math.pow(10, exp);
}

function computeAxis(values: number[], forceZeroMin = false): AxisConfig {
  const nonZero = values.filter((v) => v > 0);
  if (nonZero.length === 0) {
    return { min: 0, max: 100, ticks: [0, 25, 50, 75, 100], fmt: (v) => `${v}%` };
  }
  const dataMax = Math.max(...nonZero);
  const dataMin = forceZeroMin ? 0 : Math.min(...nonZero);
  const range = Math.max(dataMax - dataMin, dataMax * 0.1, 0.01);
  const step = niceStep(forceZeroMin ? dataMax * 1.3 / 4 : range * 1.4 / 4);
  const axisMin = forceZeroMin ? 0 : Math.max(0, Math.floor(dataMin / step) * step);
  const axisMax = Math.ceil(dataMax / step) * step;
  const ticks: number[] = [];
  for (let t = axisMin; t <= axisMax + step * 0.001; t += step) {
    ticks.push(Math.round(t * 1e9) / 1e9);
  }
  const dec = step >= 10 ? 0 : step >= 1 ? 1 : step >= 0.1 ? 1 : 2;
  return { min: axisMin, max: axisMax, ticks, fmt: (v) => `${v.toFixed(dec)}%` };
}

// ── 위험 분석 ────────────────────────────────────────────
function countPatternHits(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, p) => count + (text.match(p)?.length ?? 0), 0);
}

function buildAnalysisText(day: GuardianConversationDay) {
  const msgs = day.items.filter((i) => i.role === 'user').map((i) => i.content).join('\n');
  const summary = [day.headline, day.summary, day.attention_reason, day.topics.join(' ')].filter(Boolean).join('\n');
  return `${msgs}\n${summary}`.toLowerCase();
}

function analyzeDay(day: GuardianConversationDay): DayRisk {
  const text = buildAnalysisText(day);
  const highRiskHits = countPatternHits(text, HIGH_RISK_PATTERNS);
  const moodHits = countPatternHits(text, MOOD_PATTERNS);
  const cognitiveHits = countPatternHits(text, COGNITIVE_PATTERNS);
  const socialHits = countPatternHits(text, SOCIAL_PATTERNS);
  const appetiteHits = countPatternHits(text, APPETITE_PATTERNS);
  const energyHits = countPatternHits(text, ENERGY_PATTERNS);
  const score = Math.min(100, highRiskHits * 45 + moodHits * 9 + cognitiveHits * 8 + socialHits * 7 + appetiteHits * 6 + energyHits * 7 + (day.attention_needed ? 12 : 0));
  const signals = [highRiskHits > 0 && '위험 표현', moodHits > 0 && '기분 저하', cognitiveHits > 0 && '인지기능', socialHits > 0 && '외로움', appetiteHits > 0 && '식사 변화', energyHits > 0 && '무기력'].filter(Boolean) as string[];
  return { day, score, highRiskHits, moodHits, cognitiveHits, socialHits, appetiteHits, energyHits, signals };
}

function buildRiskAnalysis(days: GuardianConversationDay[]): RiskAnalysis {
  const dayRisks = [...days]
    .sort((a, b) => (parseDate(b.ended_at || b.started_at || b.date_key)?.getTime() ?? 0) - (parseDate(a.ended_at || a.started_at || a.date_key)?.getTime() ?? 0))
    .slice(0, 14)
    .map(analyzeDay);

  const attentionDays = dayRisks.filter((i) => i.day.attention_needed).length;
  const urgentSignals = dayRisks.reduce((n, i) => n + i.highRiskHits, 0);
  const peakScore = dayRisks.reduce((p, i) => Math.max(p, i.score), 0);
  const avgScore = dayRisks.length > 0 ? dayRisks.reduce((s, i) => s + i.score, 0) / dayRisks.length : 0;
  const signalDays = dayRisks.filter((i) => i.signals.length > 0).length;
  const score = Math.min(100, Math.round(peakScore * 0.55 + avgScore * 0.3 + signalDays * 3 + attentionDays * 4));

  let level: RiskLevel = 'stable';
  if (urgentSignals > 0 || score >= 75) level = 'urgent';
  else if (score >= 50) level = 'caution';
  else if (score >= 24) level = 'watch';

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

  return { level, score, summary: summaries[level], actionText: actions[level], attentionDays, dayRisks };
}

// ── AI 설명 fetcher ──────────────────────────────────────
async function fetchMetricExplanation(
  metric: ExplainMetric,
  healthItems: DailyHealthItem[],
  utteranceItems: UtteranceHealthItem[],
  elderName: string,
  period: Period,
): Promise<string> {
  const key = SCORE_KEY[metric];
  const sourceItems =
    period === 'daily'
      ? utteranceItems
          .filter((i) => i[key] !== null)
          .map((i) => ({ date: i.recorded_at?.slice(0, 10) ?? '', value: i[key] as number }))
      : healthItems
          .filter((i) => i[key] !== null)
          .map((i) => ({ date: i.date, value: i[key] as number }));

  const result = await getHealthExplanation({ metric, items: sourceItems, elderName });
  return result.explanation;
}

// ── 메인 컴포넌트 ────────────────────────────────────────
export default function GuardianDepressionRiskScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parentId = String(params.parentId || params.elderUserId || '');
  const parentName = String(params.parentName || '부모님');
  const linkCode = String(params.linkCode || '');

  const [days, setDays] = React.useState<GuardianConversationDay[]>([]);
  const [healthItems, setHealthItems] = React.useState<DailyHealthItem[]>([]);
  const [utteranceItems, setUtteranceItems] = React.useState<UtteranceHealthItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [period, setPeriod] = React.useState<Period>('daily');

  const [activeMetric, setActiveMetric] = React.useState<ExplainMetric | null>(null);
  const [explanation, setExplanation] = React.useState('');
  const [isExplaining, setIsExplaining] = React.useState(false);

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

    if (isManualRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const today = new Date();
      const endDate = today.toISOString().slice(0, 10);
      // 월간 6개월 커버를 위해 180일 범위로 로드
      const startDate = new Date(today.getTime() - 179 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const [convRes, healthRes, utteranceRes] = await Promise.allSettled([
        getGuardianConversations(parentId, linkCode, 60),
        getDailyHealthAnalysis(parentId, linkCode, startDate, endDate),
        getUtteranceHealthAnalysis(parentId, linkCode, 40),
      ]);

      setDays(convRes.status === 'fulfilled' ? convRes.value.days : []);
      setHealthItems(healthRes.status === 'fulfilled' ? healthRes.value.items.filter((i) => i.has_data) : []);
      setUtteranceItems(utteranceRes.status === 'fulfilled' ? utteranceRes.value.items : []);
      setError(null);
    } catch {
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
    router.push({ pathname: '/chat', params: { input: 'voice', autostart: '1', elderUserId: parentId, elder_user_id: parentId, parentId, parentName, linkCode, link_code: linkCode, requesterRole: 'guardian' } });
  }, [linkCode, parentId, parentName, router]);

  const openConversationSummary = React.useCallback(() => {
    router.push({ pathname: '/guardian-conversations', params: { parentId, parentName, linkCode } });
  }, [linkCode, parentId, parentName, router]);

  const handleChartPress = React.useCallback(async (metric: ExplainMetric) => {
    setActiveMetric(metric);
    setExplanation('');
    setIsExplaining(true);
    try {
      const text = await fetchMetricExplanation(metric, healthItems, utteranceItems, parentName, period);
      setExplanation(text);
    } catch {
      setExplanation('설명을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setIsExplaining(false);
    }
  }, [healthItems, utteranceItems, parentName, period]);

  const closeModal = React.useCallback(() => {
    setActiveMetric(null);
    setExplanation('');
  }, []);

  const todayUtteranceItems = React.useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return utteranceItems.filter((item) => item.recorded_at?.slice(0, 10) === todayStr);
  }, [utteranceItems]);

  const hasAnyData = period === 'daily' ? todayUtteranceItems.length > 0 : healthItems.length > 0;

  const periodHintText: Record<Period, string> = {
    daily: '오늘 챗봇 사용 1건마다 분석 수치',
    weekly: '최근 7일 하루 평균 수치',
    monthly: '최근 6개월 월별 평균 수치',
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.85} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>음성기반 위험도 분석</Text>
          <Text style={styles.headerSubtitle}>{parentName} 님의 최근 대화 신호를 살펴봅니다</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { void loadAnalysis(true); }} tintColor="#05B547" />}
      >
        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="small" color="#05B547" />
            <Text style={styles.stateTitle}>분석 데이터를 불러오는 중이에요</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <MaterialCommunityIcons name="alert-circle-outline" size={30} color="#EF4444" />
            <Text style={styles.stateTitle}>{error}</Text>
            <Text style={styles.stateDescription}>잠시 뒤 다시 시도해 주세요.</Text>
          </View>
        ) : days.length === 0 ? (
          <View style={styles.centerState}>
            <MaterialCommunityIcons name="message-text-outline" size={30} color="#94A3B8" />
            <Text style={styles.stateTitle}>아직 분석할 대화가 없어요</Text>
            <Text style={styles.stateDescription}>부모님이 CareMate와 대화하면 위험 신호가 여기에 표시됩니다.</Text>
          </View>
        ) : (
          <>
            {/* 전체 위험도 카드 */}
            <View style={[styles.riskCard, { backgroundColor: riskMeta.background, borderColor: riskMeta.tone }]}>
              <View style={styles.riskHeader}>
                <View style={styles.riskIconWrap}>
                  <MaterialCommunityIcons name={riskMeta.icon} size={28} color={riskMeta.tone} />
                </View>
                <View style={styles.riskTitleWrap}>
                  <Text style={[styles.riskLabel, { color: riskMeta.tone }]}>위험도 {riskMeta.label}</Text>
                  <Text style={styles.riskSummary}>{analysis.summary}</Text>
                </View>
              </View>
              <View style={styles.scoreRow}>
                <Text style={[styles.scoreNumber, { color: riskMeta.tone }]}>{analysis.score}</Text>
                <Text style={styles.scoreUnit}>/ 100</Text>
              </View>
              <Text style={styles.actionText}>{analysis.actionText}</Text>
            </View>

            {/* 안내 */}
            <View style={styles.noticeCard}>
              <MaterialCommunityIcons name="information-outline" size={20} color="#475569" />
              <Text style={styles.noticeText}>대화 기반 참고 신호이며 의학적 진단이 아닙니다. 위험 표현이 보이면 직접 확인하고 전문가 도움을 받아야 합니다.</Text>
            </View>

            {/* 기간 탭 */}
            <View style={styles.periodRow}>
              {(['daily', 'weekly', 'monthly'] as Period[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.periodTab, period === p && styles.periodTabActive]}
                  activeOpacity={0.8}
                  onPress={() => setPeriod(p)}
                >
                  <Text style={[styles.periodTabText, period === p && styles.periodTabTextActive]}>
                    {p === 'daily' ? '일간' : p === 'weekly' ? '주간' : '월간'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.periodHint}>{periodHintText[period]}</Text>

            {/* 막대 그래프 3개 */}
            {hasAnyData ? (
              <>
                <MetricBarChart
                  metric="depression"
                  period={period}
                  healthItems={healthItems}
                  utteranceItems={period === 'daily' ? todayUtteranceItems : utteranceItems}
                  onPress={() => { void handleChartPress('depression'); }}
                />
                <MetricBarChart
                  metric="insomnia"
                  period={period}
                  healthItems={healthItems}
                  utteranceItems={period === 'daily' ? todayUtteranceItems : utteranceItems}
                  onPress={() => { void handleChartPress('insomnia'); }}
                />
                <MetricBarChart
                  metric="cognitive"
                  period={period}
                  healthItems={healthItems}
                  utteranceItems={period === 'daily' ? todayUtteranceItems : utteranceItems}
                  onPress={() => { void handleChartPress('cognitive'); }}
                />
              </>
            ) : (
              <View style={styles.noChartData}>
                <MaterialCommunityIcons name="chat-outline" size={28} color="#CBD5E1" />
                <Text style={styles.noChartText}>
                  {period === 'daily' ? `${parentName}께서 아직 챗봇을 이용하지 않으셨어요` : '이 기간의 건강 데이터가 없어요'}
                </Text>
              </View>
            )}

            {/* 보호자 확인 */}
            <Text style={styles.sectionTitle}>보호자 확인</Text>
            <View style={styles.actionCard}>
              <TouchableOpacity style={styles.primaryButton} activeOpacity={0.85} onPress={openGuardianChat}>
                <Ionicons name="mic-outline" size={20} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>상태 물어보기</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.85} onPress={openConversationSummary}>
                <Ionicons name="document-text-outline" size={20} color="#0F172A" />
                <Text style={styles.secondaryButtonText}>최근 대화 보기</Text>
              </TouchableOpacity>
            </View>

            {/* 최근 변화 */}
            <Text style={styles.sectionTitle}>최근 변화</Text>
            {analysis.dayRisks.slice(0, 7).map((item) => {
              const dayMeta = item.signals.length > 0 ? item.signals.join(' · ') : '특이 신호 적음';
              const isAttention = item.day.attention_needed || item.score >= 40;
              return (
                <View key={item.day.date_key} style={styles.dayCard}>
                  <View style={styles.dayHeader}>
                    <View style={styles.dayTitleWrap}>
                      <Text style={styles.dayDate}>{formatDateLabel(item.day.date_key)}</Text>
                      <Text style={styles.dayMeta}>{dayMeta}</Text>
                    </View>
                    <View style={[styles.dayScoreBadge, isAttention && styles.dayScoreBadgeHigh]}>
                      <Text style={[styles.dayScoreText, isAttention && styles.dayScoreTextHigh]}>{item.score}</Text>
                    </View>
                  </View>
                  <Text style={styles.dayHeadline}>{item.day.headline}</Text>
                  <Text style={styles.daySummary}>{item.day.summary}</Text>
                  {item.day.attention_reason ? <Text style={styles.attentionReason}>{item.day.attention_reason}</Text> : null}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <ExplainModal metric={activeMetric} explanation={explanation} isLoading={isExplaining} onClose={closeModal} />
    </SafeAreaView>
  );
}

// ── MetricBarChart ───────────────────────────────────────
type MetricBarChartProps = {
  metric: ExplainMetric;
  period: Period;
  healthItems: DailyHealthItem[];
  utteranceItems: UtteranceHealthItem[];
  onPress: () => void;
};

function MetricBarChart({ metric, period, healthItems, utteranceItems, onPress }: MetricBarChartProps) {
  const meta = METRIC_META[metric];
  const key = SCORE_KEY[metric];

  const isCognitive = metric === 'cognitive';

  const chartData = React.useMemo<ChartPoint[]>(() => {
    if (isCognitive) return [];
    if (period === 'daily') return prepareUtteranceByConversation(utteranceItems, key);
    if (period === 'weekly') return prepareLast7DaysData(healthItems, key);
    return prepareMonthlyData(healthItems, key);
  }, [isCognitive, period, healthItems, utteranceItems, key]);

  const cogDualData = React.useMemo<CognitiveDualPoint[]>(() => {
    if (!isCognitive) return [];
    if (period === 'daily') return prepareCognitiveDualByConversation(utteranceItems);
    if (period === 'weekly') return prepareCognitiveDualWeekly(healthItems);
    return prepareCognitiveDualMonthly(healthItems);
  }, [isCognitive, period, healthItems, utteranceItems]);

  const isEmpty = isCognitive ? cogDualData.length === 0 : chartData.length === 0;

  return (
    <TouchableOpacity style={chartStyles.wrapper} activeOpacity={0.85} onPress={onPress}>
      <View style={chartStyles.headerRow}>
        <View style={chartStyles.titleGroup}>
          <MaterialCommunityIcons name={meta.icon} size={18} color={meta.color} />
          <Text style={[chartStyles.title, { color: meta.color }]}>{meta.title}</Text>
        </View>
        <View style={chartStyles.tapHint}>
          <Ionicons name="information-circle-outline" size={15} color="#94A3B8" />
          <Text style={chartStyles.tapHintText}>AI 설명</Text>
        </View>
      </View>
      <Text style={chartStyles.subtitle}>{meta.subtitle}</Text>

      {isEmpty ? (
        <View style={chartStyles.noData}>
          <Text style={chartStyles.noDataText}>이 기간의 데이터가 없어요</Text>
        </View>
      ) : isCognitive ? (
        <InlineDualLineChart data={cogDualData} />
      ) : (
        <InlineBarChart data={chartData} color={meta.color} />
      )}
    </TouchableOpacity>
  );
}

const CHART_H = 140;
const Y_AXIS_W = 36;
const COG_WAV_COLOR = '#2563EB';
const COG_TEXT_COLOR = '#059669';
const DOT_R = 4;

function YAxis({ axis }: { axis: AxisConfig }) {
  return (
    <View style={{ width: Y_AXIS_W, height: CHART_H, position: 'relative' }}>
      {axis.ticks.map((tick) => (
        <Text key={tick} style={{
          position: 'absolute',
          top: ((axis.max - tick) / (axis.max - axis.min)) * CHART_H - 7,
          right: 2, fontSize: 8, color: '#94A3B8', textAlign: 'right',
        }}>
          {axis.fmt(tick)}
        </Text>
      ))}
    </View>
  );
}

function GridLines({ axis }: { axis: AxisConfig }) {
  return (
    <>
      {axis.ticks.map((tick) => (
        <View key={tick} style={{
          position: 'absolute', left: 0, right: 0,
          bottom: ((tick - axis.min) / (axis.max - axis.min)) * CHART_H,
          height: 1,
          backgroundColor: tick === axis.min ? '#CBD5E1' : '#F1F5F9',
        }} />
      ))}
    </>
  );
}

function InlineBarChart({ data, color }: { data: ChartPoint[]; color: string }) {
  const areaWidth = SCREEN_WIDTH - 40 - 36 - Y_AXIS_W;
  const slotWidth = areaWidth / data.length;
  const barWidth = Math.max(6, Math.min(slotWidth * 0.55, 30));
  const axis = React.useMemo(() => computeAxis(data.map((p) => p.value), true), [data]);

  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row' }}>
        <YAxis axis={axis} />
        <View style={{ flex: 1, height: CHART_H, position: 'relative' }}>
          <GridLines axis={axis} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: CHART_H, paddingBottom: 1 }}>
            {data.map(({ label, value }, idx) => {
              const barH = Math.max(0, ((value - axis.min) / (axis.max - axis.min)) * (CHART_H - 1));
              return (
                <View key={`${label}-${idx}`} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: CHART_H }}>
                  {value > 0 && (
                    <Text style={{ fontSize: 8, color, fontWeight: '700', marginBottom: 1 }}>
                      {axis.fmt(value)}
                    </Text>
                  )}
                  <View style={{
                    width: barWidth,
                    height: barH > 0 ? barH : 2,
                    backgroundColor: value > 0 ? color : '#E2E8F0',
                    borderRadius: 4,
                    opacity: value > 0 ? 1 : 0.4,
                  }} />
                </View>
              );
            })}
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginLeft: Y_AXIS_W, marginTop: 5 }}>
        {data.map(({ label }, idx) => (
          <View key={`lbl-${idx}`} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 9, color: '#94A3B8' }} numberOfLines={1}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function InlineDualLineChart({ data }: { data: CognitiveDualPoint[] }) {
  const areaWidth = SCREEN_WIDTH - 40 - 36 - Y_AXIS_W;
  const n = data.length;
  const wavVals = data.map((p) => p.wav);
  const textVals = data.map((p) => p.text);
  const axis = React.useMemo(
    () => computeAxis([...wavVals, ...textVals], false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
  );

  const xOf = (idx: number) => n <= 1 ? areaWidth / 2 : (idx / (n - 1)) * areaWidth;
  const yOf = (val: number) => (1 - (val - axis.min) / (axis.max - axis.min)) * CHART_H;

  const renderLine = (vals: number[], color: string, dashed: boolean) =>
    vals.slice(0, -1).flatMap((_, i) => {
      const x1 = xOf(i); const y1 = yOf(vals[i]);
      const x2 = xOf(i + 1); const y2 = yOf(vals[i + 1]);
      const len = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
      const angle = Math.atan2(y2-y1, x2-x1) * (180 / Math.PI);
      if (!dashed) {
        return [(
          <View key={`l-${i}`} style={{
            position: 'absolute',
            left: (x1+x2)/2 - len/2, top: (y1+y2)/2 - 1,
            width: len, height: 2,
            backgroundColor: color, opacity: 0.85,
            transform: [{ rotate: `${angle}deg` }],
          }} />
        )];
      }
      const dashLen = 5; const gapLen = 4; const total = dashLen + gapLen;
      return Array.from({ length: Math.floor(len / total) }, (__, d) => {
        const t = (d * total + dashLen / 2) / len;
        return (
          <View key={`d-${i}-${d}`} style={{
            position: 'absolute',
            left: x1 + (x2-x1)*t - dashLen/2, top: y1 + (y2-y1)*t - 1,
            width: dashLen, height: 2,
            backgroundColor: color, opacity: 0.85,
            transform: [{ rotate: `${angle}deg` }],
          }} />
        );
      });
    });

  const renderDots = (vals: number[], color: string, square: boolean) =>
    vals.map((v, i) => {
      const x = xOf(i); const y = yOf(v);
      return square ? (
        <View key={`sq-${i}`} style={{
          position: 'absolute', left: x - DOT_R, top: y - DOT_R,
          width: DOT_R*2, height: DOT_R*2, backgroundColor: color, borderRadius: 2,
        }} />
      ) : (
        <View key={`dot-${i}`} style={{
          position: 'absolute', left: x - DOT_R, top: y - DOT_R,
          width: DOT_R*2, height: DOT_R*2, backgroundColor: color,
          borderRadius: DOT_R, borderWidth: 1.5, borderColor: '#fff',
        }} />
      );
    });

  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row' }}>
        <YAxis axis={axis} />
        <View style={{ flex: 1, height: CHART_H, position: 'relative' }}>
          <GridLines axis={axis} />
          {renderLine(wavVals, COG_WAV_COLOR, false)}
          {renderDots(wavVals, COG_WAV_COLOR, false)}
          {renderLine(textVals, COG_TEXT_COLOR, true)}
          {renderDots(textVals, COG_TEXT_COLOR, true)}
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginLeft: Y_AXIS_W, marginTop: 5 }}>
        {data.map(({ label }, idx) => (
          <View key={`lbl-${idx}`} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 9, color: '#94A3B8' }} numberOfLines={1}>{label}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', marginLeft: Y_AXIS_W, marginTop: 8, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 16, height: 2, backgroundColor: COG_WAV_COLOR }} />
          <View style={{ width: DOT_R*2, height: DOT_R*2, borderRadius: DOT_R, backgroundColor: COG_WAV_COLOR }} />
          <Text style={{ fontSize: 10, color: '#64748B' }}>음성 WAV</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 16, height: 2, backgroundColor: COG_TEXT_COLOR, opacity: 0.85 }} />
          <View style={{ width: DOT_R*2, height: DOT_R*2, borderRadius: 2, backgroundColor: COG_TEXT_COLOR }} />
          <Text style={{ fontSize: 10, color: '#64748B' }}>텍스트 AI</Text>
        </View>
      </View>
    </View>
  );
}

// ── ExplainModal ─────────────────────────────────────────
type ExplainModalProps = {
  metric: ExplainMetric | null;
  explanation: string;
  isLoading: boolean;
  onClose: () => void;
};

function ExplainModal({ metric, explanation, isLoading, onClose }: ExplainModalProps) {
  const meta = metric ? METRIC_META[metric] : null;

  return (
    <Modal visible={metric !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <TouchableOpacity style={modalStyles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          {meta && (
            <View style={modalStyles.titleRow}>
              <View style={[modalStyles.iconWrap, { backgroundColor: `${meta.color}15` }]}>
                <MaterialCommunityIcons name={meta.icon} size={22} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[modalStyles.metricTitle, { color: meta.color }]}>{meta.title}</Text>
                <Text style={modalStyles.metricSubtitle}>{meta.subtitle}</Text>
              </View>
            </View>
          )}
          <ScrollView style={modalStyles.body} showsVerticalScrollIndicator={false} contentContainerStyle={modalStyles.bodyContent}>
            {isLoading ? (
              <View style={modalStyles.loadingWrap}>
                <ActivityIndicator size="small" color="#05B547" />
                <Text style={modalStyles.loadingText}>AI가 분석 중이에요...</Text>
              </View>
            ) : (
              <Text style={modalStyles.explanationText}>{explanation}</Text>
            )}
          </ScrollView>
          <TouchableOpacity style={modalStyles.closeButton} onPress={onClose} activeOpacity={0.85}>
            <Text style={modalStyles.closeButtonText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── 스타일 ────────────────────────────────────────────────
const chartStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 18,
    marginBottom: 14,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
  },
  tapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tapHintText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 10,
  },
  noData: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDataText: {
    fontSize: 14,
    color: '#CBD5E1',
  },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingBottom: 36, maxHeight: '75%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginTop: 12, marginBottom: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  metricTitle: { fontSize: 18, fontWeight: '900' },
  metricSubtitle: { marginTop: 2, fontSize: 12, color: '#94A3B8' },
  body: { flexGrow: 0, marginBottom: 16 },
  bodyContent: { paddingBottom: 4 },
  loadingWrap: { paddingVertical: 32, alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#94A3B8' },
  explanationText: { fontSize: 15, lineHeight: 26, color: '#334155' },
  closeButton: { height: 52, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { fontSize: 16, fontWeight: '800', color: '#334155' },
});

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F1F5F9' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, backgroundColor: '#F1F5F9' },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  headerTextWrap: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  headerSubtitle: { marginTop: 4, fontSize: 14, lineHeight: 20, color: '#64748B' },
  container: { paddingHorizontal: 20, paddingBottom: 40 },
  centerState: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 42 },
  stateTitle: { marginTop: 12, fontSize: 16, fontWeight: '800', color: '#111827', textAlign: 'center' },
  stateDescription: { marginTop: 8, fontSize: 14, lineHeight: 21, color: '#64748B', textAlign: 'center' },
  riskCard: { borderWidth: 1, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 20, marginBottom: 14 },
  riskHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  riskIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  riskTitleWrap: { flex: 1 },
  riskLabel: { fontSize: 22, fontWeight: '900' },
  riskSummary: { marginTop: 6, fontSize: 15, lineHeight: 22, color: '#334155' },
  scoreRow: { marginTop: 20, flexDirection: 'row', alignItems: 'flex-end' },
  scoreNumber: { fontSize: 52, fontWeight: '900' },
  scoreUnit: { marginBottom: 9, marginLeft: 6, fontSize: 16, fontWeight: '700', color: '#64748B' },
  actionText: { marginTop: 8, fontSize: 15, lineHeight: 23, color: '#111827' },
  noticeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 22 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 20, color: '#475569' },
  periodRow: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 4, marginBottom: 8, gap: 4 },
  periodTab: { flex: 1, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  periodTabActive: { backgroundColor: '#05B547' },
  periodTabText: { fontSize: 14, fontWeight: '700', color: '#94A3B8' },
  periodTabTextActive: { color: '#FFFFFF' },
  periodHint: { fontSize: 12, color: '#94A3B8', marginBottom: 14, marginLeft: 2 },
  noChartData: { backgroundColor: '#FFFFFF', borderRadius: 20, paddingVertical: 36, alignItems: 'center', gap: 10, marginBottom: 14 },
  noChartText: { fontSize: 14, color: '#CBD5E1' },
  sectionTitle: { marginBottom: 12, fontSize: 18, fontWeight: '900', color: '#111827' },
  actionCard: { backgroundColor: '#FFFFFF', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 16, marginBottom: 24, gap: 10 },
  primaryButton: { minHeight: 54, borderRadius: 16, backgroundColor: '#05B547', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { fontSize: 16, fontWeight: '900', color: '#FFFFFF' },
  secondaryButton: { minHeight: 54, borderRadius: 16, backgroundColor: '#F8FAFC', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryButtonText: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  dayCard: { backgroundColor: '#FFFFFF', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 18, marginBottom: 14 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  dayTitleWrap: { flex: 1 },
  dayDate: { fontSize: 16, fontWeight: '900', color: '#111827' },
  dayMeta: { marginTop: 5, fontSize: 13, lineHeight: 19, color: '#64748B' },
  dayScoreBadge: { minWidth: 46, height: 36, borderRadius: 18, backgroundColor: '#ECFDF3', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  dayScoreBadgeHigh: { backgroundColor: '#FEF2F2' },
  dayScoreText: { fontSize: 15, fontWeight: '900', color: '#047857' },
  dayScoreTextHigh: { color: '#DC2626' },
  dayHeadline: { marginTop: 14, fontSize: 18, fontWeight: '900', color: '#111827' },
  daySummary: { marginTop: 8, fontSize: 15, lineHeight: 23, color: '#334155' },
  attentionReason: { marginTop: 9, fontSize: 14, lineHeight: 21, color: '#DC2626' },
});

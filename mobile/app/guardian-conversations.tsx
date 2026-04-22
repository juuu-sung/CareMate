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
  GuardianConversationItem,
  getGuardianConversations,
} from '@/services/guardian';
import { CareMode } from '@/types/care';

function formatModeLabel(mode: CareMode) {
  if (mode === 'cognitive_support') {
    return '인지 지원';
  }
  if (mode === 'health_support') {
    return '건강 관리';
  }
  return '기본 모드';
}

function parseConversationDate(value: string) {
  const normalized = value.trim();
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

function formatConversationTime(value: string) {
  const date = parseConversationDate(value);
  if (!date) {
    return value;
  }

  return date.toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatConversationDateLabel(value: string) {
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

function formatConversationTimeRange(startedAt: string, endedAt: string) {
  if (!startedAt && !endedAt) {
    return '시간 정보 없음';
  }

  const startLabel = startedAt ? formatConversationTime(startedAt) : '';
  const endLabel = endedAt ? formatConversationTime(endedAt) : '';

  if (!startLabel) {
    return endLabel;
  }

  if (!endLabel || startLabel === endLabel) {
    return startLabel;
  }

  return `${startLabel} - ${endLabel}`;
}

function getRoleLabel(role: GuardianConversationItem['role']) {
  return role === 'user' ? '부모님' : 'CareMate';
}

export default function GuardianConversationsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parentId = String(params.parentId || params.elderUserId || '');
  const parentName = String(params.parentName || '부모님');
  const linkCode = String(params.linkCode || '');

  const [days, setDays] = React.useState<GuardianConversationDay[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [expandedDays, setExpandedDays] = React.useState<Record<string, boolean>>({});

  const loadConversations = React.useCallback(async (isManualRefresh = false) => {
    if (!parentId || !linkCode) {
      setDays([]);
      setError('연동 정보가 없어 대화 기록을 불러올 수 없어요.');
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
      const response = await getGuardianConversations(parentId, linkCode, 40);
      setDays(response.days);
      setExpandedDays({});
      setError(null);
    } catch (conversationError) {
      console.log('보호자 대화 조회 오류:', conversationError);
      setDays([]);
      setError('대화 요약을 불러오지 못했어요.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [linkCode, parentId]);

  useFocusEffect(
    React.useCallback(() => {
      void loadConversations();
      return undefined;
    }, [loadConversations])
  );

  const totalMessageCount = days.reduce(
    (count, day) => count + day.message_count,
    0
  );
  const lastConversationAt = days.length > 0 ? days[0]?.ended_at ?? '' : '';

  const toggleTranscript = React.useCallback((dateKey: string) => {
    setExpandedDays((current) => ({
      ...current,
      [dateKey]: !current[dateKey],
    }));
  }, []);

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
          <Text style={styles.headerTitle}>대화 요약</Text>
          <Text style={styles.headerSubtitle}>
            {parentName} 님이 CareMate와 어떤 대화를 했는지 요약해서 확인해요
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
              void loadConversations(true);
            }}
            tintColor="#05B547"
          />
        }
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>요약 일수</Text>
            <Text style={styles.summaryValue}>{days.length}일</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>마지막 대화</Text>
            <Text style={styles.summaryValue}>
              {lastConversationAt
                ? `${formatConversationDateLabel(lastConversationAt)} ${formatConversationTime(lastConversationAt)}`
                : '기록 없음'}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="small" color="#05B547" />
            <Text style={styles.stateTitle}>대화 요약을 불러오는 중이에요</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={28}
              color="#EF4444"
            />
            <Text style={styles.stateTitle}>{error}</Text>
            <Text style={styles.stateDescription}>
              잠시 뒤 다시 시도해 주세요.
            </Text>
          </View>
        ) : days.length === 0 ? (
          <View style={styles.centerState}>
            <MaterialCommunityIcons
              name="message-text-outline"
              size={28}
              color="#94A3B8"
            />
            <Text style={styles.stateTitle}>아직 대화 기록이 없어요</Text>
            <Text style={styles.stateDescription}>
              부모님이 CareMate와 대화를 시작하면 요약이 여기에 표시됩니다.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.listCaption}>
              최근 {totalMessageCount}개의 대화를 날짜별로 요약했어요.
            </Text>

            {days.map((day) => {
              const isExpanded = Boolean(expandedDays[day.date_key]);

              return (
                <View key={day.date_key} style={styles.dayCard}>
                  <View style={styles.dayHeader}>
                    <View style={styles.dayTitleWrap}>
                      <Text style={styles.dayDate}>
                        {formatConversationDateLabel(day.date_key)}
                      </Text>
                      <Text style={styles.dayMeta}>
                        {formatConversationTimeRange(day.started_at, day.ended_at)} ·{' '}
                        {day.message_count}개 대화
                      </Text>
                    </View>

                    {day.attention_needed ? (
                      <View style={styles.attentionBadge}>
                        <Text style={styles.attentionBadgeText}>주의</Text>
                      </View>
                    ) : null}
                  </View>

                  <Text style={styles.dayHeadline}>{day.headline}</Text>
                  <Text style={styles.daySummary}>{day.summary}</Text>

                  {day.attention_needed && day.attention_reason ? (
                    <Text style={styles.attentionReason}>{day.attention_reason}</Text>
                  ) : null}

                  {day.topics.length > 0 ? (
                    <View style={styles.topicRow}>
                      {day.topics.map((topic) => (
                        <View key={`${day.date_key}-${topic}`} style={styles.topicChip}>
                          <Text style={styles.topicChipText}>{topic}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={styles.toggleButton}
                    activeOpacity={0.85}
                    onPress={() => toggleTranscript(day.date_key)}
                  >
                    <Text style={styles.toggleButtonText}>
                      {isExpanded ? '원문 숨기기' : '원문 보기'}
                    </Text>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="#0F172A"
                    />
                  </TouchableOpacity>

                  {isExpanded ? (
                    <View style={styles.transcriptWrap}>
                      {day.items.map((item, index) => {
                        const isUser = item.role === 'user';

                        return (
                          <View
                            key={`${day.date_key}-${item.created_at}-${index}`}
                            style={[
                              styles.messageCard,
                              isUser ? styles.userMessageCard : styles.assistantMessageCard,
                            ]}
                          >
                            <View style={styles.messageMetaRow}>
                              <Text
                                style={[
                                  styles.messageRole,
                                  isUser ? styles.userMessageRole : styles.assistantMessageRole,
                                ]}
                              >
                                {getRoleLabel(item.role)}
                              </Text>
                              <Text style={styles.messageMeta}>
                                {formatModeLabel(item.mode)} ·{' '}
                                {formatConversationTime(item.created_at)}
                              </Text>
                            </View>
                            <Text style={styles.messageText}>{item.content}</Text>
                          </View>
                        );
                      })}
                    </View>
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
    width: 40,
    height: 40,
    borderRadius: 20,
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
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 16,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 16,
  },
  listCaption: {
    marginBottom: 12,
    fontSize: 13,
    color: '#64748B',
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  stateTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '700',
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
  dayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 16,
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
    fontWeight: '800',
    color: '#0F172A',
  },
  dayMeta: {
    marginTop: 4,
    fontSize: 13,
    color: '#64748B',
  },
  attentionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FEF2F2',
  },
  attentionBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  dayHeadline: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  daySummary: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 23,
    color: '#334155',
  },
  attentionReason: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: '#DC2626',
  },
  topicRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  topicChip: {
    borderRadius: 999,
    backgroundColor: '#ECFDF3',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  topicChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  toggleButton: {
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  transcriptWrap: {
    marginTop: 12,
  },
  messageCard: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 10,
  },
  userMessageCard: {
    backgroundColor: '#DCFCE7',
  },
  assistantMessageCard: {
    backgroundColor: '#F8FAFC',
  },
  messageMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  messageRole: {
    fontSize: 13,
    fontWeight: '700',
  },
  userMessageRole: {
    color: '#047857',
  },
  assistantMessageRole: {
    color: '#2563EB',
  },
  messageMeta: {
    flex: 1,
    fontSize: 12,
    color: '#64748B',
    textAlign: 'right',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#111827',
  },
});

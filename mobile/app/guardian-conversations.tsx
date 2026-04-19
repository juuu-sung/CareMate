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
  getGuardianConversations,
  GuardianConversationItem,
} from '@/services/guardian';
import { CareMode } from '@/types/care';

type ConversationSection = {
  title: string;
  items: GuardianConversationItem[];
};

function formatModeLabel(mode: CareMode) {
  if (mode === 'cognitive_support') {
    return '인지 지원';
  }
  if (mode === 'health_support') {
    return '건강 관리';
  }
  return '기본 모드';
}

function formatConversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatConversationDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
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

function buildConversationSections(
  items: GuardianConversationItem[]
): ConversationSection[] {
  const sections: ConversationSection[] = [];

  items.forEach((item) => {
    const title = formatConversationDateLabel(item.created_at);
    const currentSection = sections[sections.length - 1];

    if (currentSection && currentSection.title === title) {
      currentSection.items.push(item);
      return;
    }

    sections.push({
      title,
      items: [item],
    });
  });

  return sections;
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

  const [items, setItems] = React.useState<GuardianConversationItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const loadConversations = React.useCallback(async (isManualRefresh = false) => {
    if (!parentId || !linkCode) {
      setItems([]);
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
      setItems(response.items);
      setError(null);
    } catch (conversationError) {
      console.log('보호자 대화 조회 오류:', conversationError);
      setItems([]);
      setError('대화 기록을 불러오지 못했어요.');
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

  const conversationSections = buildConversationSections(items);
  const lastConversationAt =
    items.length > 0 ? items[items.length - 1]?.created_at ?? '' : '';

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
          <Text style={styles.headerTitle}>대화 확인</Text>
          <Text style={styles.headerSubtitle}>
            {parentName} 님의 최근 대화를 확인해요
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
            <Text style={styles.summaryLabel}>최근 대화 수</Text>
            <Text style={styles.summaryValue}>{items.length}개</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>마지막 기록</Text>
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
            <Text style={styles.stateTitle}>대화 기록을 불러오는 중이에요</Text>
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
        ) : items.length === 0 ? (
          <View style={styles.centerState}>
            <MaterialCommunityIcons
              name="message-text-outline"
              size={28}
              color="#94A3B8"
            />
            <Text style={styles.stateTitle}>아직 대화 기록이 없어요</Text>
            <Text style={styles.stateDescription}>
              부모님이 CareMate와 대화를 시작하면 여기에 최근 기록이 표시됩니다.
            </Text>
          </View>
        ) : (
          conversationSections.map((section) => (
            <View key={section.title} style={styles.sectionWrap}>
              <Text style={styles.sectionTitle}>{section.title}</Text>

              {section.items.map((item, index) => {
                const isUser = item.role === 'user';

                return (
                  <View
                    key={`${item.created_at}-${item.role}-${index}`}
                    style={[
                      styles.messageCard,
                      isUser ? styles.userMessageCard : styles.assistantMessageCard,
                    ]}
                  >
                    <View style={styles.messageMetaRow}>
                      <Text style={styles.messageRole}>
                        {getRoleLabel(item.role)}
                      </Text>
                      <Text style={styles.messageMeta}>
                        {formatConversationTime(item.created_at)} · {formatModeLabel(item.mode)}
                      </Text>
                    </View>

                    <Text style={styles.messageText}>{item.content}</Text>
                  </View>
                );
              })}
            </View>
          ))
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
    marginBottom: 20,
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
  sectionWrap: {
    marginBottom: 20,
  },
  sectionTitle: {
    marginBottom: 10,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  messageCard: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  userMessageCard: {
    backgroundColor: '#DCFCE7',
  },
  assistantMessageCard: {
    backgroundColor: '#FFFFFF',
  },
  messageMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  messageRole: {
    fontSize: 13,
    fontWeight: '700',
    color: '#05B547',
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

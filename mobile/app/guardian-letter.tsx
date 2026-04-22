import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  ScrollView,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Text,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchLettersForElder, LetterItem, sendLetterFromGuardian } from '@/services/letters';

function formatLetterDateTitle(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatLetterDateKey(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLetterTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const meridiem = hours >= 12 ? '오후' : '오전';
  const hour12 = hours % 12 || 12;
  return `${meridiem} ${hour12}:${minutes}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthKey(value: string) {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, 1);
}

function getLetterDayKey(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildLetterMonthOptions(letters: LetterItem[]) {
  const keys = new Set<string>();
  const monthKeys: string[] = [];

  for (const letter of letters) {
    const date = new Date(letter.created_at);
    if (Number.isNaN(date.getTime())) {
      continue;
    }

    const monthKey = formatMonthKey(date);
    if (keys.has(monthKey)) {
      continue;
    }

    keys.add(monthKey);
    monthKeys.push(monthKey);
  }

  monthKeys.sort((left, right) => (left < right ? 1 : -1));
  return monthKeys;
}

function formatCalendarMonthLabel(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function buildCalendarDays(monthDate: Date, letters: LetterItem[]) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const days: Array<{ key: string; dayNumber: number; hasLetters: boolean } | null> = [];
  const availableDayKeys = new Set(letters.map((letter) => getLetterDayKey(letter.created_at)).filter(Boolean));

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const currentDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    const key = getDateDayKey(currentDate);
    days.push({
      key,
      dayNumber: day,
      hasLetters: availableDayKeys.has(key),
    });
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

export default function GuardianLetterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const elderUserId = String(params.elderUserId || params.parentId || '');
  const parentName = String(params.parentName || '부모님');
  const parentAge = String(params.parentAge || '');
  const parentGender = String(params.parentGender || '');
  const linkCode = String(params.linkCode || '');

  const [letter, setLetter] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sentLetters, setSentLetters] = useState<LetterItem[]>([]);
  const [selectedHistoryDay, setSelectedHistoryDay] = useState<string>('all');
  const [selectedCalendarMonth, setSelectedCalendarMonth] = useState(() =>
    startOfMonth(new Date())
  );

  const trimmedLetter = useMemo(() => letter.trim(), [letter]);
  const maxLength = 50;

  const loadLetterHistory = React.useCallback(async () => {
    if (!elderUserId || !linkCode) {
      setSentLetters([]);
      setHistoryError('연동 정보가 없어 보낸 편지를 불러올 수 없습니다.');
      setHistoryLoading(false);
      return;
    }

    try {
      setHistoryLoading(true);
      const response = await fetchLettersForElder(elderUserId, linkCode);
      setSentLetters(
        response.letters.filter((item) => item.sender_role === 'guardian')
      );
      setHistoryError(null);
    } catch (error: any) {
      setSentLetters([]);
      setHistoryError(error?.message || '보낸 편지를 불러오지 못했습니다.');
    } finally {
      setHistoryLoading(false);
    }
  }, [elderUserId, linkCode]);

  useFocusEffect(
    React.useCallback(() => {
      void loadLetterHistory();
      return undefined;
    }, [loadLetterHistory])
  );

  const calendarMonths = useMemo(
    () => buildLetterMonthOptions(sentLetters),
    [sentLetters]
  );
  const selectedCalendarMonthKey = formatMonthKey(selectedCalendarMonth);
  const activeMonthIndex = calendarMonths.findIndex(
    (monthKey) => monthKey === selectedCalendarMonthKey
  );
  const visibleCalendarMonth =
    activeMonthIndex >= 0
      ? selectedCalendarMonth
      : calendarMonths[0]
        ? parseMonthKey(calendarMonths[0])
        : selectedCalendarMonth;
  const calendarDays = useMemo(
    () => buildCalendarDays(visibleCalendarMonth, sentLetters),
    [sentLetters, visibleCalendarMonth]
  );
  const visibleLetters = useMemo(
    () =>
      selectedHistoryDay === 'all'
        ? sentLetters
        : sentLetters.filter(
            (letter) => getLetterDayKey(letter.created_at) === selectedHistoryDay
          ),
    [selectedHistoryDay, sentLetters]
  );

  React.useEffect(() => {
    if (calendarMonths.length === 0) {
      const currentMonth = startOfMonth(new Date());
      if (formatMonthKey(currentMonth) !== selectedCalendarMonthKey) {
        setSelectedCalendarMonth(currentMonth);
      }
      return;
    }

    if (!calendarMonths.includes(selectedCalendarMonthKey)) {
      setSelectedCalendarMonth(parseMonthKey(calendarMonths[0]));
    }
  }, [calendarMonths, selectedCalendarMonthKey]);

  React.useEffect(() => {
    if (selectedHistoryDay === 'all') {
      return;
    }

    const exists = sentLetters.some(
      (letter) => getLetterDayKey(letter.created_at) === selectedHistoryDay
    );

    if (!exists) {
      setSelectedHistoryDay('all');
    }
  }, [selectedHistoryDay, sentLetters]);

  const groupedLetters = useMemo(() => {
    const groups = new Map<string, { title: string; items: LetterItem[] }>();

    visibleLetters.forEach((item) => {
      const key = formatLetterDateKey(item.created_at);
      const title = formatLetterDateTitle(item.created_at);
      const current = groups.get(key);

      if (current) {
        current.items.push(item);
        return;
      }

      groups.set(key, {
        title,
        items: [item],
      });
    });

    return Array.from(groups.entries()).map(([key, value]) => ({
      key,
      title: value.title,
      items: value.items,
    }));
  }, [visibleLetters]);

  const handleSend = async () => {
    if (!trimmedLetter) {
      Alert.alert('알림', '편지 내용을 입력해주세요.');
      return;
    }

    if (!elderUserId || !linkCode) {
      Alert.alert('오류', '연동 정보가 없습니다.');
      return;
    }

    try {
      setLoading(true);

      await sendLetterFromGuardian({
        elderUserId,
        linkCode,
        content: trimmedLetter,
      });

      setLetter('');
      await loadLetterHistory();

      Alert.alert('전송 완료', `${parentName} 님에게 편지를 보냈습니다.`);
    } catch (error: any) {
      Alert.alert('전송 실패', error.message || '편지 전송에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F1F1F1" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={22} color="#111827" />
            </TouchableOpacity>

            <Text style={styles.topTitle}>편지 쓰기</Text>

            <View style={{ width: 40 }} />
          </View>

          <View style={styles.profileCard}>
            <View style={styles.profileLeft}>
              <View style={styles.avatarWrap}>
                <Text style={styles.avatarText}>
                  {parentName?.trim()?.charAt(0) || '부'}
                </Text>
              </View>

              <View>
                <Text style={styles.profileName}>{parentName} 님</Text>
                <Text style={styles.profileMeta}>
                  {[
                    parentAge ? `${parentAge}세` : '',
                    parentGender || '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || '편지 보내기'}
                </Text>
              </View>
            </View>

            <View style={styles.linkCodeBadge}>
              <Feather name="link" size={14} color="#05B547" />
              <Text style={styles.linkCodeText}>{linkCode || '-'}</Text>
            </View>
          </View>

          <View style={styles.tipCard}>
            <MaterialCommunityIcons name="heart-outline" size={18} color="#05B547" />
            <Text style={styles.tipText}>
              짧은 한마디도 충분합니다. 아래에서 날짜별로 보낸 편지도 확인할 수 있어요.
            </Text>
          </View>

          <View style={styles.editorCard}>
            <View style={styles.editorTopRow}>
              <Text style={styles.editorTitle}>메시지</Text>
              <Text style={styles.countText}>
                {letter.length}/{maxLength}
              </Text>
            </View>

            <TextInput
              style={styles.input}
              placeholder="예: 오늘도 건강 잘 챙기세요!"
              placeholderTextColor="#98A2B3"
              multiline
              maxLength={maxLength}
              value={letter}
              onChangeText={setLetter}
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            style={[
              styles.sendButton,
              (!trimmedLetter || loading) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!trimmedLetter || loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View style={styles.sendButtonContent}>
                <Ionicons name="paper-plane-outline" size={18} color="#FFFFFF" />
                <Text style={styles.sendButtonText}>편지 보내기</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <View>
                <Text style={styles.historyTitle}>보낸 편지</Text>
                <Text style={styles.historySubtitle}>달력에서 날짜를 골라 기록을 볼 수 있습니다</Text>
              </View>
              <View style={styles.historyCountBadge}>
                <Text style={styles.historyCountText}>{sentLetters.length}개</Text>
              </View>
            </View>

            {!historyLoading && !historyError && sentLetters.length > 0 ? (
              <View style={styles.filterCard}>
                <View style={styles.filterHeaderRow}>
                  <Text style={styles.filterTitle}>날짜 선택</Text>
                  <TouchableOpacity
                    style={[
                      styles.allHistoryButton,
                      selectedHistoryDay === 'all' && styles.allHistoryButtonActive,
                    ]}
                    onPress={() => setSelectedHistoryDay('all')}
                  >
                    <Text
                      style={[
                        styles.allHistoryButtonText,
                        selectedHistoryDay === 'all' && styles.allHistoryButtonTextActive,
                      ]}
                    >
                      전체 보기
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.calendarHeaderRow}>
                  <TouchableOpacity
                    style={[
                      styles.calendarNavButton,
                      activeMonthIndex <= 0 && styles.calendarNavButtonDisabled,
                    ]}
                    onPress={() => {
                      if (activeMonthIndex > 0) {
                        setSelectedHistoryDay('all');
                        setSelectedCalendarMonth(parseMonthKey(calendarMonths[activeMonthIndex - 1]));
                      }
                    }}
                    disabled={activeMonthIndex <= 0}
                  >
                    <Text style={styles.calendarNavText}>이전</Text>
                  </TouchableOpacity>

                  <Text style={styles.calendarMonthLabel}>
                    {formatCalendarMonthLabel(visibleCalendarMonth)}
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.calendarNavButton,
                      (activeMonthIndex < 0 ||
                        activeMonthIndex >= calendarMonths.length - 1) &&
                        styles.calendarNavButtonDisabled,
                    ]}
                    onPress={() => {
                      if (
                        activeMonthIndex >= 0 &&
                        activeMonthIndex < calendarMonths.length - 1
                      ) {
                        setSelectedHistoryDay('all');
                        setSelectedCalendarMonth(parseMonthKey(calendarMonths[activeMonthIndex + 1]));
                      }
                    }}
                    disabled={
                      activeMonthIndex < 0 ||
                      activeMonthIndex >= calendarMonths.length - 1
                    }
                  >
                    <Text style={styles.calendarNavText}>다음</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.weekdayRow}>
                  {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                    <Text key={day} style={styles.weekdayLabel}>
                      {day}
                    </Text>
                  ))}
                </View>

                <View style={styles.calendarGrid}>
                  {calendarDays.map((day, calendarIndex) =>
                    day ? (
                      <TouchableOpacity
                        key={day.key}
                        style={[
                          styles.calendarDayCell,
                          !day.hasLetters && styles.calendarDayCellDisabled,
                          selectedHistoryDay === day.key && styles.calendarDayCellActive,
                        ]}
                        onPress={() => {
                          if (day.hasLetters) {
                            setSelectedHistoryDay(day.key);
                          }
                        }}
                        disabled={!day.hasLetters}
                      >
                        <Text
                          style={[
                            styles.calendarDayText,
                            !day.hasLetters && styles.calendarDayTextDisabled,
                            selectedHistoryDay === day.key && styles.calendarDayTextActive,
                          ]}
                        >
                          {day.dayNumber}
                        </Text>
                        {day.hasLetters ? <View style={styles.calendarDayDot} /> : null}
                      </TouchableOpacity>
                    ) : (
                      <View key={`empty-${calendarIndex}`} style={styles.calendarDaySpacer} />
                    )
                  )}
                </View>
              </View>
            ) : null}

            {historyLoading ? (
              <View style={styles.historyState}>
                <ActivityIndicator color="#05B547" />
                <Text style={styles.historyStateText}>보낸 편지를 불러오는 중입니다.</Text>
              </View>
            ) : historyError ? (
              <View style={styles.historyState}>
                <Text style={styles.historyErrorText}>{historyError}</Text>
              </View>
            ) : groupedLetters.length === 0 ? (
              <View style={styles.historyState}>
                <Text style={styles.historyStateText}>아직 보낸 편지가 없습니다.</Text>
              </View>
            ) : (
              groupedLetters.map((group) => (
                <View key={group.key} style={styles.historyGroup}>
                  <Text style={styles.historyDateTitle}>{group.title}</Text>
                  {group.items.map((item, index) => (
                    <View
                      key={`${group.key}-${item.created_at}-${index}`}
                      style={[
                        styles.letterItem,
                        index !== group.items.length - 1 && styles.withDivider,
                      ]}
                    >
                      <View style={styles.letterItemHeader}>
                        <Text style={styles.letterTime}>{formatLetterTime(item.created_at)}</Text>
                        <View style={styles.senderBadge}>
                          <Text style={styles.senderBadgeText}>보낸 편지</Text>
                        </View>
                      </View>
                      <Text style={styles.letterContent}>{item.content}</Text>
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  safeArea: {
    flex: 1,
    backgroundColor: '#F1F1F1',
  },

  container: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  topTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },

  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  profileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#05D34E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },

  profileName: {
    fontSize: 17,
    fontWeight: '800',
  },

  profileMeta: {
    fontSize: 13,
    color: '#6B7280',
  },

  linkCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEFDF3',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  linkCodeText: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#05B547',
  },

  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },

  tipText: {
    marginLeft: 6,
    fontSize: 13,
    color: '#4B5563',
  },

  editorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },

  editorTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  editorTitle: {
    fontSize: 17,
    fontWeight: '800',
  },

  countText: {
    fontSize: 13,
    color: '#98A2B3',
  },

  input: {
    flex: 1,
    minHeight: 220,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
  },

  sendButton: {
    height: 56,
    borderRadius: 16,
    backgroundColor: '#05B547',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },

  sendButtonDisabled: {
    backgroundColor: '#A7DDB9',
  },

  sendButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  sendButtonText: {
    marginLeft: 6,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
  },

  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  historyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },

  historySubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },

  historyCountBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#EEFDF3',
  },

  historyCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#05B547',
  },

  filterCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },

  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  filterTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },

  allHistoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#ECFDF5',
  },

  allHistoryButtonActive: {
    backgroundColor: '#05B547',
  },

  allHistoryButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },

  allHistoryButtonTextActive: {
    color: '#FFFFFF',
  },

  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  calendarNavButton: {
    minWidth: 52,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
  },

  calendarNavButtonDisabled: {
    backgroundColor: '#F3F4F6',
  },

  calendarNavText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#047857',
  },

  calendarMonthLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },

  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },

  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },

  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
  },

  calendarDayCell: {
    width: '14.28%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
  },

  calendarDayCellDisabled: {
    backgroundColor: 'transparent',
  },

  calendarDayCellActive: {
    backgroundColor: '#05B547',
  },

  calendarDayText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#047857',
  },

  calendarDayTextDisabled: {
    color: '#CBD5E1',
    fontWeight: '600',
  },

  calendarDayTextActive: {
    color: '#FFFFFF',
  },

  calendarDayDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    marginTop: 4,
    backgroundColor: '#86EFAC',
  },

  calendarDaySpacer: {
    width: '14.28%',
    minHeight: 48,
  },

  historyState: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  historyStateText: {
    marginTop: 10,
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
    textAlign: 'center',
  },

  historyErrorText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '700',
    textAlign: 'center',
  },

  historyGroup: {
    marginBottom: 14,
  },

  historyDateTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#374151',
    marginBottom: 8,
  },

  letterItem: {
    paddingVertical: 12,
  },

  letterItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  letterTime: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '700',
  },

  senderBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#F0FDF4',
  },

  senderBadgeText: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '800',
  },

  letterContent: {
    fontSize: 15,
    lineHeight: 22,
    color: '#111827',
    fontWeight: '600',
  },

  withDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
});

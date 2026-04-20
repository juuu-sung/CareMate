import React from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  createGuardianSchedule,
  deleteGuardianSchedule,
  getGuardianSchedules,
  updateGuardianSchedule,
} from '@/services/guardian';
import {
  GuardianScheduleItem,
  GuardianScheduleStatus,
} from '@/types/guardian';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

function formatStatusLabel(status: GuardianScheduleStatus) {
  if (status === 'completed') {
    return '완료';
  }
  if (status === 'cancelled') {
    return '취소';
  }
  return '예정';
}

function getStatusColor(status: GuardianScheduleStatus) {
  if (status === 'completed') {
    return '#05B547';
  }
  if (status === 'cancelled') {
    return '#9CA3AF';
  }
  return '#2563EB';
}

function buildNextScheduleLabel(items: GuardianScheduleItem[]) {
  const nextItem = items.find((item) => item.status === 'scheduled') ?? items[0];
  if (!nextItem) {
    return '등록된 일정 없음';
  }

  return `${nextItem.date} ${nextItem.time}`;
}

export default function GuardianSchedulesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parentId = String(params.parentId || params.elderUserId || '');
  const parentName = String(params.parentName || '부모님');
  const linkCode = String(params.linkCode || '');

  const [items, setItems] = React.useState<GuardianScheduleItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState('');
  const [date, setDate] = React.useState('');
  const [time, setTime] = React.useState('');
  const [description, setDescription] = React.useState('');

  const resetForm = React.useCallback(() => {
    setEditingId(null);
    setTitle('');
    setDate('');
    setTime('');
    setDescription('');
  }, []);

  const loadSchedules = React.useCallback(
    async (manualRefresh = false) => {
      if (!parentId || !linkCode) {
        setItems([]);
        setError('연동 정보가 없어 병원 일정을 불러올 수 없어요.');
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (manualRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const response = await getGuardianSchedules(parentId, linkCode);
        setItems(response.items);
        setError(null);
      } catch (scheduleError) {
        console.log('보호자 일정 조회 오류:', scheduleError);
        setItems([]);
        setError('병원 일정을 불러오지 못했어요.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [linkCode, parentId]
  );

  useFocusEffect(
    React.useCallback(() => {
      void loadSchedules();
      return undefined;
    }, [loadSchedules])
  );

  const validateForm = React.useCallback(() => {
    if (!title.trim()) {
      Alert.alert('입력 확인', '일정 제목을 입력해 주세요.');
      return false;
    }

    if (!DATE_PATTERN.test(date.trim())) {
      Alert.alert('입력 확인', '날짜는 YYYY-MM-DD 형식으로 입력해 주세요.');
      return false;
    }

    if (!TIME_PATTERN.test(time.trim())) {
      Alert.alert('입력 확인', '시간은 HH:MM 형식으로 입력해 주세요.');
      return false;
    }

    return true;
  }, [date, time, title]);

  const handleSubmit = React.useCallback(async () => {
    if (!validateForm() || !parentId || !linkCode) {
      return;
    }

    try {
      setIsSaving(true);

      const payload = {
        title: title.trim(),
        date: date.trim(),
        time: time.trim(),
        description: description.trim(),
        type: 'hospital',
        status: 'scheduled' as GuardianScheduleStatus,
      };

      if (editingId) {
        await updateGuardianSchedule(parentId, linkCode, editingId, payload);
      } else {
        await createGuardianSchedule(parentId, linkCode, payload);
      }

      resetForm();
      await loadSchedules();
    } catch (saveError: any) {
      Alert.alert(
        editingId ? '일정 수정 실패' : '일정 등록 실패',
        saveError?.message || '잠시 뒤 다시 시도해 주세요.'
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    date,
    description,
    editingId,
    linkCode,
    loadSchedules,
    parentId,
    resetForm,
    time,
    title,
    validateForm,
  ]);

  const handleEdit = React.useCallback((item: GuardianScheduleItem) => {
    setEditingId(item.id);
    setTitle(item.title);
    setDate(item.date);
    setTime(item.time);
    setDescription(item.description || '');
  }, []);

  const handleComplete = React.useCallback(
    async (item: GuardianScheduleItem) => {
      try {
        await updateGuardianSchedule(parentId, linkCode, item.id, {
          status: 'completed',
        });
        await loadSchedules();
      } catch (updateError: any) {
        Alert.alert('완료 처리 실패', updateError?.message || '잠시 뒤 다시 시도해 주세요.');
      }
    },
    [linkCode, loadSchedules, parentId]
  );

  const handleDelete = React.useCallback(
    (item: GuardianScheduleItem) => {
      Alert.alert('일정 삭제', `"${item.title}" 일정을 삭제할까요?`, [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteGuardianSchedule(parentId, linkCode, item.id);
                if (editingId === item.id) {
                  resetForm();
                }
                await loadSchedules();
              } catch (deleteError: any) {
                Alert.alert(
                  '삭제 실패',
                  deleteError?.message || '잠시 뒤 다시 시도해 주세요.'
                );
              }
            })();
          },
        },
      ]);
    },
    [editingId, linkCode, loadSchedules, parentId, resetForm]
  );

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
          <Text style={styles.headerTitle}>병원 일정 관리</Text>
          <Text style={styles.headerSubtitle}>
            {parentName} 님의 병원 일정을 직접 관리해요
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
              void loadSchedules(true);
            }}
            tintColor="#2563EB"
          />
        }
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>등록된 일정</Text>
            <Text style={styles.summaryValue}>{items.length}건</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>가장 가까운 일정</Text>
            <Text style={styles.summaryValue}>{buildNextScheduleLabel(items)}</Text>
          </View>
        </View>

        <View style={styles.formCard}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>
              {editingId ? '일정 수정' : '새 일정 등록'}
            </Text>
            {editingId ? (
              <TouchableOpacity activeOpacity={0.85} onPress={resetForm}>
                <Text style={styles.cancelEditText}>새로 작성</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.label}>일정 제목</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="예: 서울내과 정기 진료"
            placeholderTextColor="#9CA3AF"
          />

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.label}>날짜</Text>
              <TextInput
                style={styles.input}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9CA3AF"
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.half}>
              <Text style={styles.label}>시간</Text>
              <TextInput
                style={styles.input}
                value={time}
                onChangeText={setTime}
                placeholder="HH:MM"
                placeholderTextColor="#9CA3AF"
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
              />
            </View>
          </View>

          <Text style={styles.label}>메모</Text>
          <TextInput
            style={styles.textArea}
            value={description}
            onChangeText={setDescription}
            placeholder="예: 보호자 동행 필요, 진료 전 금식"
            placeholderTextColor="#9CA3AF"
            multiline
          />

          <TouchableOpacity
            style={[styles.submitButton, isSaving && styles.disabledButton]}
            activeOpacity={0.88}
            onPress={() => {
              void handleSubmit();
            }}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>
                {editingId ? '일정 수정하기' : '일정 등록하기'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.stateTitle}>병원 일정을 불러오는 중이에요</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <MaterialCommunityIcons
              name="calendar-alert"
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
              name="calendar-blank-outline"
              size={28}
              color="#94A3B8"
            />
            <Text style={styles.stateTitle}>등록된 병원 일정이 없어요</Text>
            <Text style={styles.stateDescription}>
              위에서 새 일정을 추가해 주세요.
            </Text>
          </View>
        ) : (
          <View style={styles.listWrap}>
            {items.map((item) => (
              <View key={item.id} style={styles.scheduleCard}>
                <View style={styles.scheduleTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.scheduleTitle}>{item.title}</Text>
                    <Text style={styles.scheduleDateTime}>
                      {item.date} · {item.time}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: `${getStatusColor(item.status)}18` },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: getStatusColor(item.status) },
                      ]}
                    >
                      {formatStatusLabel(item.status)}
                    </Text>
                  </View>
                </View>

                {item.description ? (
                  <Text style={styles.scheduleDescription}>{item.description}</Text>
                ) : null}

                <View style={styles.scheduleActions}>
                  <TouchableOpacity
                    style={styles.secondaryAction}
                    activeOpacity={0.85}
                    onPress={() => handleEdit(item)}
                  >
                    <Text style={styles.secondaryActionText}>수정</Text>
                  </TouchableOpacity>

                  {item.status !== 'completed' ? (
                    <TouchableOpacity
                      style={styles.secondaryAction}
                      activeOpacity={0.85}
                      onPress={() => {
                        void handleComplete(item);
                      }}
                    >
                      <Text style={styles.secondaryActionText}>완료 처리</Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.secondaryAction, styles.deleteAction]}
                    activeOpacity={0.85}
                    onPress={() => handleDelete(item)}
                  >
                    <Text style={styles.deleteActionText}>삭제</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#F8FAFC',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerTextWrap: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },
  container: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    backgroundColor: '#F8FAFC',
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: 18,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  summaryItem: {
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 12,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  summaryValue: {
    marginTop: 6,
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  formCard: {
    marginTop: 16,
    padding: 18,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  cancelEditText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  label: {
    marginTop: 14,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  half: {
    flex: 1,
  },
  input: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111827',
  },
  textArea: {
    minHeight: 92,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: '#111827',
    textAlignVertical: 'top',
  },
  submitButton: {
    marginTop: 18,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
  },
  disabledButton: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  centerState: {
    marginTop: 20,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  stateDescription: {
    marginTop: 6,
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
  listWrap: {
    marginTop: 18,
    gap: 12,
  },
  scheduleCard: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  scheduleTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  scheduleTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  scheduleDateTime: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },
  scheduleDescription: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 21,
    color: '#374151',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  scheduleActions: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryAction: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  deleteAction: {
    backgroundColor: '#FEF2F2',
  },
  deleteActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
});

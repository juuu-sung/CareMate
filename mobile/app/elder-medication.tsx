import React from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { SeniorBottomNav } from '@/components/common/SeniorBottomNav';
import {
  getMedications,
  MedicationItem,
  MedicationStatus,
  recordMedicationStatus,
} from '@/services/medications';
import {
  getMedicationReminderStatus,
  scheduleDailyMedicationReminders,
  syncMedicationRemindersIfEnabled,
} from '@/services/medicationReminders';
import { getElderProfileByUserId } from '@/services/elderProfile';
import {
  getMedicationTimeLabel,
  getSeniorMedicationPurposeLabel,
} from '@/utils/medicationDisplay';

const BLUE = '#F97316';
const BLUE_DARK = '#EA580C';
const BLUE_LIGHT = '#FFEDD5';
const BG = '#FFFFFF';
const TEXT = '#111827';

type MedicationItemWithEasyName = MedicationItem & {
  id?: string | number | null;
  easy_name?: string | null;
  simple_name?: string | null;
  display_name?: string | null;
  category_name?: string | null;
  easyName?: string | null;
  simpleName?: string | null;
  displayName?: string | null;
  categoryName?: string | null;
};

function cleanMedicationLine(line: string) {
  return String(line || '')
    .replace(/^-+\s*/, '')
    .replace(/^약\s*이름\s*[:：]?\s*/g, '')
    .replace(/^약\s*이름만\s*[:：]?\s*/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSection(summary: string, sectionTitle: string) {
  const text = String(summary || '').trim();

  if (!text) {
    return '';
  }

  const escapedTitle = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const sectionMatch = text.match(
    new RegExp(`\\[${escapedTitle}\\]([\\s\\S]*?)(?=\\n\\s*\\[|$)`)
  );

  return sectionMatch?.[1] ?? '';
}

function isInvalidMedicationText(value: string) {
  const text = String(value || '').trim();

  if (!text) return true;
  if (text === '확인 불가') return true;
  if (text.includes('확인 불가')) return true;
  if (text.includes('복약 안내')) return true;
  if (text.includes('언제 먹는지')) return true;
  if (text.includes('한 번에')) return true;
  if (text.includes('하루에')) return true;
  if (text.includes('쉬운 안내')) return true;
  if (text.includes('이미지에서')) return true;
  if (text.includes('개인정보')) return true;

  return false;
}

function extractEasyMedicationMapFromSummary(summary: string) {
  const sectionText = extractSection(summary, '쉬운 약 이름');
  const result: Record<string, string> = {};

  if (!sectionText) {
    return result;
  }

  sectionText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .forEach((line) => {
      const cleaned = line.replace(/^-+\s*/, '').trim();
      const parts = cleaned.split(/[:：]/);

      if (parts.length < 2) return;

      const officialName = cleanMedicationLine(parts[0]);
      const easyName = parts.slice(1).join(':').trim();

      if (
        !officialName ||
        !easyName ||
        isInvalidMedicationText(officialName) ||
        isInvalidMedicationText(easyName)
      ) {
        return;
      }

      result[officialName] = easyName;
    });

  return result;
}

function normalizeMedicationNameForMatch(value: string) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/[(){}\[\],.·ㆍ]/g, '')
    .toLowerCase();
}

function findEasyNameFromSummaryMap(
  officialName: string,
  easyNameMap: Record<string, string>
) {
  const target = normalizeMedicationNameForMatch(officialName);

  if (!target) return '';

  const exact = easyNameMap[officialName];

  if (exact) return exact;

  const matchedKey = Object.keys(easyNameMap).find((key) => {
    const normalizedKey = normalizeMedicationNameForMatch(key);

    return (
      normalizedKey === target ||
      normalizedKey.includes(target) ||
      target.includes(normalizedKey)
    );
  });

  return matchedKey ? easyNameMap[matchedKey] : '';
}

function getEasyMedicationName(
  medication: MedicationItem,
  easyNameMap: Record<string, string>
): string {
  const item = medication as MedicationItemWithEasyName;
  const fromSummary = findEasyNameFromSummaryMap(item.name, easyNameMap);

  return getSeniorMedicationPurposeLabel(item, fromSummary);
}

function extractMedicationNamesFromProfileText(value: string): string[] {
  const text = String(value || '').trim();

  if (!text) {
    return [];
  }

  const medicationSection = extractSection(text, '복용 중인 약');
  const sourceText = medicationSection || text;

  return sourceText
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*[-*•]\s*/, '')
        .replace(/^\s*\d+[.)]\s*/, '')
        .replace(/^\[복용 중인 약\]\s*/g, '')
        .replace(/^복용 중인 약\s*[:：]?\s*/g, '')
        .trim()
    )
    .filter((line) => {
      if (!line) return false;
      if (line.includes('확인 불가')) return false;
      if (line.includes('복용 중인 약')) return false;
      if (line.includes('쉬운 약 이름')) return false;
      if (line.includes('복약 안내')) return false;
      if (line.includes('언제 먹는지')) return false;
      if (line.includes('하루에')) return false;
      if (line.includes('한 번에')) return false;
      if (line.includes('이미지에서')) return false;
      if (line.includes('개인정보')) return false;
      if (line.startsWith('[') && line.endsWith(']')) return false;
      return true;
    });
}

function buildMedicationItemsFromProfileText(value: string): MedicationItem[] {
  const names = extractMedicationNamesFromProfileText(value);

  return names.map((name, index) => {
    return {
      id: `profile-medication-${index}`,
      name,
      time: '복약 시간 확인 필요',
      status: 'scheduled',
      status_label: '먹을 시간',
      last_recorded_at: null,
      last_time_scope: null,
    } as unknown as MedicationItem;
  });
}
function getStatusInfo(status: MedicationItem['status']) {
  if (status === 'taken') {
    return {
      label: '먹었어요',
      backgroundColor: '#DCFCE7',
      color: '#047A36',
      icon: 'checkmark-circle' as const,
    };
  }

  if (status === 'missed') {
    return {
      label: '놓쳤어요',
      backgroundColor: '#FEE2E2',
      color: '#B91C1C',
      icon: 'alert-circle' as const,
    };
  }

  return {
    label: '먹을 시간',
    backgroundColor: '#FFEDD5',
    color: BLUE_DARK,
    icon: 'time' as const,
  };
}

type MedicationDoseGroup = {
  key: string;
  time: string;
  items: MedicationItem[];
};

function groupMedicationItemsByTime(items: MedicationItem[]): MedicationDoseGroup[] {
  const groups = new Map<string, MedicationDoseGroup>();

  items.forEach((item) => {
    const time = item.time || '지금';
    const group = groups.get(time);

    if (group) {
      group.items.push(item);
      return;
    }

    groups.set(time, {
      key: time,
      time,
      items: [item],
    });
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((left, right) =>
        getEasyMedicationName(left, {}).localeCompare(getEasyMedicationName(right, {}))
      ),
    }))
    .sort((left, right) => left.time.localeCompare(right.time));
}

function getDoseGroupLabel(timeValue: string) {
  return getMedicationTimeLabel(timeValue);
}

function uniqueMedicationDisplayNames(
  items: MedicationItem[],
  easyNameMap: Record<string, string>
) {
  const seen = new Set<string>();
  const names: string[] = [];

  items.forEach((item) => {
    const name = getParentFacingMedicationName(item, easyNameMap);
    const key = name.replace(/\s+/g, '').toLowerCase();

    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    names.push(name);
  });

  return names;
}

function getParentFacingMedicationName(
  medication: MedicationItem,
  easyNameMap: Record<string, string>
) {
  const item = medication as MedicationItemWithEasyName;
  const fromSummary = findEasyNameFromSummaryMap(item.name, easyNameMap);

  return getSeniorMedicationPurposeLabel(item, fromSummary);
}

function formatDoseGroupNames(
  group: MedicationDoseGroup,
  easyNameMap: Record<string, string>
) {
  const names = uniqueMedicationDisplayNames(group.items, easyNameMap);

  if (names.length === 0) {
    return '등록된 약이 없습니다';
  }

  if (names.length <= 3) {
    return names.join(', ');
  }

  return `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}개`;
}

function formatDoseGroupTitle(
  group: MedicationDoseGroup,
  easyNameMap: Record<string, string>
) {
  const names = formatDoseGroupNames(group, easyNameMap);

  if (names === '등록된 약이 없습니다') {
    return getDoseGroupLabel(group.time);
  }

  return `${getDoseGroupLabel(group.time)} (${names})`;
}

function getDoseGroupStatus(group: MedicationDoseGroup): MedicationItem['status'] {
  if (group.items.some((item) => item.status === 'missed')) {
    return 'missed';
  }

  if (group.items.length > 0 && group.items.every((item) => item.status === 'taken')) {
    return 'taken';
  }

  return 'scheduled';
}

function formatDoseGroupRecord(group: MedicationDoseGroup) {
  const status = getDoseGroupStatus(group);

  if (status === 'taken') {
    return '모두 복용 완료';
  }

  if (status === 'missed') {
    const missedCount = group.items.filter((item) => item.status === 'missed').length;
    return `${missedCount}개 못 먹음`;
  }

  return '복용 전';
}

export default function ElderMedicationsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const elderUserId = String(
    params.elderUserId || params.elder_user_id || params.parentId || ''
  ).trim();

  const fallbackName = String(params.parentName || '어르신');
  const linkCode = String(params.linkCode || params.link_code || params.code || '');

  const [parentName] = React.useState(fallbackName);
  const [profileMedicationsText, setProfileMedicationsText] = React.useState('');
  const [medicationItems, setMedicationItems] = React.useState<MedicationItem[]>([]);
  const [medicationError, setMedicationError] = React.useState<string | null>(null);
  const [profileError, setProfileError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isSchedulingReminders, setIsSchedulingReminders] = React.useState(false);
  const [savingRecordKey, setSavingRecordKey] = React.useState<string | null>(null);
  const [reminderStatus, setReminderStatus] = React.useState<string | null>(null);

  const refreshReminderStatus = React.useCallback(async () => {
    const status = await getMedicationReminderStatus(elderUserId);
    setReminderStatus(`${status.statusLabel} · ${status.detail}`);
  }, [elderUserId]);

  const easyNameMap = React.useMemo(() => {
    return extractEasyMedicationMapFromSummary(profileMedicationsText);
  }, [profileMedicationsText]);

  const loadMedicationData = React.useCallback(
    async (manualRefresh = false) => {
      if (!elderUserId) {
        setMedicationItems([]);
        setProfileMedicationsText('');
        setMedicationError('사용자 정보를 찾을 수 없습니다.');
        setProfileError(null);
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
        const [profile, items] = await Promise.all([
          getElderProfileByUserId(elderUserId),
          getMedications(elderUserId),
        ]);

        const profileMedicationText = profile?.medications ?? '';
        const apiMedicationItems = Array.isArray(items) ? items : [];

        const finalMedicationItems =
          apiMedicationItems.length > 0
            ? apiMedicationItems
            : buildMedicationItemsFromProfileText(profileMedicationText);

        setProfileMedicationsText(profileMedicationText);
        setMedicationItems(finalMedicationItems);
        setMedicationError(null);
        setProfileError(null);
        await syncMedicationRemindersIfEnabled({
          elderUserId,
          medications: finalMedicationItems,
        });
        await refreshReminderStatus();
      } catch (error) {
        console.log('노인 복약 조회 오류:', error);

        setMedicationItems([]);
        setMedicationError('복약 정보를 불러오지 못했습니다.');
        setProfileError('어르신 기본 정보를 불러오지 못했습니다.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [elderUserId, refreshReminderStatus]
  );

  useFocusEffect(
    React.useCallback(() => {
      void loadMedicationData();
      return undefined;
    }, [loadMedicationData])
  );

  const enableMedicationReminders = React.useCallback(async () => {
    if (!elderUserId) {
      Alert.alert('알림 설정', '사용자 정보를 찾을 수 없습니다.');
      return;
    }

    if (medicationItems.length === 0) {
      Alert.alert('알림 설정', '등록된 약이 없어 알림을 설정할 수 없습니다.');
      return;
    }

    try {
      setIsSchedulingReminders(true);

      const result = await scheduleDailyMedicationReminders({
        elderUserId,
        medications: medicationItems,
      });

      if (!result.granted) {
        const message =
          'isSimulator' in result && result.isSimulator
            ? 'iOS 시뮬레이터에서는 실제 복약 알림을 검증할 수 없습니다.'
            : '복약 알림을 받으려면 알림 권한을 허용해주세요.';

        setReminderStatus(message);
        Alert.alert('알림 설정 확인', message);
        return;
      }

      const message =
        result.scheduledCount > 0
          ? `매일 복약 시간에 ${result.scheduledCount}개 알림을 드릴게요.`
          : '알림을 설정할 수 있는 복약 시간이 없습니다.';

      setReminderStatus(message);
      await refreshReminderStatus();
      Alert.alert('복약 알림', message);
    } catch (error) {
      console.log('복약 알림 설정 오류:', error);
      setReminderStatus('복약 알림을 설정하지 못했습니다.');
      Alert.alert('알림 설정 실패', '복약 알림을 설정하지 못했습니다.');
    } finally {
      setIsSchedulingReminders(false);
    }
  }, [elderUserId, medicationItems, refreshReminderStatus]);

  const doseGroups = React.useMemo(() => {
    return groupMedicationItemsByTime(medicationItems);
  }, [medicationItems]);

  const recordDoseGroup = React.useCallback(
    async (group: MedicationDoseGroup, status: Exclude<MedicationStatus, 'scheduled'>) => {
      if (!elderUserId) {
        Alert.alert('복약 기록', '사용자 정보를 찾을 수 없습니다.');
        return;
      }

      const recordKey = `${group.key}-${status}`;

      try {
        setSavingRecordKey(recordKey);

        for (const medication of group.items) {
          await recordMedicationStatus({
            elder_user_id: elderUserId,
            medication_id: medication.id,
            medication_name: medication.name,
            time_scope: medication.time,
            status,
          });
        }

        await loadMedicationData(true);

        Alert.alert(
          '복약 기록',
          status === 'taken'
            ? `${getDoseGroupLabel(group.time)}을 복용 완료로 기록했습니다.`
            : `${getDoseGroupLabel(group.time)}을 못 먹음으로 기록했습니다.`
        );
      } catch (error) {
        console.log('복약 기록 오류:', error);
        Alert.alert('복약 기록 실패', '복약 상태를 기록하지 못했습니다.');
      } finally {
        setSavingRecordKey(null);
      }
    },
    [elderUserId, loadMedicationData]
  );

  const medicationSummary = React.useMemo(() => {
    return medicationItems.reduce(
      (summary, item) => {
        summary.total += 1;

        if (item.status === 'taken') {
          summary.taken += 1;
        } else if (item.status === 'missed') {
          summary.missed += 1;
        } else {
          summary.scheduled += 1;
        }

        return summary;
      },
      { total: 0, taken: 0, scheduled: 0, missed: 0 }
    );
  }, [medicationItems]);

  const medicationCompletionRate =
    medicationSummary.total > 0
      ? Math.round((medicationSummary.taken / medicationSummary.total) * 100)
      : 0;

  const doseGroupSummary = React.useMemo(() => {
    return doseGroups.reduce(
      (summary, group) => {
        summary.total += 1;
        const status = getDoseGroupStatus(group);

        if (status === 'taken') {
          summary.taken += 1;
        } else if (status === 'missed') {
          summary.missed += 1;
        } else {
          summary.scheduled += 1;
        }

        return summary;
      },
      { total: 0, taken: 0, scheduled: 0, missed: 0 }
    );
  }, [doseGroups]);

  const missedDoseGroups = React.useMemo(() => {
    return doseGroups.filter((group) => group.items.some((item) => item.status === 'missed'));
  }, [doseGroups]);

  const nextDoseGroup = React.useMemo(() => {
    return doseGroups.find((group) => getDoseGroupStatus(group) !== 'taken') || doseGroups[0];
  }, [doseGroups]);

  const nextDoseGroupTitle = nextDoseGroup
    ? formatDoseGroupTitle(nextDoseGroup, easyNameMap)
    : '';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadMedicationData(true)}
            tintColor={BLUE}
          />
        }
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-back" size={30} color={BLUE_DARK} />
          </TouchableOpacity>

          <Text style={styles.topTitle}>복약 정보</Text>

          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => void loadMedicationData(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={26} color={BLUE_DARK} />
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroIconCircle}>
            <MaterialCommunityIcons name="pill" size={54} color="#FFFFFF" />
          </View>

          <View style={styles.heroTextArea}>
            <Text style={styles.heroLabel}>오늘 드실 약</Text>
            <Text style={styles.heroTitle}>
              {doseGroupSummary.scheduled > 0
                ? `${doseGroupSummary.scheduled}번 남았어요`
                : doseGroupSummary.total > 0
                  ? '오늘 약 확인 끝'
                  : '등록된 약이 없어요'}
            </Text>
            <Text style={styles.heroSubTitle}>
              {parentName} 님의 복약 정보를 확인해 주세요
            </Text>
          </View>
        </View>

        {isLoading && medicationItems.length === 0 ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={BLUE} />
            <Text style={styles.stateText}>복약 정보를 불러오는 중입니다</Text>
          </View>
        ) : null}

        {profileError ? (
          <View style={styles.noticeCard}>
            <Ionicons name="alert-circle-outline" size={28} color="#B91C1C" />
            <Text style={styles.noticeText}>{profileError}</Text>
          </View>
        ) : null}

        {medicationError ? (
          <View style={styles.noticeCard}>
            <Ionicons name="alert-circle-outline" size={28} color="#B91C1C" />
            <Text style={styles.noticeText}>{medicationError}</Text>
          </View>
        ) : null}

        <View style={styles.reminderCard}>
          <View style={styles.reminderTextArea}>
            <Text style={styles.reminderTitle}>복약 알림</Text>
            <Text style={styles.reminderDescription}>
              등록된 약 시간에 매일 알림을 보내드릴게요.
            </Text>
            {reminderStatus ? (
              <Text style={styles.reminderStatus}>{reminderStatus}</Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={[
              styles.reminderButton,
              (isSchedulingReminders || medicationItems.length === 0) &&
                styles.disabledActionButton,
            ]}
            onPress={() => void enableMedicationReminders()}
            disabled={isSchedulingReminders || medicationItems.length === 0}
            activeOpacity={0.88}
          >
            {isSchedulingReminders ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="alarm-outline" size={22} color="#FFFFFF" />
            )}
            <Text style={styles.reminderButtonText}>켜기</Text>
          </TouchableOpacity>
        </View>

        {nextDoseGroup ? (
          <View style={styles.nextCard}>
            <View style={styles.nextHeader}>
              <Ionicons name="notifications-outline" size={34} color={BLUE_DARK} />
              <Text style={styles.nextTitle}>가장 먼저 확인할 약</Text>
            </View>

            <Text style={styles.nextMedicineName}>
              {nextDoseGroupTitle}
            </Text>

            <Text style={styles.nextOfficialName}>
              {nextDoseGroup.items.length}개 약을 함께 먹는 시간입니다.
            </Text>

            <View style={styles.nextTimeBox}>
              <Text style={styles.nextTimeLabel}>복약 시간</Text>
              <Text style={styles.nextTimeText}>{nextDoseGroup.time}</Text>
            </View>

            <Text style={styles.nextRecordText}>
              최근 기록: {formatDoseGroupRecord(nextDoseGroup)}
            </Text>

            <View style={styles.nextActionRow}>
              <TouchableOpacity
                style={[styles.primaryActionButton, savingRecordKey !== null && styles.disabledActionButton]}
                onPress={() => void recordDoseGroup(nextDoseGroup, 'taken')}
                disabled={savingRecordKey !== null}
                activeOpacity={0.88}
              >
                <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
                <Text style={styles.primaryActionText}>모두 먹었어요</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryActionButton, savingRecordKey !== null && styles.disabledActionButton]}
                onPress={() => void recordDoseGroup(nextDoseGroup, 'missed')}
                disabled={savingRecordKey !== null}
                activeOpacity={0.88}
              >
                <Ionicons name="close-circle-outline" size={24} color={BLUE_DARK} />
                <Text style={styles.secondaryActionText}>못 먹었어요</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>오늘 복약 요약</Text>

        <View style={styles.summaryRow}>
          <SummaryCard label="완료율" value={`${medicationCompletionRate}%`} />
          <SummaryCard label="완료" value={`${medicationSummary.taken}개`} />
          <SummaryCard label="놓침" value={`${medicationSummary.missed}개`} />
        </View>

        {missedDoseGroups.length > 0 ? (
          <View style={styles.missedCard}>
            <View style={styles.missedHeader}>
              <Ionicons name="alert-circle-outline" size={26} color="#B91C1C" />
              <Text style={styles.missedTitle}>오늘 못 먹은 약</Text>
            </View>
            {missedDoseGroups.map((group, index) => (
              <Text key={`${group.key}-${index}`} style={styles.missedText}>
                {formatDoseGroupTitle(group, easyNameMap)} · {group.time}
              </Text>
            ))}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>오늘 먹는 약</Text>

        <View style={styles.listCard}>
          {medicationError ? (
            <Text style={styles.emptyText}>{medicationError}</Text>
          ) : doseGroups.length === 0 && !isLoading ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="pill-off" size={48} color="#FDBA74" />
              <Text style={styles.emptyTitle}>등록된 약이 없습니다</Text>
              <Text style={styles.emptySubText}>
                보호자가 약 정보를 등록하면 이곳에서 볼 수 있습니다
              </Text>
            </View>
          ) : (
            doseGroups.map((group, index) => {
              const statusInfo = getStatusInfo(getDoseGroupStatus(group));
              const groupTitle = formatDoseGroupTitle(group, easyNameMap);

              return (
                <View
                  key={`${group.key}-${index}`}
                  style={[
                    styles.medicationRow,
                    index !== doseGroups.length - 1 && styles.withDivider,
                  ]}
                >
                  <View style={styles.medicationIconBox}>
                    <MaterialCommunityIcons name="pill" size={34} color={BLUE_DARK} />
                  </View>

                  <View style={styles.medicationContent}>
                    <Text style={styles.medicationName}>
                      {groupTitle}
                    </Text>

                    <Text style={styles.medicationOfficialName}>
                      {group.items.length}개 약을 함께 먹는 시간입니다.
                    </Text>

                    <View style={styles.timeRow}>
                      <Ionicons name="time-outline" size={22} color="#64748B" />
                      <Text style={styles.medicationTime}>{group.time}</Text>
                    </View>

                    <Text style={styles.medicationRecord}>
                      최근 기록 {formatDoseGroupRecord(group)}
                    </Text>

                    <View style={styles.rowActionGroup}>
                      <TouchableOpacity
                        style={[
                          styles.rowTakenButton,
                          savingRecordKey !== null && styles.disabledActionButton,
                        ]}
                        onPress={() => void recordDoseGroup(group, 'taken')}
                        disabled={savingRecordKey !== null}
                        activeOpacity={0.88}
                      >
                        <Text style={styles.rowTakenButtonText}>모두 먹음</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.rowMissedButton,
                          savingRecordKey !== null && styles.disabledActionButton,
                        ]}
                        onPress={() => void recordDoseGroup(group, 'missed')}
                        disabled={savingRecordKey !== null}
                        activeOpacity={0.88}
                      >
                        <Text style={styles.rowMissedButtonText}>못 먹음</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: statusInfo.backgroundColor },
                    ]}
                  >
                    <Ionicons
                      name={statusInfo.icon}
                      size={20}
                      color={statusInfo.color}
                    />
                    <Text style={[styles.statusText, { color: statusInfo.color }]}>
                      {statusInfo.label}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <TouchableOpacity
          style={styles.chatGuideButton}
          onPress={() =>
            router.push({
              pathname: '/chat',
              params: {
                input: 'voice',
                autostart: '0',
                elderUserId,
                elder_user_id: elderUserId,
              },
            })
          }
          activeOpacity={0.9}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={42} color="#FFFFFF" />
          <View style={styles.chatGuideTextArea}>
            <Text style={styles.chatGuideTitle}>약에 대해 물어보기</Text>
            <Text style={styles.chatGuideSubTitle}>궁금하면 비서에게 물어보세요</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      <SeniorBottomNav
        active="medication"
        params={{
          parentId: elderUserId,
          elderUserId,
          parentName,
          linkCode,
        }}
      />
    </SafeAreaView>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 132,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  backButton: {
    width: 58,
    height: 54,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  refreshButton: {
    width: 58,
    height: 54,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '900',
    color: TEXT,
    letterSpacing: -0.7,
  },
  heroCard: {
    backgroundColor: BLUE,
    borderRadius: 32,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 18,
  },
  heroIconCircle: {
    width: 92,
    height: 92,
    borderRadius: 32,
    backgroundColor: BLUE_DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextArea: {
    flex: 1,
  },
  heroLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF7ED',
  },
  heroTitle: {
    marginTop: 6,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.8,
  },
  heroSubTitle: {
    marginTop: 8,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    color: '#FFF7ED',
  },
  stateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    marginBottom: 18,
  },
  stateText: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'center',
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF1F2',
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  noticeText: {
    flex: 1,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '800',
    color: '#B91C1C',
  },
  reminderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 20,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
  },
  reminderTextArea: {
    flex: 1,
  },
  reminderTitle: {
    fontSize: 23,
    fontWeight: '900',
    color: TEXT,
  },
  reminderDescription: {
    marginTop: 5,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
    color: '#64748B',
  },
  reminderStatus: {
    marginTop: 7,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    color: BLUE_DARK,
  },
  reminderButton: {
    minWidth: 82,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: BLUE_DARK,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
  },
  reminderButtonText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  nextCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 22,
    marginBottom: 22,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  nextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  nextTitle: {
    fontSize: 23,
    fontWeight: '900',
    color: '#EA580C',
  },
  nextMedicineName: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '900',
    color: TEXT,
    letterSpacing: -0.8,
  },
  nextOfficialName: {
    marginTop: 6,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
    color: '#64748B',
  },
  nextTimeBox: {
    marginTop: 18,
    backgroundColor: BLUE_LIGHT,
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  nextTimeLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#64748B',
  },
  nextTimeText: {
    marginTop: 5,
    fontSize: 30,
    fontWeight: '900',
    color: BLUE_DARK,
  },
  nextRecordText: {
    marginTop: 14,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    color: '#64748B',
  },
  nextActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  primaryActionButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: BLUE_DARK,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryActionText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  secondaryActionButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryActionText: {
    fontSize: 18,
    fontWeight: '900',
    color: BLUE_DARK,
  },
  disabledActionButton: {
    opacity: 0.55,
  },
  sectionTitle: {
    fontSize: 25,
    fontWeight: '900',
    color: TEXT,
    marginBottom: 12,
    letterSpacing: -0.6,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 22,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 10,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  summaryLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: '#64748B',
  },
  summaryValue: {
    marginTop: 8,
    fontSize: 26,
    fontWeight: '900',
    color: BLUE_DARK,
  },
  missedCard: {
    backgroundColor: '#FFF1F2',
    borderRadius: 24,
    padding: 18,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  missedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  missedTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#B91C1C',
  },
  missedText: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '800',
    color: '#7F1D1D',
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginBottom: 22,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  medicationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
  },
  medicationIconBox: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicationContent: {
    flex: 1,
  },
  medicationName: {
    fontSize: 25,
    lineHeight: 32,
    fontWeight: '900',
    color: TEXT,
    letterSpacing: -0.5,
  },
  medicationOfficialName: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    color: '#64748B',
  },
  timeRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  medicationTime: {
    fontSize: 20,
    fontWeight: '900',
    color: BLUE_DARK,
  },
  medicationRecord: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: '#64748B',
  },
  rowActionGroup: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  rowTakenButton: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: BLUE_DARK,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  rowTakenButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  rowMissedButton: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: '#FFF7ED',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  rowMissedButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: BLUE_DARK,
  },
  statusBadge: {
    minWidth: 88,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '900',
  },
  withDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 44,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 24,
    fontWeight: '900',
    color: TEXT,
  },
  emptySubText: {
    marginTop: 8,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  emptyText: {
    paddingVertical: 28,
    fontSize: 19,
    lineHeight: 28,
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'center',
  },
  chatGuideButton: {
    backgroundColor: BLUE_DARK,
    borderRadius: 28,
    paddingVertical: 24,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    shadowColor: BLUE_DARK,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  chatGuideTextArea: {
    flex: 1,
  },
  chatGuideTitle: {
    fontSize: 27,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.7,
  },
  chatGuideSubTitle: {
    marginTop: 6,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '700',
    color: '#FFF7ED',
  },
});

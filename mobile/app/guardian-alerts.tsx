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
import { Feather, Ionicons } from '@expo/vector-icons';

import {
  getGuardianAlerts,
  GuardianAlertItem,
  updateGuardianAlertStatus,
} from '@/services/guardian';

function formatRelativeTime(timestamp: string) {
  if (!timestamp) {
    return '기록 없음';
  }

  const target = new Date(timestamp);
  if (Number.isNaN(target.getTime())) {
    return '기록 없음';
  }

  const diffMs = Date.now() - target.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 1) {
    return '방금 전';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}분 전`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}시간 전`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}일 전`;
  }

  return `${target.getMonth() + 1}/${target.getDate()}`;
}

export default function GuardianAlertsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parentId = String(params.parentId || params.elderUserId || '');
  const parentName = String(params.parentName || '부모님');
  const linkCode = String(params.linkCode || '');

  const [alerts, setAlerts] = React.useState<GuardianAlertItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [activeAlertId, setActiveAlertId] = React.useState<string | null>(null);
  const hasBlockingError = !!error && alerts.length === 0;

  const loadAlerts = React.useCallback(
    async (manualRefresh = false) => {
      if (!parentId || !linkCode) {
        setAlerts([]);
        setError('연동 정보가 없어 알림을 불러올 수 없어요.');
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
        const result = await getGuardianAlerts(parentId, linkCode, 10);
        setAlerts(result.items);
        setError(null);
      } catch (loadError) {
        console.log('보호자 알림 목록 조회 오류:', loadError);
        setAlerts([]);
        setError('알림을 불러오지 못했어요.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [linkCode, parentId]
  );

  useFocusEffect(
    React.useCallback(() => {
      void loadAlerts();
      return undefined;
    }, [loadAlerts])
  );

  const openAlertHistoryScreen = React.useCallback(() => {
    router.push({
      pathname: '/guardian-alert-history',
      params: {
        parentId,
        parentName,
        linkCode,
      },
    });
  }, [linkCode, parentId, parentName, router]);

  const handleAlertStatusChange = React.useCallback(
    async (item: GuardianAlertItem, status: 'resolved') => {
      if (!parentId || !linkCode) {
        return;
      }

      setActiveAlertId(item.id || `${item.type}-${item.created_at}`);

      try {
        const updated = await updateGuardianAlertStatus(parentId, linkCode, item.id, item, status);
        setAlerts((current) => {
          if (updated.status === 'resolved') {
            return current.filter((currentItem) => {
              if (currentItem.id && item.id) {
                return currentItem.id !== item.id;
              }

              return !(
                currentItem.type === item.type &&
                currentItem.message === item.message &&
                currentItem.created_at === item.created_at
              );
            });
          }

          return current.map((currentItem) => {
            if (currentItem.id && item.id) {
              return currentItem.id === item.id ? updated : currentItem;
            }

            return currentItem.type === item.type &&
              currentItem.message === item.message &&
              currentItem.created_at === item.created_at
              ? updated
              : currentItem;
          });
        });
        setError(null);
      } catch (updateError) {
        console.log('보호자 알림 상태 변경 오류:', updateError);
        setError('알림 상태를 바꾸지 못했어요.');
      } finally {
        setActiveAlertId(null);
      }
    },
    [linkCode, parentId]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadAlerts(true)}
            tintColor="#05B547"
          />
        }
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>알림</Text>
          <View style={styles.topBarActions}>
            <TouchableOpacity
              style={styles.topActionButton}
              activeOpacity={0.85}
              onPress={openAlertHistoryScreen}
            >
              <Ionicons name="calendar-outline" size={16} color="#F97316" />
              <Text style={styles.topActionButtonText}>기록</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => void loadAlerts(true)}
            >
              <Ionicons name="refresh" size={20} color="#111827" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>최근 보호 알림</Text>
          <Text style={styles.heroName}>{parentName} 님</Text>
          <Text style={styles.heroDescription}>확인이 끝난 알림은 바로 정리할 수 있어요.</Text>
        </View>

        {isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color="#05B547" />
            <Text style={styles.stateText}>알림을 불러오는 중입니다.</Text>
          </View>
        ) : hasBlockingError ? (
          <View style={styles.stateCard}>
            <Feather name="alert-circle" size={22} color="#DC2626" />
            <Text style={styles.stateTitle}>알림 조회 실패</Text>
            <Text style={styles.stateText}>{error}</Text>
          </View>
        ) : alerts.length === 0 ? (
          <View style={styles.stateCard}>
            <Ionicons name="notifications-off-outline" size={22} color="#6B7280" />
            <Text style={styles.stateTitle}>열린 알림이 없습니다</Text>
            <Text style={styles.stateText}>새로운 보호 알림이 생기면 여기에서 확인할 수 있어요.</Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {error ? (
              <View style={styles.inlineErrorCard}>
                <Text style={styles.inlineErrorText}>{error}</Text>
              </View>
            ) : null}
            {alerts.map((item, index) => {
              const alertKey = `${item.id || item.type}-${item.created_at}-${index}`;

              return (
                <View
                  key={alertKey}
                  style={[styles.alertRow, index !== alerts.length - 1 && styles.withDivider]}
                >
                <View style={styles.alertIconWrap}>
                  <Ionicons name="notifications-outline" size={18} color="#F97316" />
                </View>
                <View style={styles.alertTextWrap}>
                  <View style={styles.alertHeader}>
                    <Text style={styles.alertTitle}>{item.message}</Text>
                    <View
                      style={[
                        styles.statusChip,
                        item.status === 'acknowledged'
                          ? styles.statusChipAcknowledged
                          : styles.statusChipOpen,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusChipText,
                          item.status === 'acknowledged'
                            ? styles.statusChipTextAcknowledged
                            : styles.statusChipTextOpen,
                        ]}
                      >
                        {item.status === 'acknowledged' ? '처리 중' : '새 알림'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.alertMeta}>{formatRelativeTime(item.created_at)}</Text>
                  <View style={styles.alertActionRow}>
                    <TouchableOpacity
                      style={styles.primaryButton}
                      activeOpacity={0.85}
                      disabled={activeAlertId === (item.id || `${item.type}-${item.created_at}`)}
                      onPress={() => void handleAlertStatusChange(item, 'resolved')}
                    >
                      {activeAlertId === (item.id || `${item.type}-${item.created_at}`) ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.primaryButtonText}>확인 완료</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  container: {
    padding: 20,
    paddingBottom: 36,
    backgroundColor: '#F3F4F6',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  topTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  topActionButton: {
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  topActionButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F97316',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 18,
  },
  heroLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F97316',
  },
  heroName: {
    marginTop: 6,
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  heroDescription: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: '#374151',
    fontWeight: '600',
  },
  stateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  stateText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
    fontWeight: '600',
    textAlign: 'center',
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inlineErrorCard: {
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inlineErrorText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#B91C1C',
    fontWeight: '700',
  },
  alertRow: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  alertIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTextWrap: {
    flex: 1,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  alertTitle: {
    fontSize: 15,
    lineHeight: 21,
    color: '#111827',
    fontWeight: '700',
    flex: 1,
  },
  alertMeta: {
    marginTop: 6,
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusChipOpen: {
    backgroundColor: '#FEF3C7',
  },
  statusChipAcknowledged: {
    backgroundColor: '#E5E7EB',
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  statusChipTextOpen: {
    color: '#B45309',
  },
  statusChipTextAcknowledged: {
    color: '#4B5563',
  },
  alertActionRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  primaryButton: {
    minWidth: 92,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#05B547',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  withDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
});

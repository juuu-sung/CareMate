import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export type SeniorBottomNavActive = 'home' | 'medication' | 'chat' | 'settings';

export type SeniorBottomNavParams = {
  parentId?: string;
  elderUserId?: string;
  parentName?: string;
  linkCode?: string;
  guardianPhone?: string;
  agentName?: string;
  agentVoice?: string;
  selectedVoice?: string;
};

type TabItem = {
  key: SeniorBottomNavActive;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const TABS: TabItem[] = [
  { key: 'home', label: '홈', icon: 'home' },
  { key: 'medication', label: '약', icon: 'medical' },
  { key: 'chat', label: '대화', icon: 'chatbubble-ellipses' },
  { key: 'settings', label: '설정', icon: 'settings' },
];

const ORANGE = '#EA580C';
const ORANGE_SOFT = '#FFEDD5';
const INACTIVE = '#64748B';

function compactParams(params: Record<string, string | undefined>) {
  return Object.entries(params).reduce<Record<string, string>>((result, [key, value]) => {
    const text = String(value || '').trim();

    if (text) {
      result[key] = text;
    }

    return result;
  }, {});
}

export function SeniorBottomNav({
  active,
  params,
}: {
  active: SeniorBottomNavActive;
  params?: SeniorBottomNavParams;
}) {
  const router = useRouter();

  const baseParams = compactParams({
    parentId: params?.parentId || params?.elderUserId,
    elderUserId: params?.elderUserId || params?.parentId,
    elder_user_id: params?.elderUserId || params?.parentId,
    parentName: params?.parentName,
    linkCode: params?.linkCode,
    link_code: params?.linkCode,
    guardianPhone: params?.guardianPhone,
    agentName: params?.agentName,
    agent_name: params?.agentName,
    selectedVoice: params?.selectedVoice || params?.agentVoice,
    agentVoice: params?.agentVoice || params?.selectedVoice,
    agent_voice: params?.agentVoice || params?.selectedVoice,
  });

  const handlePress = (key: SeniorBottomNavActive) => {
    if (key === active) {
      return;
    }

    if (key === 'home') {
      router.push({
        pathname: '/home',
        params: baseParams,
      });
      return;
    }

    if (key === 'medication') {
      router.push({
        pathname: '/elder-medication',
        params: baseParams,
      });
      return;
    }

    if (key === 'chat') {
      router.push({
        pathname: '/chat',
        params: {
          ...baseParams,
          input: 'voice',
          autostart: '0',
        },
      });
      return;
    }

    router.push('/settings');
  };

  return (
    <View style={styles.navWrap} pointerEvents="box-none">
      <View style={styles.navBar}>
        {TABS.map((tab) => {
          const isActive = active === tab.key;

          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => handlePress(tab.key)}
              activeOpacity={0.86}
              accessibilityRole="button"
              accessibilityLabel={`${tab.label} 화면으로 이동`}
            >
              <Ionicons
                name={tab.icon}
                size={isActive ? 25 : 23}
                color={isActive ? ORANGE : INACTIVE}
              />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    paddingHorizontal: 22,
  },
  navBar: {
    height: 86,
    borderRadius: 34,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  tabButton: {
    flex: 1,
    minHeight: 64,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  tabButtonActive: {
    backgroundColor: ORANGE_SOFT,
  },
  tabLabel: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '900',
    color: INACTIVE,
  },
  tabLabelActive: {
    color: ORANGE,
  },
});

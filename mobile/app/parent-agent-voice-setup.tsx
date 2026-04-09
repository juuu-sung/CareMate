import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

type VoiceOption = {
  id: string;
  name: string;
  gender: 'male' | 'female';
  tone: string;
  description: string;
  avatar: string;
};

export default function ParentAgentVoiceSetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parentId = String(params.parentId || params.elderUserId || params.elder_user_id || '');
  const parentName = String(params.parentName || '부모님');
  const linkCode = String(params.linkCode || params.link_code || '');

  const [selectedVoice, setSelectedVoice] = useState('');
  const [isPlaying, setIsPlaying] = useState<string | null>(null);

  const voiceOptions: VoiceOption[] = [
    {
      id: 'voice1',
      name: '따뜻한 여성',
      gender: 'female',
      tone: '따뜻함',
      description: '부드럽고 편안한 목소리',
      avatar: '여',
    },
    {
      id: 'voice2',
      name: '활기찬 여성',
      gender: 'female',
      tone: '활기참',
      description: '밝고 경쾌한 목소리',
      avatar: '여',
    },
    {
      id: 'voice3',
      name: '차분한 남성',
      gender: 'male',
      tone: '차분함',
      description: '안정적이고 신뢰감 있는 목소리',
      avatar: '남',
    },
    {
      id: 'voice4',
      name: '친근한 남성',
      gender: 'male',
      tone: '친근함',
      description: '다정하고 친숙한 목소리',
      avatar: '남',
    },
  ];

  const handlePlayVoice = (voiceId: string) => {
    setSelectedVoice(voiceId);
    setIsPlaying(voiceId);

    setTimeout(() => {
      setIsPlaying(null);
    }, 3000);
  };

  const handleNext = () => {
    if (!selectedVoice) {
      Alert.alert('선택 필요', '음성을 선택해주세요.');
      return;
    }

    router.push({
      pathname: '/parent-agent-name-setup',
      params: {
        parentId,
        elderUserId: parentId,
        parentName,
        linkCode,
        selectedVoice,
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.topIconWrap}>
            <Text style={styles.topIcon}>AI음성</Text>
          </View>

          <Text style={styles.title}>
            마음에 드는{'\n'}목소리를 골라주세요
          </Text>
          <Text style={styles.subtitle}>
            버튼을 누르면 목소리를 들을 수 있어요
          </Text>
        </View>

        <View style={styles.cardList}>
          {voiceOptions.map((voice) => {
            const selected = selectedVoice === voice.id;
            const playing = isPlaying === voice.id;

            return (
              <TouchableOpacity
                key={voice.id}
                style={[
                  styles.voiceCard,
                  selected && styles.voiceCardSelected,
                ]}
                activeOpacity={0.9}
                onPress={() => handlePlayVoice(voice.id)}
              >
                <View
                  style={[
                    styles.avatarWrap,
                    voice.gender === 'female'
                      ? styles.avatarFemale
                      : styles.avatarMale,
                  ]}
                >
                  <Text style={styles.avatarText}>{voice.avatar}</Text>
                </View>

                <View style={styles.voiceInfo}>
                  <Text style={styles.voiceName}>{voice.name}</Text>
                  <Text style={styles.voiceDesc}>{voice.description}</Text>

                  {playing && (
                    <Text style={styles.playingText}>재생 중...</Text>
                  )}
                </View>

                {selected && (
                  <View style={styles.selectedBadge}>
                    <Text style={styles.selectedBadgeText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[
            styles.nextButton,
            !selectedVoice && styles.nextButtonDisabled,
          ]}
          activeOpacity={0.85}
          onPress={handleNext}
        >
          <Text style={styles.nextButtonText}>다음으로</Text>
        </TouchableOpacity>

        {!selectedVoice && (
          <Text style={styles.helperText}>
            위 항목을 눌러 목소리를 선택해주세요
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EEF4FF',
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    backgroundColor: '#EEF4FF',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  topIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  topIcon: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  title: {
    textAlign: 'center',
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 42,
    marginBottom: 10,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 18,
    color: '#64748B',
    lineHeight: 26,
  },
  cardList: {
    gap: 16,
    marginBottom: 28,
  },
  voiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 20,
    borderWidth: 2,
    borderColor: '#DBEAFE',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  voiceCardSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  avatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarFemale: {
    backgroundColor: '#DBEAFE',
  },
  avatarMale: {
    backgroundColor: '#BFDBFE',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  voiceInfo: {
    flex: 1,
  },
  voiceName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  voiceDesc: {
    fontSize: 16,
    color: '#475569',
    lineHeight: 22,
  },
  playingText: {
    marginTop: 8,
    fontSize: 15,
    color: '#2563EB',
    fontWeight: '700',
  },
  selectedBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  selectedBadgeText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
  },
  nextButton: {
    height: 68,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  helperText: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 15,
    color: '#64748B',
  },
});
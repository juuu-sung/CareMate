import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function ParentAgentNameSetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parentId = String(params.parentId || params.elderUserId || params.elder_user_id || '');
  const parentName = String(params.parentName || '부모님');
  const linkCode = String(params.linkCode || params.link_code || '');
  const selectedVoice = String(params.selectedVoice || '');

  const [isPlayingIntro, setIsPlayingIntro] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recognizedName, setRecognizedName] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [isNameConfirmed, setIsNameConfirmed] = useState(false);

  const [guideText, setGuideText] = useState(
    '에이전트가 이름을 정해서 불러달라고 하면\n가운데 마이크 버튼을 눌러 이름을 말씀해주세요.'
  );

  useEffect(() => {
    playAgentVoiceIntro();
  }, []);

  const playAgentVoiceIntro = async () => {
    setIsPlayingIntro(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 1800));

      setGuideText(
        '에이전트가 이름을 기다리고 있습니다.\n마이크를 눌러 이름을 말씀해주세요.'
      );
    } catch (error) {
      console.log('인트로 음성 재생 오류:', error);
      setGuideText('마이크를 눌러 이름을 말씀해주세요.');
    } finally {
      setIsPlayingIntro(false);
    }
  };

  const handleMicPress = async () => {
    if (isPlayingIntro || isRecording || isConfirming || isNameConfirmed) {
      return;
    }

    setIsRecording(true);
    setGuideText('듣고 있습니다...\n이름을 또렷하게 말씀해주세요.');

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const detectedName = '동행이';

      setRecognizedName(detectedName);
      setIsRecording(false);

      await confirmAgentName(detectedName);
    } catch (error) {
      console.log('이름 인식 오류:', error);
      setIsRecording(false);
      setGuideText('이름을 잘 듣지 못했습니다.\n다시 한 번 마이크를 눌러 말씀해주세요.');
    }
  };

  const confirmAgentName = async (name: string) => {
    setIsConfirming(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 2200));

      setGuideText(`제 이름은 ${name}입니다.\n필요하실 때 제 이름을 부르고 말씀해주세요.`);
      setIsNameConfirmed(true);
    } catch (error) {
      console.log('이름 확인 음성 오류:', error);
      setGuideText(`제 이름은 ${name}입니다.\n필요하실 때 제 이름을 부르고 말씀해주세요.`);
      setIsNameConfirmed(true);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleGoHome = () => {
    console.log('홈으로 이동 params:', {
      elderUserId: parentId,
      parentName,
      linkCode,
      selectedVoice,
      agentName: recognizedName,
    });

    router.replace({
      pathname: '/home',
      params: {
        elderUserId: parentId,
        elder_user_id: parentId,
        parentName,
        linkCode,
        link_code: linkCode,
        selectedVoice,
        agentName: recognizedName,
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.topSection}>
          <Text style={styles.title}>에이전트 이름 정하기</Text>
          <Text style={styles.subtitle}>{guideText}</Text>
        </View>

        <View style={styles.centerSection}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.micButton,
              (isPlayingIntro || isRecording || isConfirming || isNameConfirmed) &&
                styles.micButtonDisabled,
            ]}
            onPress={handleMicPress}
            disabled={isPlayingIntro || isRecording || isConfirming || isNameConfirmed}
          >
            <Text style={styles.micIcon}>🎤</Text>
          </TouchableOpacity>

          {isPlayingIntro && (
            <View style={styles.statusBox}>
              <ActivityIndicator size="small" />
              <Text style={styles.statusText}>에이전트가 말하고 있습니다...</Text>
            </View>
          )}

          {isRecording && (
            <View style={styles.statusBox}>
              <ActivityIndicator size="small" />
              <Text style={styles.statusText}>이름을 듣고 있습니다...</Text>
            </View>
          )}

          {isConfirming && (
            <View style={styles.statusBox}>
              <ActivityIndicator size="small" />
              <Text style={styles.statusText}>이름을 설정하고 있습니다...</Text>
            </View>
          )}

          {!!recognizedName && !isConfirming && (
            <View style={styles.nameBadge}>
              <Text style={styles.nameBadgeLabel}>설정된 이름</Text>
              <Text style={styles.nameBadgeText}>{recognizedName}</Text>
            </View>
          )}

          {isNameConfirmed && (
            <TouchableOpacity style={styles.homeButton} onPress={handleGoHome}>
              <Text style={styles.homeButtonText}>홈 화면으로 가기</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.bottomSection}>
          {!isNameConfirmed && (
            <Text style={styles.helperText}>
              마이크 버튼을 누른 뒤{'\n'}에이전트 이름을 불러주세요
            </Text>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EEF4FF',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: 'space-between',
  },
  topSection: {
    alignItems: 'center',
    marginTop: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 17,
    lineHeight: 26,
    color: '#475569',
    textAlign: 'center',
  },
  centerSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  micButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#4F7CFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F7CFF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 10,
  },
  micButtonDisabled: {
    opacity: 0.7,
  },
  micIcon: {
    fontSize: 68,
  },
  statusBox: {
    marginTop: 28,
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    marginTop: 10,
    fontSize: 15,
    color: '#475569',
    textAlign: 'center',
  },
  nameBadge: {
    marginTop: 28,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    minWidth: 180,
  },
  nameBadgeLabel: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 6,
  },
  nameBadgeText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  homeButton: {
    marginTop: 28,
    backgroundColor: '#2563EB',
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 16,
    minWidth: 220,
    alignItems: 'center',
  },
  homeButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bottomSection: {
    alignItems: 'center',
    marginBottom: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  helperText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#64748B',
    textAlign: 'center',
  },
});
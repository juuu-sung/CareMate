import React, { useEffect, useRef, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  setAudioModeAsync,
  setIsAudioActiveAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";

import {
  buildChatTtsUrl,
  CHAT_TTS_VOICE_OPTIONS,
  TtsVoiceId,
  updateAgentProfile,
} from "@/services/chat";
import {
  buildParentAuthSession,
  saveAuthSession,
} from "@/services/authSession";

export default function ParentAgentVoiceSetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parentId = String(
    params.parentId || params.elderUserId || params.elder_user_id || ""
  );
  const parentName = String(params.parentName || "부모님");
  const linkCode = String(params.linkCode || params.link_code || "");
  const guardianPhone = String(params.guardianPhone || params.guardian_phone || "");
  const currentAgentName = String(params.agentName || params.agent_name || "케어");
  const returnTo = String(params.returnTo || "");
  const isEditMode = returnTo === "settings";
  const initialVoice = String(params.selectedVoice || "") as TtsVoiceId | "";

  const [selectedVoice, setSelectedVoice] = useState<TtsVoiceId | "">(
    initialVoice
  );
  const [isPlaying, setIsPlaying] = useState<TtsVoiceId | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<TtsVoiceId | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const player = useAudioPlayer(null, { downloadFirst: true });
  const playerStatus = useAudioPlayerStatus(player);
  const pendingVoiceRef = useRef<TtsVoiceId | null>(null);

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {}
      void setAudioModeAsync({ allowsRecording: false });
    };
  }, [player]);

  useEffect(() => {
    if (!playerStatus.playing) {
      setIsPlaying(null);
    }
  }, [playerStatus.playing]);

  useEffect(() => {
    if (!playerStatus.isLoaded || playerStatus.playing) {
      return;
    }

    const pendingVoice = pendingVoiceRef.current;
    if (!pendingVoice) {
      return;
    }

    pendingVoiceRef.current = null;

    void setIsAudioActiveAsync(true)
      .then(() => {
        player.seekTo(0).catch(() => {});
        player.play();
        setIsPlaying(pendingVoice);
      })
      .catch(() => {
        setIsPlaying(null);
        Alert.alert("재생 실패", "음성 미리듣기를 재생하지 못했습니다.");
      });
  }, [player, playerStatus.isLoaded, playerStatus.playing]);

  const stopPreview = async () => {
    try {
      pendingVoiceRef.current = null;
      player.pause();
    } catch {
    } finally {
      setIsPlaying(null);
    }
  };

  const handlePlayVoice = async (voiceId: TtsVoiceId) => {
    try {
      setSelectedVoice(voiceId);
      setLoadingVoiceId(voiceId);
      setIsPlaying(null);

      await stopPreview();

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });

      await setIsAudioActiveAsync(true);

      const previewText = `${parentName}님, 안녕하세요.`;

      pendingVoiceRef.current = voiceId;
      player.replace(buildChatTtsUrl(previewText, "basic", voiceId));
    } catch {
      pendingVoiceRef.current = null;
      setIsPlaying(null);
      Alert.alert("재생 실패", "음성 미리듣기를 재생하지 못했습니다.");
    } finally {
      setLoadingVoiceId(null);
    }
  };

  const handleNext = async () => {
    if (!selectedVoice) {
      Alert.alert("선택 필요", "음성을 선택해주세요.");
      return;
    }

    if (!parentId) {
      Alert.alert("저장 실패", "어르신 정보가 없어 목소리를 저장할 수 없습니다.");
      return;
    }

    try {
      setIsSaving(true);
      await stopPreview();

      await updateAgentProfile({
        elder_user_id: parentId,
        agent_voice: selectedVoice,
      });

      if (isEditMode) {
        await saveAuthSession(
          buildParentAuthSession({
            parentId,
            elderUserId: parentId,
            parentName,
            linkCode,
            guardianPhone,
            agentName: currentAgentName,
            agentVoice: selectedVoice,
          })
        );
        router.replace("/settings");
        return;
      }

      router.push({
        pathname: "/parent-agent-name-setup",
        params: {
          parentId,
          elderUserId: parentId,
          parentName,
          linkCode,
          guardianPhone,
          selectedVoice,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "목소리 저장 중 오류가 발생했습니다.";
      Alert.alert("저장 실패", message);
    } finally {
      setIsSaving(false);
    }
  };

  const getToneStyle = (tone?: string) => {
    const normalizedTone = String(tone || "").trim();

    if (
      normalizedTone.includes("부드") ||
      normalizedTone.includes("따뜻") ||
      normalizedTone.includes("포근")
    ) {
      return styles.avatarSoft;
    }

    if (
      normalizedTone.includes("차분") ||
      normalizedTone.includes("안정") ||
      normalizedTone.includes("신뢰")
    ) {
      return styles.avatarCalm;
    }

    if (
      normalizedTone.includes("밝") ||
      normalizedTone.includes("경쾌") ||
      normalizedTone.includes("활기")
    ) {
      return styles.avatarBright;
    }

    if (
      normalizedTone.includes("또렷") ||
      normalizedTone.includes("명확") ||
      normalizedTone.includes("선명")
    ) {
      return styles.avatarClear;
    }

    return styles.avatarNeutral;
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
            {isEditMode ? "에이전트 목소리 바꾸기" : "마음에 드는\n목소리를 골라주세요"}
          </Text>
          <Text style={styles.subtitle}>
            {isEditMode
              ? `${currentAgentName || "에이전트"}의 새 목소리를 고를 수 있어요\n목소리가 바로 나오지 않는다면 조금만 기다려주세요`
              : "각 목소리의 느낌을 듣고 편하게 선택하실 수 있어요\n목소리가 바로 나오지 않는다면 조금만 기다려주세요"}
          </Text>
        </View>

        <View style={styles.cardList}>
          {CHAT_TTS_VOICE_OPTIONS.map((voice) => {
            const selected = selectedVoice === voice.id;
            const playing = isPlaying === voice.id;
            const loading = loadingVoiceId === voice.id;

            return (
              <TouchableOpacity
                key={voice.id}
                style={[
                  styles.voiceCard,
                  selected && styles.voiceCardSelected,
                ]}
                activeOpacity={0.9}
                onPress={() => void handlePlayVoice(voice.id)}
                disabled={loading || isSaving}
              >
                <View
                  style={[
                    styles.avatarWrap,
                    getToneStyle(voice.tone),
                  ]}
                >
                  <Text style={styles.avatarText}>{voice.avatar}</Text>
                </View>

                <View style={styles.voiceInfo}>
                  <View style={styles.voiceTitleRow}>
                    <Text style={styles.voiceName}>{voice.name}</Text>
                    <View style={styles.toneChip}>
                      <Text style={styles.toneChipText}>{voice.tone}</Text>
                    </View>
                  </View>

                  <Text style={styles.voiceDesc}>{voice.description}</Text>

                  {loading ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" />
                      <Text style={styles.loadingText}>불러오는 중...</Text>
                    </View>
                  ) : playing ? (
                    <Text style={styles.playingText}>재생 중...</Text>
                  ) : (
                    <Text style={styles.previewHint}>눌러서 미리듣기</Text>
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
            (!selectedVoice || isSaving) && styles.nextButtonDisabled,
          ]}
          activeOpacity={0.85}
          onPress={() => void handleNext()}
          disabled={!selectedVoice || isSaving}
        >
          {isSaving ? (
            <View style={styles.nextButtonLoadingRow}>
              <ActivityIndicator color="#FFFFFF" size="small" />
              <Text style={styles.nextButtonText}> 저장 중...</Text>
            </View>
          ) : (
            <Text style={styles.nextButtonText}>
              {isEditMode ? "변경 저장하기" : "다음으로"}
            </Text>
          )}
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
    backgroundColor: "#EEF4FF",
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    backgroundColor: "#EEF4FF",
  },
  header: {
    alignItems: "center",
    marginBottom: 28,
  },
  topIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#3B82F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  topIcon: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
  },
  title: {
    textAlign: "center",
    fontSize: 32,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 42,
    marginBottom: 10,
  },
  subtitle: {
    textAlign: "center",
    fontSize: 18,
    color: "#64748B",
    lineHeight: 26,
  },
  cardList: {
    gap: 16,
    marginBottom: 28,
  },
  voiceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 20,
    borderWidth: 2,
    borderColor: "#DBEAFE",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  voiceCardSelected: {
    borderColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
  },
  avatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  avatarSoft: {
    backgroundColor: "#FCE7F3",
  },
  avatarCalm: {
    backgroundColor: "#E0F2FE",
  },
  avatarBright: {
    backgroundColor: "#FEF3C7",
  },
  avatarClear: {
    backgroundColor: "#DCFCE7",
  },
  avatarNeutral: {
    backgroundColor: "#E2E8F0",
  },
  avatarText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1D4ED8",
  },
  voiceInfo: {
    flex: 1,
  },
  voiceTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
    flexWrap: "wrap",
  },
  voiceName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
  },
  toneChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#E0ECFF",
  },
  toneChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
  },
  voiceDesc: {
    fontSize: 16,
    color: "#475569",
    lineHeight: 22,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 15,
    color: "#475569",
    fontWeight: "700",
  },
  playingText: {
    marginTop: 8,
    fontSize: 15,
    color: "#2563EB",
    fontWeight: "700",
  },
  previewHint: {
    marginTop: 8,
    fontSize: 15,
    color: "#64748B",
    fontWeight: "600",
  },
  selectedBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#3B82F6",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },
  selectedBadgeText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
  },
  nextButton: {
    height: 68,
    borderRadius: 20,
    backgroundColor: "#3B82F6",
    justifyContent: "center",
    alignItems: "center",
  },
  nextButtonDisabled: {
    backgroundColor: "#93C5FD",
  },
  nextButtonLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  nextButtonText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },
  helperText: {
    marginTop: 14,
    textAlign: "center",
    fontSize: 15,
    color: "#64748B",
  },
});

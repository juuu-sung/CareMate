import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import {
  buildParentAuthSession,
  saveAuthSession,
} from "@/services/authSession";
import {
  buildChatTtsUrl,
  sendChatSpeech,
  TtsVoiceId,
  updateAgentProfile,
} from "@/services/chat";

export default function ParentAgentNameSetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parentId = String(
    params.parentId || params.elderUserId || params.elder_user_id || ""
  );
  const parentName = String(params.parentName || "부모님");
  const linkCode = String(params.linkCode || params.link_code || "");
  const selectedVoice = String(params.selectedVoice || "") as TtsVoiceId | "";

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const player = useAudioPlayer(null, { downloadFirst: true });
  const playerStatus = useAudioPlayerStatus(player);

  const playerStatusRef = useRef<any>(null);
  const introHasStartedRef = useRef(false);
  const isMountedRef = useRef(true);
  const speechTokenRef = useRef(0);

  const [isPlayingIntro, setIsPlayingIntro] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recognizedName, setRecognizedName] = useState("");
  const [recognizedRawText, setRecognizedRawText] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [isNameConfirmed, setIsNameConfirmed] = useState(false);
  const [hasRecordingPermission, setHasRecordingPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [guideText, setGuideText] = useState(
    "에이전트가 이름을 정해달라고 말씀드릴 예정입니다.\n잠시만 기다려주세요."
  );

  const introText = useMemo(
    () => "제 이름을 정해주세요. 제가 어떻게 불리면 좋을지 말씀해주세요.",
    []
  );

  useEffect(() => {
    playerStatusRef.current = playerStatus;
  }, [playerStatus]);

  useEffect(() => {
    isMountedRef.current = true;
    void playAgentVoiceIntro();

    return () => {
      isMountedRef.current = false;
      void stopPlayerSafely();
      void setAudioModeAsync({ allowsRecording: false });
    };
  }, []);

  useEffect(() => {
    if (!isPlayingIntro) {
      return;
    }

    if (playerStatus?.playing) {
      introHasStartedRef.current = true;
      return;
    }

    if (introHasStartedRef.current && !playerStatus?.playing) {
      setIsPlayingIntro(false);
      setGuideText(
        "에이전트가 이름을 기다리고 있습니다.\n마이크를 눌러 원하는 이름을 말씀해주세요."
      );
    }
  }, [isPlayingIntro, playerStatus?.playing]);

  const sleep = (ms: number) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  const stopPlayerSafely = async () => {
    try {
      player.pause();
    } catch {}
    await sleep(120);
  };

  const waitForPlaybackToStart = async (timeoutMs = 5000) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (playerStatusRef.current?.playing) {
        return true;
      }
      await sleep(80);
    }

    return false;
  };

  const waitForPlaybackToEnd = async (timeoutMs = 15000) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (!playerStatusRef.current?.playing) {
        await sleep(150);
        return true;
      }
      await sleep(100);
    }

    return false;
  };

  const playTts = async (text: string, waitUntilEnd = false) => {
    const myToken = Date.now();
    speechTokenRef.current = myToken;

    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: "doNotMix",
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });

    await setIsAudioActiveAsync(true);
    await stopPlayerSafely();

    const url = buildChatTtsUrl(text, "basic", selectedVoice || undefined);

    player.replace(url);

    await sleep(450);

    try {
      await player.seekTo(0);
    } catch {}

    await player.play();

    const started = await waitForPlaybackToStart(5000);
    if (!started) {
      throw new Error("음성 재생이 시작되지 않았습니다.");
    }

    if (speechTokenRef.current !== myToken) {
      return;
    }

    if (waitUntilEnd) {
      await waitForPlaybackToEnd(20000);
    }
  };

  const playAgentVoiceIntro = async () => {
    setError(null);
    setIsPlayingIntro(true);
    setGuideText("에이전트가 이름을 정해달라고 말씀드리고 있습니다.");
    introHasStartedRef.current = false;

    try {
      await playTts(introText, false);
    } catch (introError) {
      if (!isMountedRef.current) {
        return;
      }

      setIsPlayingIntro(false);
      setGuideText("마이크를 눌러 에이전트 이름을 말씀해주세요.");
      setError(
        introError instanceof Error
          ? introError.message
          : "안내 음성을 재생하지 못했습니다."
      );
    }
  };

  const handleMicPress = async () => {
    if (isPlayingIntro || isRecording || isConfirming || isNameConfirmed || isSaving) {
      return;
    }

    setError(null);

    try {
      await stopPlayerSafely();

      const permission = await requestRecordingPermissionsAsync();
      setHasRecordingPermission(permission.granted);

      if (!permission.granted) {
        setError("마이크 권한이 필요합니다. 권한을 허용한 뒤 다시 시도해주세요.");
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();

      setIsRecording(true);
      setGuideText("듣고 있습니다...\n원하는 이름을 또렷하게 말씀해주세요.");
    } catch (recordingError) {
      setIsRecording(false);
      setError(
        recordingError instanceof Error
          ? recordingError.message
          : "녹음을 시작하지 못했습니다."
      );
      setGuideText("마이크를 눌러 다시 말씀해주세요.");
    }
  };

  const handleStopRecording = async () => {
    if (!recorderState.isRecording || isConfirming || isSaving) {
      return;
    }

    setError(null);
    setIsConfirming(true);
    setGuideText("이름을 확인하고 있습니다...");

    try {
      await recorder.stop();

      setIsRecording(false);

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });

      await setIsAudioActiveAsync(true);

      const status = recorder.getStatus();
      const fileUri = status.url;

      if (!fileUri) {
        throw new Error("녹음 파일을 찾을 수 없습니다.");
      }

      await sleep(500);

      const response = await sendChatSpeech({
        fileUri,
        fileName: `agent-name-${Date.now()}.m4a`,
        mimeType: "audio/m4a",
        mode: "basic",
        audioFormat: "m4a",
        audioDurationMs: status.durationMillis,
        clientMessageId: `agent-name-${Date.now()}`,
        transcriptVisibility: "always",
      });

      const transcript = String(response.transcript || "").trim();
      const parsedName = extractAgentName(transcript);

      if (!parsedName) {
        setRecognizedRawText(transcript);
        setGuideText(
          "이름을 정확히 확인하지 못했습니다.\n다시 한 번 천천히 이름을 말씀해주세요."
        );
        setIsConfirming(false);
        return;
      }

      setRecognizedRawText(transcript);
      setRecognizedName(parsedName);

      await confirmAgentName(parsedName);
    } catch (sttError) {
      setGuideText("이름을 잘 듣지 못했습니다.\n다시 한 번 마이크를 눌러 말씀해주세요.");
      setError(
        sttError instanceof Error ? sttError.message : "이름 인식 중 오류가 발생했습니다."
      );
      setIsConfirming(false);
      setIsRecording(false);
    }
  };

  const confirmAgentName = async (name: string) => {
    try {
      const confirmText = `제 이름은 ${name}입니다. 필요하실 때 제 이름을 불러주세요.`;

      setGuideText(`제 이름은 ${name}입니다.\n필요하실 때 제 이름을 불러주세요.`);
      await sleep(250);
      await playTts(confirmText, true);

      setIsNameConfirmed(true);
    } catch (confirmError) {
      setGuideText(`제 이름은 ${name}입니다.\n필요하실 때 제 이름을 불러주세요.`);
      setIsNameConfirmed(true);
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "이름 확인 음성을 재생하지 못했습니다."
      );
    } finally {
      setIsConfirming(false);
      setIsRecording(false);
    }
  };

  const handleGoHome = async () => {
    if (!parentId) {
      setError("어르신 ID가 없어 이름을 저장할 수 없습니다.");
      return;
    }

    if (!recognizedName) {
      setError("에이전트 이름이 아직 정해지지 않았습니다.");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      await updateAgentProfile({
        elder_user_id: parentId,
        agent_name: recognizedName,
        agent_voice: selectedVoice || undefined,
      });

      try {
        await saveAuthSession(
          buildParentAuthSession({
            parentId,
            elderUserId: parentId,
            parentName,
            linkCode,
          })
        );
      } catch (sessionError) {
        console.log("부모님 가입 세션 저장 오류:", sessionError);
      }

      router.replace({
        pathname: "/home",
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
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "에이전트 이름 저장 중 오류가 발생했습니다."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.topSection}>
          <Text style={styles.title}>에이전트 이름 정하기</Text>
          <Text style={styles.subtitle}>{guideText}</Text>
        </View>

        <View style={styles.centerSection}>
          {!isRecording ? (
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.micButton,
                (isPlayingIntro || isConfirming || isNameConfirmed || isSaving) &&
                  styles.micButtonDisabled,
              ]}
              onPress={() => void handleMicPress()}
              disabled={isPlayingIntro || isConfirming || isNameConfirmed || isSaving}
            >
              <Text style={styles.micIcon}>🎤</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.stopButton, (isConfirming || isSaving) && styles.micButtonDisabled]}
              onPress={() => void handleStopRecording()}
              disabled={isConfirming || isSaving}
            >
              <Text style={styles.stopButtonText}>이름 전송하기</Text>
            </TouchableOpacity>
          )}

          {isPlayingIntro && (
            <View style={styles.statusBox}>
              <ActivityIndicator size="small" />
              <Text style={styles.statusText}>선택한 목소리로 안내 중입니다...</Text>
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

          {isSaving && (
            <View style={styles.statusBox}>
              <ActivityIndicator size="small" />
              <Text style={styles.statusText}>이름과 목소리를 DB에 저장하고 있습니다...</Text>
            </View>
          )}

          {!!recognizedName && !isConfirming && (
            <View style={styles.nameBadge}>
              <Text style={styles.nameBadgeLabel}>설정된 이름</Text>
              <Text style={styles.nameBadgeText}>{recognizedName}</Text>
              {!!recognizedRawText && recognizedRawText !== recognizedName && (
                <Text style={styles.nameSubText}>입력 인식: {recognizedRawText}</Text>
              )}
            </View>
          )}

          {isNameConfirmed && (
            <TouchableOpacity
              style={[styles.homeButton, isSaving && styles.micButtonDisabled]}
              onPress={() => void handleGoHome()}
              disabled={isSaving}
            >
              <Text style={styles.homeButtonText}>
                {isSaving ? "저장 중..." : "홈 화면으로 가기"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.bottomSection}>
          {hasRecordingPermission === false ? (
            <Text style={styles.errorText}>
              마이크 권한이 꺼져 있습니다. 권한을 허용해 주세요.
            </Text>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {!isNameConfirmed && !error && (
            <Text style={styles.helperText}>
              앞에서 선택한 목소리로 이름을 물어본 뒤{"\n"}
              원하시는 이름과 목소리를 저장합니다
            </Text>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function extractAgentName(transcript: string) {
  const raw = transcript.trim();

  if (!raw) {
    return "";
  }

  const normalized = raw
    .replace(/[,.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    /(?:이름은|이름은요|제 이름은|이름이)\s*([가-힣A-Za-z0-9]{1,12})/,
    /([가-힣A-Za-z0-9]{1,12})(?:야|아|이야|입니다|예요|로 해줘|로 해 주세요|로 불러줘|로 불러 주세요)/,
    /^([가-힣A-Za-z0-9]{1,12})$/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return sanitizeAgentName(match[1]);
    }
  }

  const tokens = normalized.split(" ").filter(Boolean);

  for (const token of tokens) {
    const cleaned = sanitizeAgentName(token);
    if (cleaned) {
      return cleaned;
    }
  }

  return "";
}

function sanitizeAgentName(name: string) {
  return name
    .replace(/(야|아|이야|예요|입니다)$/g, "")
    .replace(/[^가-힣A-Za-z0-9]/g, "")
    .trim()
    .slice(0, 12);
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#EEF4FF",
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: "space-between",
  },
  topSection: {
    alignItems: "center",
    marginTop: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 17,
    lineHeight: 26,
    color: "#475569",
    textAlign: "center",
  },
  centerSection: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  micButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "#4F7CFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#4F7CFF",
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
  stopButton: {
    minWidth: 220,
    height: 64,
    borderRadius: 18,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  stopButtonText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  statusBox: {
    marginTop: 28,
    alignItems: "center",
  },
  statusText: {
    marginTop: 10,
    fontSize: 15,
    color: "#475569",
    textAlign: "center",
  },
  nameBadge: {
    marginTop: 28,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    minWidth: 220,
  },
  nameBadgeLabel: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 6,
  },
  nameBadgeText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
  },
  nameSubText: {
    marginTop: 8,
    fontSize: 13,
    color: "#64748B",
  },
  homeButton: {
    marginTop: 28,
    backgroundColor: "#2563EB",
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 16,
    minWidth: 220,
    alignItems: "center",
  },
  homeButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  bottomSection: {
    alignItems: "center",
    marginBottom: 8,
    minHeight: 72,
    justifyContent: "center",
  },
  helperText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#64748B",
    textAlign: "center",
  },
  errorText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#DC2626",
    textAlign: "center",
  },
});
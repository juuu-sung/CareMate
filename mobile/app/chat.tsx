import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

import { buildChatTtsUrl, getChatHistory, sendChatMessage, sendChatSpeech } from '@/services/chat';
import { getCurrentMode } from '@/services/modes';
import { CareMode } from '@/types/care';

type ChatBubble = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  meta?: string;
  createdAt?: string;
};

export default function ChatPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ input?: string; autostart?: string }>();
  const isVoiceMode = params.input === 'voice';
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const player = useAudioPlayer(null, { downloadFirst: true });
  const playerStatus = useAudioPlayerStatus(player);
  const hasAttemptedAutoRecordingRef = useRef(false);
  const [mode, setMode] = useState<CareMode>('basic');
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [ttsMessageId, setTtsMessageId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingMode, setIsLoadingMode] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasRecordingPermission, setHasRecordingPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatBubble[]>(() =>
    isVoiceMode
      ? [
          {
            id: 'welcome',
            role: 'assistant',
            text: '안녕하세요. 일정이나 약 시간을 물어보시면 바로 확인해드릴게요.',
            meta: '기본 안내',
          },
        ]
      : []
  );

  useEffect(() => {
    let mounted = true;

    const loadMode = async () => {
      try {
        const currentMode = await getCurrentMode();
        if (!mounted) {
          return;
        }
        setMode(currentMode.mode);
      } catch {
        if (!mounted) {
          return;
        }
        setMode('basic');
      } finally {
        if (mounted) {
          setIsLoadingMode(false);
        }
      }
    };

    void loadMode();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {
        // `useAudioPlayer` cleanup can release the native object before this callback runs.
      }
      void setAudioModeAsync({ allowsRecording: false });
    };
  }, [player]);

  useEffect(() => {
    if (playerStatus.playing) {
      return;
    }

    setTtsMessageId(null);
  }, [playerStatus.playing]);

  useEffect(() => {
    if (!isVoiceMode || params.autostart !== '1') {
      return;
    }
    if (isLoadingMode || recorderState.isRecording || isUploadingVoice) {
      return;
    }
    if (hasAttemptedAutoRecordingRef.current) {
      return;
    }

    hasAttemptedAutoRecordingRef.current = true;
    void handleStartRecording();
  }, [isLoadingMode, isUploadingVoice, isVoiceMode, params.autostart, recorderState.isRecording]);

  const loadHistory = useCallback(async () => {
    if (isVoiceMode) {
      return;
    }

    try {
      setIsLoadingHistory(true);
      setError(null);
      const response = await getChatHistory();
      const historyMessages: ChatBubble[] = response.items.map((item, index) => ({
        id: `history-${item.created_at}-${index}`,
        role: item.role,
        text: item.content,
        meta: `${formatHistoryTimestamp(item.created_at)} · ${formatModeLabel(item.mode)}`,
        createdAt: item.created_at,
      }));
      setMessages(historyMessages);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : '대화 기록을 불러오지 못했습니다.');
    } finally {
      setIsLoadingHistory(false);
    }
  }, [isVoiceMode]);

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
      return undefined;
    }, [loadHistory])
  );

  const handleSend = async () => {
    const trimmedDraft = draft.trim();

    if (!trimmedDraft || isSending) {
      return;
    }

    const userMessage: ChatBubble = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmedDraft,
    };

    setMessages((prev) => [...prev, userMessage]);
    setDraft('');
    setError(null);
    setIsSending(true);

    try {
      const response = await sendChatMessage({
        text: trimmedDraft,
        mode,
        context_source: 'text',
        client_message_id: `mobile-${Date.now()}`,
        session_id: sessionId ?? undefined,
      });
      setSessionId(response.session_id ?? null);

      const assistantMessage: ChatBubble = {
        id: `assistant-${Date.now()}`,
        role: response.confirmation_needed ? 'system' : 'assistant',
        text: response.confirmation_needed
          ? response.clarification_question ?? '다시 한 번 말씀해 주세요.'
          : response.answer,
        meta: formatResponseMeta(response),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      await playTtsForMessage(assistantMessage.id, assistantMessage.text);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : '대화 요청 중 오류가 발생했습니다.');
    } finally {
      setIsSending(false);
    }
  };

  const handleStartRecording = async () => {
    if (isUploadingVoice || recorderState.isRecording) {
      return;
    }

    setError(null);

    try {
      const permission = await requestRecordingPermissionsAsync();
      setHasRecordingPermission(permission.granted);

      if (!permission.granted) {
        setError('마이크 권한이 필요합니다. 권한을 허용한 뒤 다시 시도해주세요.');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (recordingError) {
      setError(recordingError instanceof Error ? recordingError.message : '녹음을 시작하지 못했습니다.');
    }
  };

  const handleStopAndUploadRecording = async () => {
    if (!recorderState.isRecording || isUploadingVoice) {
      return;
    }

    setIsUploadingVoice(true);
    setError(null);

    try {
      await recorder.stop();
      const status = recorder.getStatus();
      const fileUri = status.url;

      if (!fileUri) {
        throw new Error('녹음 파일을 찾을 수 없습니다.');
      }

      const response = await sendChatSpeech({
        fileUri,
        fileName: `caremate-recording-${Date.now()}.m4a`,
        mimeType: 'audio/m4a',
        mode,
        audioFormat: 'm4a',
        audioDurationMs: status.durationMillis,
        clientMessageId: `voice-${Date.now()}`,
        sessionId: sessionId ?? undefined,
        transcriptVisibility: 'on_low_confidence',
      });
      setSessionId(response.session_id ?? null);

      const transcriptBubble: ChatBubble = {
        id: `voice-transcript-${Date.now()}`,
        role: 'user',
        text: response.transcript,
        meta: `음성 전사 · confidence ${response.stt_confidence.toFixed(2)}`,
      };

      const assistantBubble: ChatBubble = {
        id: `voice-response-${Date.now()}`,
        role: response.confirmation_needed ? 'system' : 'assistant',
        text: response.confirmation_needed
          ? response.clarification_question ?? '다시 한 번 말씀해 주세요.'
          : response.answer,
        meta: formatResponseMeta(response),
      };

      setMessages((prev) => [...prev, transcriptBubble, assistantBubble]);
      await playTtsForMessage(assistantBubble.id, assistantBubble.text);
      if (isVoiceMode) {
        hasAttemptedAutoRecordingRef.current = false;
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '음성 업로드 중 오류가 발생했습니다.');
    } finally {
      await setAudioModeAsync({ allowsRecording: false });
      setIsUploadingVoice(false);
    }
  };

  const playTtsForMessage = async (messageId: string, text: string) => {
    const trimmedText = text.trim();

    if (!trimmedText) {
      return;
    }

    setError(null);
    setTtsMessageId(messageId);

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
      player.replace(buildChatTtsUrl(trimmedText, mode));
      player.play();
    } catch (ttsError) {
      setTtsMessageId(null);
      setError(ttsError instanceof Error ? ttsError.message : '음성 재생 중 오류가 발생했습니다.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>대화하기</Text>
        <Text style={styles.description}>
          {isVoiceMode
            ? '홈에서 바로 넘어왔습니다. 말씀하시면 전사와 답변을 이어서 확인할 수 있습니다.'
            : '이전에 주고받은 대화를 시간순으로 확인할 수 있습니다.'}
        </Text>

        <View style={styles.modeCard}>
          <Text style={styles.modeLabel}>현재 돌봄 모드</Text>
          {isLoadingMode ? (
            <ActivityIndicator size="small" color="#3B82F6" />
          ) : (
            <Text style={styles.modeValue}>{formatModeLabel(mode)}</Text>
          )}
        </View>

        {messages.map((message, index) => {
          const previousMessage = messages[index - 1];
          const shouldShowDayDivider =
            !isVoiceMode &&
            !!message.createdAt &&
            getHistoryDayKey(previousMessage?.createdAt) !== getHistoryDayKey(message.createdAt);

          return (
            <View key={message.id}>
              {shouldShowDayDivider ? (
                <View style={styles.dayDivider}>
                  <Text style={styles.dayDividerText}>{formatHistoryDayLabel(message.createdAt!)}</Text>
                </View>
              ) : null}
              <View
                style={[
                  styles.messageCard,
                  message.role === 'user' && styles.userMessageCard,
                  message.role === 'system' && styles.systemMessageCard,
                ]}
              >
                <Text style={styles.messageLabel}>{getRoleLabel(message.role)}</Text>
                <Text style={styles.messageText}>{message.text}</Text>
                {message.meta ? <Text style={styles.messageMeta}>{message.meta}</Text> : null}
                {message.role !== 'user' && message.text.trim() ? (
                  <TouchableOpacity
                    style={[styles.ttsButton, ttsMessageId === message.id && styles.ttsButtonActive]}
                    onPress={() => void playTtsForMessage(message.id, message.text)}
                  >
                    <Text style={styles.ttsButtonText}>
                      {ttsMessageId === message.id && playerStatus.playing ? '읽는 중...' : '음성으로 듣기'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        })}

        {!isVoiceMode && isLoadingHistory ? (
          <View style={styles.historyStateCard}>
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text style={styles.historyStateText}>대화 기록을 불러오는 중입니다.</Text>
          </View>
        ) : null}

        {!isVoiceMode && !isLoadingHistory && messages.length === 0 ? (
          <View style={styles.historyStateCard}>
            <Text style={styles.historyStateText}>아직 저장된 대화 기록이 없습니다.</Text>
          </View>
        ) : null}

        {isVoiceMode ? (
          <View style={styles.voiceCard}>
          <Text style={styles.inputLabel}>음성 대화</Text>
          <Text style={styles.voiceDescription}>
            {isVoiceMode
              ? '홈의 마이크 버튼을 눌러 바로 들어왔습니다. 녹음이 시작되면 말씀하시고, 끝나면 전송하세요.'
              : '마이크로 녹음한 음성을 `/chat/speech`로 보내 STT와 재확인 질문 흐름을 확인합니다.'}
          </Text>

          <View style={styles.voiceMetaRow}>
            <Text style={styles.voiceMetaLabel}>녹음 상태</Text>
            <Text style={styles.voiceMetaValue}>
              {recorderState.isRecording ? `${formatDuration(recorderState.durationMillis)} 녹음 중` : '대기 중'}
            </Text>
          </View>

          {hasRecordingPermission === false ? (
            <Text style={styles.errorText}>마이크 권한이 꺼져 있습니다. 권한을 허용해 주세요.</Text>
          ) : null}

          {!recorderState.isRecording ? (
            <TouchableOpacity
              style={[styles.voiceButton, isUploadingVoice && styles.voiceButtonDisabled]}
              onPress={() => void handleStartRecording()}
              disabled={isUploadingVoice}
            >
              <Text style={styles.voiceButtonText}>녹음 시작</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.stopButton, isUploadingVoice && styles.voiceButtonDisabled]}
              onPress={() => void handleStopAndUploadRecording()}
              disabled={isUploadingVoice}
            >
              <Text style={styles.voiceButtonText}>{isUploadingVoice ? '업로드 중...' : '녹음 종료 후 전송'}</Text>
            </TouchableOpacity>
          )}
          </View>
        ) : null}

        {isVoiceMode ? null : (
          <View style={styles.historyNoticeCard}>
            <Text style={styles.historyNoticeTitle}>대화 기록 보기</Text>
            <Text style={styles.historyNoticeText}>
              실제 대화는 홈의 ‘눌러서 말하기’ 버튼에서 바로 시작할 수 있습니다.
            </Text>
          </View>
        )}

        {isVoiceMode ? (
        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>질문 입력</Text>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="예: 오늘 병원 일정 있나요?"
            placeholderTextColor="#94A3B8"
            multiline
          />

          <TouchableOpacity
            style={[styles.sendButton, (!draft.trim() || isSending) && styles.sendButtonDisabled]}
            onPress={() => void handleSend()}
            disabled={!draft.trim() || isSending}
          >
            <Text style={styles.sendButtonText}>{isSending ? '보내는 중...' : '질문 보내기'}</Text>
          </TouchableOpacity>
        </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>이전으로</Text>
        </TouchableOpacity>
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
    padding: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    lineHeight: 25,
    color: '#475569',
    marginBottom: 20,
  },
  modeCard: {
    backgroundColor: '#DBEAFE',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 16,
  },
  modeLabel: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 6,
  },
  modeValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  messageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
  },
  userMessageCard: {
    backgroundColor: '#DCEBFF',
  },
  systemMessageCard: {
    backgroundColor: '#FEF3C7',
  },
  messageLabel: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 8,
    fontWeight: '700',
  },
  messageText: {
    fontSize: 18,
    color: '#0F172A',
    lineHeight: 28,
  },
  messageMeta: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748B',
  },
  ttsButton: {
    marginTop: 14,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#E0F2FE',
  },
  ttsButtonActive: {
    backgroundColor: '#BAE6FD',
  },
  ttsButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0C4A6E',
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  input: {
    minHeight: 96,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0F172A',
    textAlignVertical: 'top',
  },
  sendButton: {
    marginTop: 14,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  voiceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginTop: 12,
  },
  historyStateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  historyStateText: {
    fontSize: 16,
    color: '#475569',
  },
  dayDivider: {
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  dayDividerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  historyNoticeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginTop: 12,
  },
  historyNoticeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  historyNoticeText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#475569',
  },
  voiceDescription: {
    fontSize: 15,
    lineHeight: 24,
    color: '#475569',
  },
  voiceMetaRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voiceMetaLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  voiceMetaValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  voiceButton: {
    marginTop: 14,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#0EA5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceButtonDisabled: {
    backgroundColor: '#7DD3FC',
  },
  voiceButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  stopButton: {
    marginTop: 14,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    marginTop: 16,
    fontSize: 15,
    lineHeight: 22,
    color: '#DC2626',
  },
  backButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '600',
  },
});

function formatModeLabel(mode: CareMode) {
  if (mode === 'cognitive_support') {
    return '인지 지원 모드';
  }
  if (mode === 'health_support') {
    return '건강 관리 모드';
  }
  return '기본 모드';
}

function getRoleLabel(role: ChatBubble['role']) {
  if (role === 'user') {
    return '나';
  }
  if (role === 'system') {
    return '재확인';
  }
  return 'CareMate';
}

function formatDuration(durationMillis: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMillis / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatResponseMeta(response: {
  intent: string;
  mode: CareMode;
  provider?: string;
  stt_provider?: string;
  llm_provider?: string;
  pending_action?: string | null;
  missing_slots?: string[];
  awaiting_confirmation?: boolean;
}) {
  const providerLabel = response.provider ?? [response.stt_provider, response.llm_provider].filter(Boolean).join(' -> ');
  const fragments = [response.intent, providerLabel, response.mode].filter(Boolean);

  if (response.pending_action) {
    fragments.push(`action ${response.pending_action}`);
  }
  if (response.awaiting_confirmation) {
    fragments.push('confirm');
  }
  if (response.missing_slots && response.missing_slots.length > 0) {
    fragments.push(`missing ${response.missing_slots.join(', ')}`);
  }

  return fragments.join(' · ');
}

function formatHistoryTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}.${day} ${hours}:${minutes}`;
}

function formatHistoryDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const today = new Date();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((todayOnly.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) {
    return '오늘';
  }
  if (diffDays === 1) {
    return '어제';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function getHistoryDayKey(value?: string) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

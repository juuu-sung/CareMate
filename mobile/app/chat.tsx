import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
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
  setIsAudioActiveAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

import {
  buildChatTtsUrl,
  ChatPlaceItem,
  ChatSourceItem,
  getChatHistory,
  getPlaceStatus,
  sendChatMessage,
  sendChatSpeech,
} from '@/services/chat';
import { getCoordinatesForTextTurn, getCoordinatesForVoiceTurn } from '@/services/locationService';
import { getCurrentMode } from '@/services/modes';
import { CareMode } from '@/types/care';

type ChatBubble = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  meta?: string;
  createdAt?: string;
  places?: ChatPlaceItem[];
  sources?: ChatSourceItem[];
};

type VoiceUiState = 'idle' | 'listening' | 'processing' | 'needs_clarification' | 'awaiting_confirmation' | 'completed';

export default function ChatPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ input?: string; autostart?: string }>();
  const isVoiceMode = params.input === 'voice';
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const player = useAudioPlayer(null, { downloadFirst: true });
  const playerStatus = useAudioPlayerStatus(player);
  const hasAttemptedAutoRecordingRef = useRef(false);
  const pendingTtsRequestRef = useRef<{ messageId: string; text: string } | null>(null);
  const [mode, setMode] = useState<CareMode>('basic');
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [checkingPlaceKey, setCheckingPlaceKey] = useState<string | null>(null);
  const [ttsMessageId, setTtsMessageId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingMode, setIsLoadingMode] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasRecordingPermission, setHasRecordingPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceUiState, setVoiceUiState] = useState<VoiceUiState>('idle');
  const [showQuickConfirmation, setShowQuickConfirmation] = useState(false);
  const [selectedHistoryDay, setSelectedHistoryDay] = useState<string>('all');
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
    if (!playerStatus.isLoaded || playerStatus.playing) {
      return;
    }

    const pendingRequest = pendingTtsRequestRef.current;

    if (!pendingRequest || pendingRequest.messageId !== ttsMessageId) {
      return;
    }

    pendingTtsRequestRef.current = null;
    void setIsAudioActiveAsync(true)
      .then(() => {
        player.seekTo(0).catch(() => {
          // Some sources may not support seeking immediately after load.
        });
        player.play();
      })
      .catch((playbackError) => {
        setTtsMessageId(null);
        setError(playbackError instanceof Error ? playbackError.message : '음성 재생 중 오류가 발생했습니다.');
      });
  }, [player, playerStatus.isLoaded, playerStatus.playing, ttsMessageId]);

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
    await submitTextTurn(trimmedDraft);
    setDraft('');
  };

  const handleStartRecording = async () => {
    if (isUploadingVoice || recorderState.isRecording) {
      return;
    }

    setError(null);
    setShowQuickConfirmation(false);

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
      setVoiceUiState('listening');
    } catch (recordingError) {
      setError(recordingError instanceof Error ? recordingError.message : '녹음을 시작하지 못했습니다.');
      setVoiceUiState('idle');
    }
  };

  const handleStopAndUploadRecording = async () => {
    if (!recorderState.isRecording || isUploadingVoice) {
      return;
    }

    setIsUploadingVoice(true);
    setError(null);
    setShowQuickConfirmation(false);
    setVoiceUiState('processing');

    try {
      await recorder.stop();
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
      const status = recorder.getStatus();
      const fileUri = status.url;

      if (!fileUri) {
        throw new Error('녹음 파일을 찾을 수 없습니다.');
      }

      const voiceCoordinates = await getCoordinatesForVoiceTurn();
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
        ...(voiceCoordinates ?? {}),
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
        places: response.places,
      };

      setMessages((prev) => [...prev, transcriptBubble, assistantBubble]);
      applyVoiceResponseState(response);
      await playTtsForMessage(assistantBubble.id, assistantBubble.text);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '음성 업로드 중 오류가 발생했습니다.');
      setVoiceUiState('idle');
    } finally {
      setIsUploadingVoice(false);
    }
  };

  const submitTextTurn = async (text: string) => {
    const trimmedText = text.trim();

    if (!trimmedText || isSending) {
      return;
    }

    const userMessage: ChatBubble = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmedText,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setError(null);
    setIsSending(true);

    if (isVoiceMode) {
      setVoiceUiState('processing');
      setShowQuickConfirmation(false);
    }

    try {
      const coordinates = await getCoordinatesForTextTurn(trimmedText);
      const response = await sendChatMessage({
        text: trimmedText,
        mode,
        context_source: 'text',
        client_message_id: `mobile-${Date.now()}`,
        session_id: sessionId ?? undefined,
        ...(coordinates ?? {}),
      });
      setSessionId(response.session_id ?? null);

      const assistantMessage: ChatBubble = {
        id: `assistant-${Date.now()}`,
        role: response.confirmation_needed ? 'system' : 'assistant',
        text: response.confirmation_needed
          ? response.clarification_question ?? '다시 한 번 말씀해 주세요.'
          : response.answer,
        meta: formatResponseMeta(response),
        createdAt: new Date().toISOString(),
        places: response.places,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      if (isVoiceMode) {
        applyVoiceResponseState(response);
      }
      await playTtsForMessage(assistantMessage.id, assistantMessage.text);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : '대화 요청 중 오류가 발생했습니다.');
      if (isVoiceMode) {
        setVoiceUiState('idle');
      }
    } finally {
      setIsSending(false);
    }
  };

  const applyVoiceResponseState = (response: {
    confirmation_needed: boolean;
    awaiting_confirmation?: boolean;
    missing_slots?: string[];
    executed_action?: string | null;
  }) => {
    const hasMissingSlots = (response.missing_slots?.length ?? 0) > 0;
    const awaitingConfirmation = Boolean(response.awaiting_confirmation) && !hasMissingSlots;

    if (awaitingConfirmation) {
      setVoiceUiState('awaiting_confirmation');
      setShowQuickConfirmation(true);
      return;
    }

    if (response.confirmation_needed || hasMissingSlots) {
      setVoiceUiState('needs_clarification');
      setShowQuickConfirmation(false);
      return;
    }

    if (response.executed_action) {
      setVoiceUiState('completed');
      setShowQuickConfirmation(false);
      return;
    }

    setVoiceUiState('completed');
    setShowQuickConfirmation(false);
  };

  const playTtsForMessage = async (messageId: string, text: string) => {
    const trimmedText = text.trim();

    if (!trimmedText) {
      return;
    }

    setError(null);
    setTtsMessageId(messageId);

    try {
      player.pause();
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
      await setIsAudioActiveAsync(true);
      pendingTtsRequestRef.current = { messageId, text: trimmedText };
      player.replace(buildChatTtsUrl(trimmedText, mode));
      player.play();
    } catch (ttsError) {
      pendingTtsRequestRef.current = null;
      setTtsMessageId(null);
      setError(ttsError instanceof Error ? ttsError.message : '음성 재생 중 오류가 발생했습니다.');
    }
  };

  const handleOpenDirections = async (place: ChatPlaceItem) => {
    const encodedName = encodeURIComponent(place.name);
    const destination = `${place.latitude},${place.longitude}`;
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?daddr=${destination}&dirflg=d&q=${encodedName}`
        : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;

    try {
      await Linking.openURL(url);
    } catch {
      setError('길안내를 열지 못했습니다.');
    }
  };

  const handleCallPlace = async (place: ChatPlaceItem) => {
    const phone = (place.phone ?? "").trim();

    if (!phone) {
      setError('전화번호 정보가 없습니다.');
      return;
    }

    const telUrl = `tel:${phone.replace(/[^0-9+]/g, '')}`;

    try {
      const supported = await Linking.canOpenURL(telUrl);

      if (!supported) {
        setError('이 기기에서는 전화 연결을 열 수 없습니다.');
        return;
      }

      await Linking.openURL(telUrl);
    } catch {
      setError('전화 연결을 열지 못했습니다.');
    }
  };

  const handleCheckPlaceStatus = async (place: ChatPlaceItem) => {
    const placeKey = `${place.name}-${place.latitude}-${place.longitude}`;

    try {
      setCheckingPlaceKey(placeKey);
      setError(null);
      const response = await getPlaceStatus({
        place_name: place.name,
        address: place.address,
        phone: place.phone,
        place_url: place.place_url,
        latitude: place.latitude,
        longitude: place.longitude,
      });

      const statusMessage: ChatBubble = {
        id: `place-status-${Date.now()}`,
        role: 'assistant',
        text: `${place.name}: ${response.answer}`,
        meta: '웹 확인',
        createdAt: new Date().toISOString(),
        sources: response.sources,
      };

      setMessages((prev) => [...prev, statusMessage]);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : '영업중 확인 중 오류가 발생했습니다.');
    } finally {
      setCheckingPlaceKey(null);
    }
  };

  const handleOpenSource = async (source: ChatSourceItem) => {
    try {
      await Linking.openURL(source.url);
    } catch {
      setError('출처 링크를 열지 못했습니다.');
    }
  };

  const historyDayOptions = isVoiceMode ? [] : buildHistoryDayOptions(messages);
  const visibleMessages =
    isVoiceMode || selectedHistoryDay === 'all'
      ? messages
      : messages.filter((message) => getHistoryDayKey(message.createdAt) === selectedHistoryDay);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>대화하기</Text>
        <Text style={styles.description}>
          {isVoiceMode
            ? '홈에서 바로 넘어왔습니다. 말씀하시면 전사와 답변을 이어서 확인할 수 있습니다.'
            : '이전에 주고받은 대화를 날짜별로 골라 확인할 수 있습니다.'}
        </Text>

        <View style={styles.modeCard}>
          <Text style={styles.modeLabel}>현재 돌봄 모드</Text>
          {isLoadingMode ? (
            <ActivityIndicator size="small" color="#3B82F6" />
          ) : (
            <Text style={styles.modeValue}>{formatModeLabel(mode)}</Text>
          )}
        </View>

        {!isVoiceMode && historyDayOptions.length > 0 ? (
          <View style={styles.filterCard}>
            <Text style={styles.filterTitle}>날짜 선택</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterListContent}
            >
              {historyDayOptions.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.filterChip,
                    selectedHistoryDay === item.key && styles.filterChipActive,
                  ]}
                  onPress={() => setSelectedHistoryDay(item.key)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedHistoryDay === item.key && styles.filterChipTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {visibleMessages.map((message, index) => {
          const previousMessage = visibleMessages[index - 1];
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
                {message.places && message.places.length > 0 ? (
                  <View style={styles.placeButtonGroup}>
                    {message.places.map((place, placeIndex) => (
                      <View key={`${message.id}-place-${placeIndex}`} style={styles.placeCard}>
                        <Text style={styles.placeButtonTitle}>
                          {placeIndex + 1}. {place.name}
                        </Text>
                        <Text style={styles.placeButtonSubtitle}>
                          {place.distance_meters}m
                          {place.available_beds !== undefined && place.available_beds !== null
                            ? ` · 응급실 가능 ${place.available_beds}개`
                            : ''}
                          {place.phone ? ` · ${place.phone}` : ''}
                        </Text>
                        <View style={styles.placeActionRow}>
                          <TouchableOpacity
                            style={[styles.placeButton, styles.placeStatusButton]}
                            onPress={() => void handleCheckPlaceStatus(place)}
                            disabled={checkingPlaceKey === `${place.name}-${place.latitude}-${place.longitude}`}
                          >
                            <Text style={[styles.placeButtonActionText, styles.placeStatusButtonText]}>
                              {checkingPlaceKey === `${place.name}-${place.latitude}-${place.longitude}`
                                ? '확인 중...'
                                : '영업중 확인'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.placeButton}
                            onPress={() => void handleOpenDirections(place)}
                          >
                            <Text style={styles.placeButtonActionText}>길안내</Text>
                          </TouchableOpacity>
                          {place.phone ? (
                            <TouchableOpacity
                              style={[styles.placeButton, styles.placeCallButton]}
                              onPress={() => void handleCallPlace(place)}
                            >
                              <Text style={[styles.placeButtonActionText, styles.placeCallButtonText]}>전화하기</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
                {message.sources && message.sources.length > 0 ? (
                  <View style={styles.sourceButtonGroup}>
                    {message.sources.map((source, sourceIndex) => (
                      <TouchableOpacity
                        key={`${message.id}-source-${sourceIndex}`}
                        style={styles.sourceButton}
                        onPress={() => void handleOpenSource(source)}
                      >
                        <Text style={styles.sourceButtonText}>출처 {sourceIndex + 1}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
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

        {!isVoiceMode && !isLoadingHistory && messages.length > 0 && visibleMessages.length === 0 ? (
          <View style={styles.historyStateCard}>
            <Text style={styles.historyStateText}>선택한 날짜의 대화 기록이 없습니다.</Text>
          </View>
        ) : null}

        {isVoiceMode ? (
          <View style={styles.voiceCard}>
            <Text style={styles.inputLabel}>음성 대화</Text>
            <View style={[styles.voiceStatusCard, getVoiceStatusTone(voiceUiState).containerStyle]}>
              <Text style={[styles.voiceStatusTitle, getVoiceStatusTone(voiceUiState).titleStyle]}>
                {getVoiceStatusTitle(voiceUiState)}
              </Text>
              <Text style={[styles.voiceStatusDescription, getVoiceStatusTone(voiceUiState).descriptionStyle]}>
                {getVoiceStatusDescription({
                  voiceUiState,
                  durationMillis: recorderState.durationMillis,
                  latestPrompt: getLatestAssistantPrompt(messages),
                })}
              </Text>
            </View>

            {hasRecordingPermission === false ? (
              <Text style={styles.errorText}>마이크 권한이 꺼져 있습니다. 권한을 허용해 주세요.</Text>
            ) : null}

            {!recorderState.isRecording ? (
              <TouchableOpacity
                style={[styles.voiceButton, isUploadingVoice && styles.voiceButtonDisabled]}
                onPress={() => void handleStartRecording()}
                disabled={isUploadingVoice || isSending}
              >
                <Text style={styles.voiceButtonText}>다시 말씀하기</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.stopButton, isUploadingVoice && styles.voiceButtonDisabled]}
                onPress={() => void handleStopAndUploadRecording()}
                disabled={isUploadingVoice}
              >
                <Text style={styles.voiceButtonText}>{isUploadingVoice ? '확인 중...' : '말씀 완료 후 전송'}</Text>
              </TouchableOpacity>
            )}

            {showQuickConfirmation ? (
              <View style={styles.confirmationButtonRow}>
                <TouchableOpacity
                  style={[styles.confirmationButton, styles.confirmYesButton]}
                  onPress={() => void submitTextTurn('네')}
                  disabled={isSending || isUploadingVoice}
                >
                  <Text style={styles.confirmationButtonText}>네</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmationButton, styles.confirmNoButton]}
                  onPress={() => void submitTextTurn('아니오')}
                  disabled={isSending || isUploadingVoice}
                >
                  <Text style={styles.confirmationButtonText}>아니오</Text>
                </TouchableOpacity>
              </View>
            ) : null}
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

        {isVoiceMode ? null : (
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
        )}

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
  filterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 12,
  },
  filterTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  filterListContent: {
    gap: 10,
    paddingRight: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#BFDBFE',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  filterChipTextActive: {
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
  placeButtonGroup: {
    marginTop: 14,
    gap: 10,
  },
  placeCard: {
    backgroundColor: '#EEF4FF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  placeButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#DCEBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeButtonTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  placeButtonSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#475569',
  },
  placeActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  placeButtonActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  placeCallButton: {
    backgroundColor: '#DCFCE7',
  },
  placeCallButtonText: {
    color: '#166534',
  },
  placeStatusButton: {
    backgroundColor: '#FEF3C7',
  },
  placeStatusButtonText: {
    color: '#B45309',
  },
  sourceButtonGroup: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sourceButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  sourceButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
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
  voiceStatusCard: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginTop: 6,
    marginBottom: 16,
  },
  voiceStatusIdle: {
    backgroundColor: '#E0F2FE',
  },
  voiceStatusListening: {
    backgroundColor: '#DBEAFE',
  },
  voiceStatusProcessing: {
    backgroundColor: '#FEF3C7',
  },
  voiceStatusClarification: {
    backgroundColor: '#FEE2E2',
  },
  voiceStatusCompleted: {
    backgroundColor: '#DCFCE7',
  },
  voiceStatusTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  voiceStatusTitleBlue: {
    color: '#1D4ED8',
  },
  voiceStatusTitleAmber: {
    color: '#B45309',
  },
  voiceStatusTitleRed: {
    color: '#B91C1C',
  },
  voiceStatusTitleGreen: {
    color: '#166534',
  },
  voiceStatusDescription: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 25,
  },
  voiceStatusDescriptionBlue: {
    color: '#1E3A8A',
  },
  voiceStatusDescriptionAmber: {
    color: '#92400E',
  },
  voiceStatusDescriptionRed: {
    color: '#991B1B',
  },
  voiceStatusDescriptionGreen: {
    color: '#166534',
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
  confirmationButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  confirmationButton: {
    flex: 1,
    minHeight: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmYesButton: {
    backgroundColor: '#16A34A',
  },
  confirmNoButton: {
    backgroundColor: '#EF4444',
  },
  confirmationButtonText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
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
  return formatIntentLabel(response.intent, response.mode);
}

function formatIntentLabel(intent: string, mode: CareMode) {
  if (intent === 'medication_lookup' || intent === 'mark_medication_taken') {
    return '복용 안내';
  }
  if (intent === 'schedule_lookup') {
    return '일정 안내';
  }
  if (mode === 'health_support') {
    return '건강지원';
  }
  if (mode === 'cognitive_support') {
    return '인지지원';
  }
  return '일반 안내';
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

function buildHistoryDayOptions(messages: ChatBubble[]) {
  const keys = new Set<string>();
  const options = [{ key: 'all', label: '전체' }];

  for (const message of messages) {
    const dayKey = getHistoryDayKey(message.createdAt);

    if (!dayKey || keys.has(dayKey)) {
      continue;
    }

    keys.add(dayKey);
    options.push({
      key: dayKey,
      label: formatHistoryDayLabel(message.createdAt!),
    });
  }

  return options;
}

function getLatestAssistantPrompt(messages: ChatBubble[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'assistant' || message.role === 'system') {
      return message.text;
    }
  }
  return null;
}

function getVoiceStatusTitle(state: VoiceUiState) {
  if (state === 'listening') {
    return '듣는 중';
  }
  if (state === 'processing' || state === 'awaiting_confirmation') {
    return '확인 중';
  }
  if (state === 'needs_clarification') {
    return '다시 말씀해 주세요';
  }
  if (state === 'completed') {
    return '처리했어요';
  }
  return '눌러서 말씀해 주세요';
}

function getVoiceStatusDescription({
  voiceUiState,
  durationMillis,
  latestPrompt,
}: {
  voiceUiState: VoiceUiState;
  durationMillis: number;
  latestPrompt: string | null;
}) {
  if (voiceUiState === 'listening') {
    return `${formatDuration(durationMillis)} 동안 듣고 있어요. 말씀을 마치면 아래 버튼으로 전송해 주세요.`;
  }
  if (voiceUiState === 'processing') {
    return '전사와 답변을 확인하고 있어요. 잠시만 기다려 주세요.';
  }
  if (voiceUiState === 'awaiting_confirmation') {
    return latestPrompt ?? '내용이 맞으면 네, 아니면 아니오를 눌러 주세요.';
  }
  if (voiceUiState === 'needs_clarification') {
    return latestPrompt ?? '천천히 다시 말씀해 주시면 정확히 확인해드릴게요.';
  }
  if (voiceUiState === 'completed') {
    return latestPrompt ?? '필요하시면 다시 말씀하시면 됩니다.';
  }
  return '버튼을 누르고 말씀하시면 일정, 복약, 보호자 메시지를 바로 처리할 수 있어요.';
}

function getVoiceStatusTone(state: VoiceUiState) {
  if (state === 'listening' || state === 'idle') {
    return {
      containerStyle: styles.voiceStatusListening,
      titleStyle: styles.voiceStatusTitleBlue,
      descriptionStyle: styles.voiceStatusDescriptionBlue,
    };
  }
  if (state === 'processing' || state === 'awaiting_confirmation') {
    return {
      containerStyle: styles.voiceStatusProcessing,
      titleStyle: styles.voiceStatusTitleAmber,
      descriptionStyle: styles.voiceStatusDescriptionAmber,
    };
  }
  if (state === 'needs_clarification') {
    return {
      containerStyle: styles.voiceStatusClarification,
      titleStyle: styles.voiceStatusTitleRed,
      descriptionStyle: styles.voiceStatusDescriptionRed,
    };
  }
  return {
    containerStyle: styles.voiceStatusCompleted,
    titleStyle: styles.voiceStatusTitleGreen,
    descriptionStyle: styles.voiceStatusDescriptionGreen,
  };
}

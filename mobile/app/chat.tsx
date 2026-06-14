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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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

import { SeniorBottomNav } from '@/components/common/SeniorBottomNav';
import {
  buildChatTtsUrl,
  ChatPlaceItem,
  ChatRequesterRole,
  ChatSourceItem,
  getChatHistory,
  getPlaceStatus,
  sendChatMessage,
  sendChatSpeech,
  TtsVoiceId,
} from '@/services/chat';
import { loadAuthSession } from '@/services/authSession';
import { getCoordinatesForTextTurn, getCoordinatesForVoiceTurn } from '@/services/locationService';
import { getCurrentMode, updateCurrentMode } from '@/services/modes';
import { CareMode, GuardianOptions } from '@/types/care';

type ChatBubble = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  meta?: string;
  createdAt?: string;
  places?: ChatPlaceItem[];
  sources?: ChatSourceItem[];
};

type VoiceUiState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'needs_clarification'
  | 'awaiting_confirmation'
  | 'completed';

type GuardianResultView = 'medications' | 'location';

const DEFAULT_MODE_OPTIONS: GuardianOptions = {
  checkInIntervalMinutes: 60,
  alertRepeatCount: 3,
  alwaysOnLocationEnabled: false,
};

const CARE_MODE_OPTIONS: Array<{
  mode: CareMode;
  title: string;
  description: string;
}> = [
  {
    mode: 'basic',
    title: '기본',
    description: '일반 대화',
  },
  {
    mode: 'cognitive_support',
    title: '인지',
    description: '짧고 쉽게',
  },
  {
    mode: 'health_support',
    title: '건강',
    description: '복약·건강',
  },
];

export default function ChatPage() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    input?: string;
    autostart?: string;
    selectedVoice?: string;
    agentName?: string;
    elderUserId?: string;
    elder_user_id?: string;
    parentId?: string;
    parentName?: string;
    linkCode?: string;
    link_code?: string;
    requesterRole?: string;
    requester_role?: string;
    guardianId?: string;
    guardian_id?: string;
    parentAge?: string;
    parentGender?: string;
    medications?: string;
    diseases?: string;
    allergies?: string;
    hospital?: string;
    doctorContact?: string;
    memo?: string;
  }>();

  const isVoiceMode = params.input === 'voice';
  const selectedVoice = String(params.selectedVoice || '') as TtsVoiceId | '';
  const agentName = String(params.agentName || '');

  const initialRequesterRole: ChatRequesterRole =
    String(params.requesterRole || params.requester_role || '') === 'guardian'
      ? 'guardian'
      : 'parent';

  const initialSubjectName = String(params.parentName || '부모님');
  const initialLinkCode = String(params.linkCode || params.link_code || '');

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const player = useAudioPlayer(null, { downloadFirst: true });
  const playerStatus = useAudioPlayerStatus(player);

  const hasAttemptedAutoRecordingRef = useRef(false);
  const pendingTtsRequestRef = useRef<{ messageId: string; text: string } | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);

  const [mode, setMode] = useState<CareMode>('basic');
  const [modeOptions, setModeOptions] = useState<GuardianOptions>(DEFAULT_MODE_OPTIONS);

  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [checkingPlaceKey, setCheckingPlaceKey] = useState<string | null>(null);
  const [ttsMessageId, setTtsMessageId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [isLoadingMode, setIsLoadingMode] = useState(true);
  const [isChangingMode, setIsChangingMode] = useState(false);
  const [isLoadingElderUserId, setIsLoadingElderUserId] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [hasRecordingPermission, setHasRecordingPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [voiceUiState, setVoiceUiState] = useState<VoiceUiState>('idle');
  const [showQuickConfirmation, setShowQuickConfirmation] = useState(false);
  const [pendingGuardianResultView, setPendingGuardianResultView] =
    useState<GuardianResultView | null>(null);

  const [selectedHistoryDay, setSelectedHistoryDay] = useState<string>('all');
  const [selectedCalendarMonth, setSelectedCalendarMonth] = useState(() => startOfMonth(new Date()));

  const [requesterRole, setRequesterRole] = useState<ChatRequesterRole>(initialRequesterRole);
  const [subjectName, setSubjectName] = useState(initialSubjectName);
  const [linkCode, setLinkCode] = useState(initialLinkCode);

  const [elderUserId, setElderUserId] = useState(
    String(params.elderUserId || params.elder_user_id || params.parentId || '')
  );

  const [messages, setMessages] = useState<ChatBubble[]>(() =>
    isVoiceMode
      ? [
          {
            id: 'welcome',
            role: 'assistant',
            text:
              initialRequesterRole === 'guardian'
                ? `${initialSubjectName} 님의 일정, 복약, 건강 상태, 위치를 물어보거나 약 등록을 요청해 주세요.`
                : agentName
                  ? `${agentName}입니다. 일정이나 약 시간을 물어보시면 바로 확인해드릴게요.`
                  : '안녕하세요. 일정이나 약 시간을 물어보시면 바로 확인해드릴게요.',
            meta: '기본 안내',
          },
        ]
      : []
  );

  const isGuardianRequester = requesterRole === 'guardian';

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const handleScrollContentSizeChange = useCallback(() => {
    scrollToBottom(true);
  }, [scrollToBottom]);

  const openGuardianResultView = useCallback(
    async (view: GuardianResultView) => {
      if (!isGuardianRequester) {
        return false;
      }

      const session = await loadAuthSession().catch(() => null);
      const guardianSession = session?.role === 'guardian' ? session : null;
      const parentId = guardianSession?.parentId || elderUserId;
      const routeLinkCode = guardianSession?.linkCode || linkCode;
      const routeParentName = guardianSession?.parentName || subjectName || '부모님';

      if (!parentId || !routeLinkCode) {
        setError('보여줄 화면을 열기 위한 보호자 연결 정보가 없습니다.');
        return false;
      }

      const commonParams = {
        parentId,
        elderUserId: parentId,
        parentName: routeParentName,
        linkCode: routeLinkCode,
      };

      setPendingGuardianResultView(null);

      if (view === 'medications') {
        router.push({
          pathname: '/guardian-medications',
          params: {
            ...commonParams,
            parentAge: guardianSession?.parentAge || String(params.parentAge || ''),
            parentGender: guardianSession?.parentGender || String(params.parentGender || ''),
            medications: guardianSession?.medications || String(params.medications || ''),
          },
        });
        return true;
      }

      router.push({
        pathname: '/guardian-location',
        params: commonParams,
      });
      return true;
    },
    [
      elderUserId,
      isGuardianRequester,
      linkCode,
      params.medications,
      params.parentAge,
      params.parentGender,
      router,
      subjectName,
    ]
  );

  useEffect(() => {
    const paramElderUserId = String(
      params.elderUserId || params.elder_user_id || params.parentId || ''
    );

    const paramRequesterRole: ChatRequesterRole =
      String(params.requesterRole || params.requester_role || '') === 'guardian'
        ? 'guardian'
        : 'parent';

    const paramSubjectName = String(params.parentName || '');
    const paramLinkCode = String(params.linkCode || params.link_code || '');

    if (paramElderUserId) {
      setElderUserId(paramElderUserId);
      setRequesterRole(paramRequesterRole);

      if (paramSubjectName) {
        setSubjectName(paramSubjectName);
      }

      if (paramLinkCode) {
        setLinkCode(paramLinkCode);
      }

      setIsLoadingElderUserId(false);
      return;
    }

    let cancelled = false;

    const restoreParentSession = async () => {
      try {
        const session = await loadAuthSession();

        if (cancelled) {
          return;
        }

        if (session?.role === 'parent') {
          setElderUserId(session.elderUserId || session.parentId);
          setRequesterRole('parent');
          setSubjectName(session.parentName);
          setLinkCode(session.linkCode);
        }

        if (session?.role === 'guardian') {
          setElderUserId(session.parentId);
          setRequesterRole('guardian');
          setSubjectName(session.parentName);
          setLinkCode(session.linkCode);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingElderUserId(false);
        }
      }
    };

    void restoreParentSession();

    return () => {
      cancelled = true;
    };
  }, [
    params.elderUserId,
    params.elder_user_id,
    params.linkCode,
    params.link_code,
    params.parentId,
    params.parentName,
    params.requesterRole,
    params.requester_role,
  ]);

  useEffect(() => {
    let mounted = true;

    const loadMode = async () => {
      try {
        const currentMode = await getCurrentMode();

        if (!mounted) {
          return;
        }

        setMode(currentMode.mode);
        setModeOptions(currentMode.options);
      } catch {
        if (!mounted) {
          return;
        }

        setMode('basic');
        setModeOptions(DEFAULT_MODE_OPTIONS);
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
      } catch {}

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
        player.seekTo(0).catch(() => {});
        player.play();
      })
      .catch((playbackError) => {
        setTtsMessageId(null);
        setError(
          playbackError instanceof Error
            ? playbackError.message
            : '음성 재생 중 오류가 발생했습니다.'
        );
      });
  }, [player, playerStatus.isLoaded, playerStatus.playing, ttsMessageId]);

  useEffect(() => {
    if (!isVoiceMode || params.autostart !== '1') {
      return;
    }

    if (
      isLoadingMode ||
      isLoadingElderUserId ||
      recorderState.isRecording ||
      isUploadingVoice
    ) {
      return;
    }

    if (hasAttemptedAutoRecordingRef.current) {
      return;
    }

    hasAttemptedAutoRecordingRef.current = true;
    void handleStartRecording();
  }, [
    isLoadingElderUserId,
    isLoadingMode,
    isUploadingVoice,
    isVoiceMode,
    params.autostart,
    recorderState.isRecording,
  ]);

  const loadHistory = useCallback(async () => {
    if (isVoiceMode) {
      return;
    }

    if (isLoadingElderUserId) {
      return;
    }

    if (!elderUserId) {
      setMessages([]);
      setError('대상자 정보를 찾지 못했습니다.');
      return;
    }

    try {
      setIsLoadingHistory(true);
      setError(null);

      const response = await getChatHistory(50, elderUserId, requesterRole);

      const historyMessages: ChatBubble[] = response.items.map((item, index) => ({
        id: `history-${item.created_at}-${index}`,
        role: item.role,
        text: item.content,
        meta: `${formatHistoryTimestamp(item.created_at)} · ${formatModeLabel(item.mode)}`,
        createdAt: item.created_at,
      }));

      setMessages(historyMessages);
    } catch (historyError) {
      setError(
        historyError instanceof Error
          ? historyError.message
          : '대화 기록을 불러오지 못했습니다.'
      );
    } finally {
      setIsLoadingHistory(false);
    }
  }, [elderUserId, isLoadingElderUserId, isVoiceMode, requesterRole]);

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
      return undefined;
    }, [loadHistory])
  );

  const handleSelectMode = async (nextMode: CareMode) => {
    if (mode === nextMode || isLoadingMode || isChangingMode) {
      return;
    }

    try {
      setError(null);
      setIsChangingMode(true);

      const updatedMode = await updateCurrentMode({
        mode: nextMode,
        options: modeOptions,
      });

      setMode(updatedMode.mode);
      setModeOptions(updatedMode.options);

      const modeChangeMessage: ChatBubble = {
        id: `mode-change-${Date.now()}`,
        role: 'system',
        text: `${formatModeLabel(updatedMode.mode)}로 바뀌었어요.`,
        meta: '모드 변경',
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, modeChangeMessage]);

      if (isVoiceMode) {
        await playTtsForMessage(modeChangeMessage.id, modeChangeMessage.text, updatedMode.mode);
      }
    } catch (modeError) {
      setError(
        modeError instanceof Error
          ? modeError.message
          : '모드를 변경하지 못했습니다.'
      );
    } finally {
      setIsChangingMode(false);
    }
  };

  const handleSend = async () => {
    const trimmedDraft = draft.trim();

    if (!trimmedDraft || isSending) {
      return;
    }

    await submitTextTurn(trimmedDraft);
    setDraft('');
  };

  const rememberGuardianResultView = useCallback(
    (response: {
      intent: string;
      executed_action?: string | null;
      confirmation_needed?: boolean;
      awaiting_confirmation?: boolean;
      missing_slots?: string[];
    }) => {
      if (!isGuardianRequester) {
        return;
      }

      const resultView = getGuardianResultViewFromResponse(response);
      if (resultView) {
        setPendingGuardianResultView(resultView);
      }
    },
    [isGuardianRequester]
  );

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
      setError(
        recordingError instanceof Error
          ? recordingError.message
          : '녹음을 시작하지 못했습니다.'
      );
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
      if (!elderUserId) {
        throw new Error('대상자 정보를 찾지 못했습니다.');
      }

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
        elderUserId,
        requesterRole,
        linkCode: isGuardianRequester ? linkCode || undefined : undefined,
        transcriptVisibility: 'on_low_confidence',
        ...(voiceCoordinates ?? {}),
      });

      setSessionId(response.session_id ?? null);
      const requestedResultView = isGuardianRequester
        ? resolveGuardianResultViewRequest(response.transcript, pendingGuardianResultView)
        : null;

      const transcriptBubble: ChatBubble = {
        id: `voice-transcript-${Date.now()}`,
        role: 'user',
        text: response.transcript,
        meta: `음성 전사 · confidence ${response.stt_confidence.toFixed(2)}`,
      };

      const assistantBubble: ChatBubble = {
        id: `voice-response-${Date.now()}`,
        role: requestedResultView || !response.confirmation_needed ? 'assistant' : 'system',
        text: requestedResultView
          ? `${getGuardianResultViewLabel(requestedResultView)} 화면을 열게요.`
          : response.confirmation_needed
          ? response.clarification_question ?? '다시 한 번 말씀해 주세요.'
          : response.answer,
        meta: requestedResultView ? '화면 이동' : formatResponseMeta(response),
        places: requestedResultView ? [] : response.places,
        sources: requestedResultView ? [] : response.sources,
      };

      setMessages((prev) => [...prev, transcriptBubble, assistantBubble]);

      if (requestedResultView) {
        setVoiceUiState('completed');
        setShowQuickConfirmation(false);
      } else {
        rememberGuardianResultView(response);
        applyVoiceResponseState(response);
      }
      await playTtsForMessage(assistantBubble.id, assistantBubble.text);
      if (requestedResultView) {
        await openGuardianResultView(requestedResultView);
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : '음성 업로드 중 오류가 발생했습니다.'
      );
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

    const requestedResultView = isGuardianRequester
      ? resolveGuardianResultViewRequest(trimmedText, pendingGuardianResultView)
      : null;

    const userMessage: ChatBubble = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmedText,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setError(null);

    if (requestedResultView) {
      const assistantMessage: ChatBubble = {
        id: `assistant-result-view-${Date.now()}`,
        role: 'assistant',
        text: `${getGuardianResultViewLabel(requestedResultView)} 화면을 열게요.`,
        meta: '화면 이동',
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (isVoiceMode) {
        setVoiceUiState('completed');
        setShowQuickConfirmation(false);
        await playTtsForMessage(assistantMessage.id, assistantMessage.text);
      }

      await openGuardianResultView(requestedResultView);
      return;
    }

    setIsSending(true);

    if (isVoiceMode) {
      setVoiceUiState('processing');
      setShowQuickConfirmation(false);
    }

    try {
      if (!elderUserId) {
        throw new Error('대상자 정보를 찾지 못했습니다.');
      }

      const coordinates = await getCoordinatesForTextTurn(trimmedText);

      const response = await sendChatMessage({
        text: trimmedText,
        mode,
        context_source: 'text',
        client_message_id: `mobile-${Date.now()}`,
        session_id: sessionId ?? undefined,
        elder_user_id: elderUserId,
        requester_role: requesterRole,
        link_code: isGuardianRequester ? linkCode || undefined : undefined,
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
        sources: response.sources,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (isVoiceMode) {
        rememberGuardianResultView(response);
        applyVoiceResponseState(response);
        await playTtsForMessage(assistantMessage.id, assistantMessage.text);
      } else {
        rememberGuardianResultView(response);
      }
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : '대화 요청 중 오류가 발생했습니다.'
      );

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

  const playTtsForMessage = async (messageId: string, text: string, ttsMode: CareMode = mode) => {
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

      pendingTtsRequestRef.current = {
        messageId,
        text: trimmedText,
      };

      player.replace(buildChatTtsUrl(trimmedText, ttsMode, selectedVoice || undefined));
      player.play();
    } catch (ttsError) {
      pendingTtsRequestRef.current = null;
      setTtsMessageId(null);

      setError(
        ttsError instanceof Error
          ? ttsError.message
          : '음성 재생 중 오류가 발생했습니다.'
      );
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
    const phone = (place.phone ?? '').trim();

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
      setError(
        statusError instanceof Error
          ? statusError.message
          : '영업중 확인 중 오류가 발생했습니다.'
      );
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
  const calendarMonths = isVoiceMode ? [] : buildHistoryMonthOptions(messages);
  const selectedCalendarMonthKey = formatMonthKey(selectedCalendarMonth);
  const activeMonthIndex = calendarMonths.findIndex(
    (monthKey) => monthKey === selectedCalendarMonthKey
  );

  const visibleCalendarMonth =
    activeMonthIndex >= 0
      ? selectedCalendarMonth
      : calendarMonths[0]
        ? parseMonthKey(calendarMonths[0])
        : selectedCalendarMonth;

  const calendarDays = isVoiceMode ? [] : buildCalendarDays(visibleCalendarMonth, messages);

  const visibleMessages =
    isVoiceMode || selectedHistoryDay === 'all'
      ? messages
      : messages.filter((message) => getHistoryDayKey(message.createdAt) === selectedHistoryDay);

  useEffect(() => {
    scrollToBottom(true);
  }, [visibleMessages.length, scrollToBottom]);

  useEffect(() => {
    if (isVoiceMode) {
      return;
    }

    if (calendarMonths.length === 0) {
      const currentMonth = startOfMonth(new Date());

      if (formatMonthKey(currentMonth) !== selectedCalendarMonthKey) {
        setSelectedCalendarMonth(currentMonth);
      }

      return;
    }

    if (!calendarMonths.includes(selectedCalendarMonthKey)) {
      setSelectedCalendarMonth(parseMonthKey(calendarMonths[0]));
    }
  }, [calendarMonths, isVoiceMode, selectedCalendarMonthKey]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={handleScrollContentSizeChange}
      >
        <Text style={styles.title}>
          {isGuardianRequester
            ? `${subjectName} 님 상태 질문하기`
            : agentName
              ? '대화하기'
              : '대화하기'}
        </Text>

        <Text style={styles.description}>
          {isGuardianRequester
            ? isVoiceMode
              ? '보호자 질문으로 처리됩니다. 부모님 일정, 복약, 건강 상태, 위치를 확인하고 약을 등록할 수 있습니다.'
              : '보호자 질문 기록을 날짜별로 골라 확인할 수 있습니다.'
            : isVoiceMode
              ? '편하게 말씀해주세요'
              : '이전에 주고받은 대화를 날짜별로 골라 확인할 수 있습니다.'}
        </Text>

        <View style={styles.modeCard}>
          <View style={styles.modeHeaderRow}>
            <View style={styles.modeHeaderTextWrap}>
              <Text style={styles.modeLabel}>대화 모드 선택</Text>
              <Text style={styles.modeHint}>원하는 모드를 누르면 바로 바뀝니다.</Text>
            </View>

            {isLoadingMode || isChangingMode ? (
              <ActivityIndicator size="small" color="#F97316" />
            ) : (
              <Text style={styles.modeValue}>{formatModeLabel(mode)}</Text>
            )}
          </View>

          <View style={styles.modeButtonRow}>
            {CARE_MODE_OPTIONS.map((option) => {
              const isActive = mode === option.mode;

              return (
                <TouchableOpacity
                  key={option.mode}
                  style={[
                    styles.modeSelectButton,
                    isActive && styles.modeSelectButtonActive,
                  ]}
                  onPress={() => void handleSelectMode(option.mode)}
                  disabled={isLoadingMode || isChangingMode}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.modeSelectTitle,
                      isActive && styles.modeSelectTitleActive,
                    ]}
                  >
                    {option.title}
                  </Text>

                  <Text
                    style={[
                      styles.modeSelectDescription,
                      isActive && styles.modeSelectDescriptionActive,
                    ]}
                  >
                    {option.description}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {!isVoiceMode && historyDayOptions.length > 0 ? (
          <View style={styles.filterCard}>
            <View style={styles.filterHeaderRow}>
              <Text style={styles.filterTitle}>날짜 선택</Text>

              <TouchableOpacity
                style={[
                  styles.allHistoryButton,
                  selectedHistoryDay === 'all' && styles.allHistoryButtonActive,
                ]}
                onPress={() => setSelectedHistoryDay('all')}
              >
                <Text
                  style={[
                    styles.allHistoryButtonText,
                    selectedHistoryDay === 'all' && styles.allHistoryButtonTextActive,
                  ]}
                >
                  전체 보기
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.calendarHeaderRow}>
              <TouchableOpacity
                style={[
                  styles.calendarNavButton,
                  activeMonthIndex <= 0 && styles.calendarNavButtonDisabled,
                ]}
                onPress={() => {
                  if (activeMonthIndex > 0) {
                    setSelectedCalendarMonth(parseMonthKey(calendarMonths[activeMonthIndex - 1]));
                  }
                }}
                disabled={activeMonthIndex <= 0}
              >
                <Text style={styles.calendarNavText}>이전</Text>
              </TouchableOpacity>

              <Text style={styles.calendarMonthLabel}>
                {formatCalendarMonthLabel(visibleCalendarMonth)}
              </Text>

              <TouchableOpacity
                style={[
                  styles.calendarNavButton,
                  (activeMonthIndex < 0 || activeMonthIndex >= calendarMonths.length - 1) &&
                    styles.calendarNavButtonDisabled,
                ]}
                onPress={() => {
                  if (activeMonthIndex >= 0 && activeMonthIndex < calendarMonths.length - 1) {
                    setSelectedCalendarMonth(parseMonthKey(calendarMonths[activeMonthIndex + 1]));
                  }
                }}
                disabled={activeMonthIndex < 0 || activeMonthIndex >= calendarMonths.length - 1}
              >
                <Text style={styles.calendarNavText}>다음</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.weekdayRow}>
              {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                <Text key={day} style={styles.weekdayLabel}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarDays.map((day, calendarIndex) =>
                day ? (
                  <TouchableOpacity
                    key={day.key}
                    style={[
                      styles.calendarDayCell,
                      !day.hasMessages && styles.calendarDayCellDisabled,
                      selectedHistoryDay === day.key && styles.calendarDayCellActive,
                    ]}
                    onPress={() => {
                      if (day.hasMessages) {
                        setSelectedHistoryDay(day.key);
                      }
                    }}
                    disabled={!day.hasMessages}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        !day.hasMessages && styles.calendarDayTextDisabled,
                        selectedHistoryDay === day.key && styles.calendarDayTextActive,
                      ]}
                    >
                      {day.dayNumber}
                    </Text>

                    {day.hasMessages ? <View style={styles.calendarDayDot} /> : null}
                  </TouchableOpacity>
                ) : (
                  <View key={`empty-${calendarIndex}`} style={styles.calendarDaySpacer} />
                )
              )}
            </View>
          </View>
        ) : null}

        {visibleMessages.map((message, index) => {
          const previousMessage = visibleMessages[index - 1];

          const shouldShowDayDivider =
            !isVoiceMode &&
            !!message.createdAt &&
            getHistoryDayKey(previousMessage?.createdAt) !== getHistoryDayKey(message.createdAt);

          const isUserMessage = message.role === 'user';
          const isSystemMessage = message.role === 'system';

          return (
            <View key={message.id}>
              {shouldShowDayDivider ? (
                <View style={styles.dayDivider}>
                  <Text style={styles.dayDividerText}>
                    {formatHistoryDayLabel(message.createdAt!)}
                  </Text>
                </View>
              ) : null}

              <View
                style={[
                  styles.messageRow,
                  isUserMessage ? styles.userMessageRow : styles.assistantMessageRow,
                ]}
              >
                <View
                  style={[
                    styles.messageBubbleWrap,
                    isUserMessage ? styles.userBubbleWrap : styles.assistantBubbleWrap,
                  ]}
                >
                  <Text
                    style={[
                      styles.messageLabel,
                      isUserMessage && styles.userMessageLabel,
                      isSystemMessage && styles.systemMessageLabel,
                    ]}
                  >
                    {getRoleLabel(message.role, requesterRole)}
                  </Text>

                  <View
                    style={[
                      styles.messageCard,
                      isUserMessage && styles.userMessageCard,
                      isSystemMessage && styles.systemMessageCard,
                    ]}
                  >
                    <Text style={[styles.messageText, isUserMessage && styles.userMessageText]}>
                      {message.text}
                    </Text>

                    {message.meta ? (
                      <Text style={[styles.messageMeta, isUserMessage && styles.userMessageMeta]}>
                        {message.meta}
                      </Text>
                    ) : null}

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
                                disabled={
                                  checkingPlaceKey ===
                                  `${place.name}-${place.latitude}-${place.longitude}`
                                }
                              >
                                <Text
                                  style={[
                                    styles.placeButtonActionText,
                                    styles.placeStatusButtonText,
                                  ]}
                                >
                                  {checkingPlaceKey ===
                                  `${place.name}-${place.latitude}-${place.longitude}`
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
                                  <Text
                                    style={[
                                      styles.placeButtonActionText,
                                      styles.placeCallButtonText,
                                    ]}
                                  >
                                    전화하기
                                  </Text>
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
                            <Text style={styles.sourceButtonText}>
                              {formatSourceLabel(source, sourceIndex)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}

                    {message.role !== 'user' && message.text.trim() ? (
                      <TouchableOpacity
                        style={[
                          styles.ttsButton,
                          ttsMessageId === message.id && styles.ttsButtonActive,
                        ]}
                        onPress={() => void playTtsForMessage(message.id, message.text)}
                      >
                        <Text style={styles.ttsButtonText}>
                          {ttsMessageId === message.id && playerStatus.playing
                            ? '읽는 중...'
                            : '음성으로 듣기'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>
          );
        })}

        {!isVoiceMode && isLoadingHistory ? (
          <View style={styles.historyStateCard}>
            <ActivityIndicator size="small" color="#F97316" />
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

              <Text
                style={[
                  styles.voiceStatusDescription,
                  getVoiceStatusTone(voiceUiState).descriptionStyle,
                ]}
              >
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
                <Text style={styles.voiceButtonText}>
                  {isUploadingVoice ? '확인 중...' : '말씀 완료 후 전송'}
                </Text>
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
              placeholder={
                isGuardianRequester
                  ? '예: 오늘 약 잘 드셨어?'
                  : '예: 오늘 병원 일정 있나요?'
              }
              placeholderTextColor="#94A3B8"
              multiline
            />

            <TouchableOpacity
              style={[styles.sendButton, (!draft.trim() || isSending) && styles.sendButtonDisabled]}
              onPress={() => void handleSend()}
              disabled={!draft.trim() || isSending}
            >
              <Text style={styles.sendButtonText}>
                {isSending ? '보내는 중...' : '질문 보내기'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>이전으로</Text>
        </TouchableOpacity>
      </ScrollView>

      {!isGuardianRequester ? (
        <SeniorBottomNav
          active="chat"
          params={{
            parentId: elderUserId,
            elderUserId,
            parentName: subjectName,
            linkCode,
            agentName,
            agentVoice: selectedVoice,
            selectedVoice,
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    padding: 24,
    paddingBottom: 132,
  },
  title: {
    fontSize: 32,
    lineHeight: 42,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  description: {
    fontSize: 18,
    lineHeight: 27,
    color: '#475569',
    marginBottom: 20,
  },
  modeCard: {
    backgroundColor: '#FFEDD5',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 16,
  },
  modeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  modeHeaderTextWrap: {
    flex: 1,
  },
  modeLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  modeHint: {
    fontSize: 13,
    lineHeight: 20,
    color: '#475569',
  },
  modeValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#EA580C',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    overflow: 'hidden',
  },
  modeButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeSelectButton: {
    flex: 1,
    minHeight: 74,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modeSelectButtonActive: {
    backgroundColor: '#EA580C',
    borderColor: '#C2410C',
  },
  modeSelectTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#9A3412',
    marginBottom: 5,
  },
  modeSelectTitleActive: {
    color: '#FFFFFF',
  },
  modeSelectDescription: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  modeSelectDescriptionActive: {
    color: '#FFEDD5',
  },
  filterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 12,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  filterTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  allHistoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
  },
  allHistoryButtonActive: {
    backgroundColor: '#FFEDD5',
  },
  allHistoryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  allHistoryButtonTextActive: {
    color: '#EA580C',
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarNavButton: {
    minWidth: 52,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
  },
  calendarNavButtonDisabled: {
    backgroundColor: '#F8FAFC',
  },
  calendarNavText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EA580C',
  },
  calendarMonthLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
  },
  calendarDayCell: {
    width: '14.28%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#FFF7ED',
  },
  calendarDayCellDisabled: {
    backgroundColor: 'transparent',
  },
  calendarDayCellActive: {
    backgroundColor: '#EA580C',
  },
  calendarDayText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#9A3412',
  },
  calendarDayTextDisabled: {
    color: '#CBD5E1',
    fontWeight: '600',
  },
  calendarDayTextActive: {
    color: '#FFFFFF',
  },
  calendarDayDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    marginTop: 4,
    backgroundColor: '#FDBA74',
  },
  calendarDaySpacer: {
    width: '14.28%',
    minHeight: 48,
  },
  messageRow: {
    marginBottom: 14,
    flexDirection: 'row',
  },
  assistantMessageRow: {
    justifyContent: 'flex-start',
  },
  userMessageRow: {
    justifyContent: 'flex-end',
  },
  messageBubbleWrap: {
    maxWidth: '82%',
  },
  assistantBubbleWrap: {
    alignItems: 'flex-start',
  },
  userBubbleWrap: {
    alignItems: 'flex-end',
  },
  messageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  userMessageCard: {
    backgroundColor: '#EA580C',
    borderBottomRightRadius: 8,
  },
  systemMessageCard: {
    backgroundColor: '#FEF3C7',
    borderBottomLeftRadius: 8,
  },
  messageLabel: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 6,
    paddingHorizontal: 4,
    fontWeight: '700',
  },
  userMessageLabel: {
    color: '#EA580C',
  },
  systemMessageLabel: {
    color: '#B45309',
  },
  messageText: {
    fontSize: 18,
    color: '#0F172A',
    lineHeight: 28,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  messageMeta: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748B',
  },
  userMessageMeta: {
    color: 'rgba(255,255,255,0.78)',
  },
  placeButtonGroup: {
    marginTop: 14,
    gap: 10,
  },
  placeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  placeButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeButtonTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EA580C',
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
    color: '#EA580C',
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
    backgroundColor: '#E2E8F0',
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
    backgroundColor: '#FFEDD5',
  },
  ttsButtonActive: {
    backgroundColor: '#FED7AA',
  },
  ttsButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#9A3412',
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
    backgroundColor: '#F97316',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#FDBA74',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  voiceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 22,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  voiceStatusCard: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginTop: 6,
    marginBottom: 16,
  },
  voiceStatusIdle: {
    backgroundColor: '#FFEDD5',
  },
  voiceStatusListening: {
    backgroundColor: '#FFEDD5',
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
    fontSize: 25,
    lineHeight: 33,
    fontWeight: '800',
  },
  voiceStatusTitleBlue: {
    color: '#EA580C',
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
    fontSize: 18,
    lineHeight: 28,
  },
  voiceStatusDescriptionBlue: {
    color: '#9A3412',
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
  voiceButton: {
    marginTop: 14,
    minHeight: 72,
    borderRadius: 24,
    backgroundColor: '#EA580C',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#EA580C',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 6,
  },
  voiceButtonDisabled: {
    backgroundColor: '#FDBA74',
  },
  voiceButtonText: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
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
    minHeight: 72,
    borderRadius: 24,
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

function getRoleLabel(role: ChatBubble['role'], requesterRole: ChatRequesterRole) {
  if (role === 'user') {
    return requesterRole === 'guardian' ? '보호자' : '나';
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
  if (
    intent === 'medication_lookup' ||
    intent === 'mark_medication_taken' ||
    intent === 'create_medication'
  ) {
    return '복용 안내';
  }

  if (intent === 'location_lookup') {
    return '위치 안내';
  }

  if (intent === 'schedule_lookup') {
    return '일정 안내';
  }

  if (intent === 'web_search_support') {
    return '웹 검색';
  }

  if (mode === 'health_support') {
    return '건강지원';
  }

  if (mode === 'cognitive_support') {
    return '인지지원';
  }

  return '일반 안내';
}

function getGuardianResultViewFromResponse(response: {
  intent: string;
  executed_action?: string | null;
  confirmation_needed?: boolean;
  awaiting_confirmation?: boolean;
  missing_slots?: string[];
}): GuardianResultView | null {
  const hasMissingSlots = (response.missing_slots?.length ?? 0) > 0;
  if (response.confirmation_needed || response.awaiting_confirmation || hasMissingSlots) {
    return null;
  }

  if (
    response.executed_action === 'create_medication' ||
    response.executed_action === 'mark_medication_taken'
  ) {
    return 'medications';
  }

  if (response.executed_action === 'request_location_refresh') {
    return 'location';
  }

  if (response.intent === 'medication_lookup') {
    return 'medications';
  }

  if (response.intent === 'location_lookup') {
    return 'location';
  }

  return null;
}

function resolveGuardianResultViewRequest(
  text: string,
  pendingView: GuardianResultView | null
): GuardianResultView | null {
  const normalized = text.trim().toLowerCase();
  const compact = normalized.replace(/\s+/g, '');
  if (!compact) {
    return null;
  }

  const asksToShow =
    compact.includes('보여') ||
    compact.includes('열어') ||
    compact.includes('화면') ||
    compact.includes('보러') ||
    compact.includes('이동');

  if (!asksToShow) {
    return null;
  }

  if (/(약|복약|medication)/i.test(normalized)) {
    return 'medications';
  }

  if (/(위치|지도|location|map)/i.test(normalized)) {
    return 'location';
  }

  return pendingView;
}

function getGuardianResultViewLabel(view: GuardianResultView) {
  if (view === 'medications') {
    return '복약';
  }

  return '위치';
}

function formatSourceLabel(source: ChatSourceItem, index: number) {
  const title = source.title.trim();

  if (!title) {
    return `출처 ${index + 1}`;
  }

  return title.length > 18 ? `${title.slice(0, 18)}...` : title;
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

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthKey(value: string) {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, 1);
}

function buildHistoryMonthOptions(messages: ChatBubble[]) {
  const keys = new Set<string>();
  const monthKeys: string[] = [];

  for (const message of messages) {
    if (!message.createdAt) {
      continue;
    }

    const date = new Date(message.createdAt);

    if (Number.isNaN(date.getTime())) {
      continue;
    }

    const monthKey = formatMonthKey(date);

    if (keys.has(monthKey)) {
      continue;
    }

    keys.add(monthKey);
    monthKeys.push(monthKey);
  }

  monthKeys.sort((left, right) => (left < right ? 1 : -1));

  return monthKeys;
}

function formatCalendarMonthLabel(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function buildCalendarDays(monthDate: Date, messages: ChatBubble[]) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

  const days: Array<{ key: string; dayNumber: number; hasMessages: boolean } | null> = [];

  const availableDayKeys = new Set(
    messages
      .map((message) => getHistoryDayKey(message.createdAt) ?? '')
      .filter(Boolean)
  );

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const currentDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    const key = getHistoryDayKey(currentDate.toISOString()) ?? '';

    days.push({
      key,
      dayNumber: day,
      hasMessages: availableDayKeys.has(key),
    });
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
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
    return '전사와 답변을 확인하고 있어요.';
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

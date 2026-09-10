import { apiGet, apiPatch, apiPost, apiPostForm, buildApiUrl } from "@/services/api";
import { CareMode } from "@/types/care";

export type ChatRequesterRole = "parent" | "guardian";

export type ChatMessageRequest = {
  text: string;
  mode: CareMode;
  context_source: "text";
  client_message_id?: string;
  session_id?: string;
  elder_user_id?: string;
  requester_role?: ChatRequesterRole;
  link_code?: string;
  latitude?: number;
  longitude?: number;
};

export type ChatPlaceItem = {
  name: string;
  distance_meters: number;
  latitude: number;
  longitude: number;
  address?: string | null;
  phone?: string | null;
  place_url?: string | null;
  available_beds?: number | null;
};

export type ChatSourceItem = {
  title: string;
  url: string;
};

export type ChatMessageResponse = {
  answer: string;
  confirmation_needed: boolean;
  clarification_question: string | null;
  transcript: string;
  intent: string;
  provider: string;
  mode: CareMode;
  session_id?: string | null;
  pending_action?: string | null;
  awaiting_confirmation?: boolean;
  missing_slots?: string[];
  executed_action?: string | null;
  places?: ChatPlaceItem[];
  sources?: ChatSourceItem[];
  llm_latency_ms?: number | null;
  total_latency_ms?: number | null;
};

export type TranscriptVisibility = "always" | "on_low_confidence" | "hidden";

export type ChatSpeechRequest = {
  fileUri: string;
  fileName: string;
  mimeType: string;
  mode: CareMode;
  audioFormat: "m4a" | "wav" | "mp3" | "webm";
  audioDurationMs?: number;
  clientMessageId?: string;
  sessionId?: string;
  elderUserId?: string;
  requesterRole?: ChatRequesterRole;
  linkCode?: string;
  transcriptVisibility: TranscriptVisibility;
  latitude?: number;
  longitude?: number;
};

export type WakeSpeechRequest = {
  fileUri: string;
  fileName: string;
  mimeType: string;
  mode: CareMode;
  audioFormat: "m4a" | "wav" | "mp3" | "webm";
  audioDurationMs?: number;
  elderUserId?: string;
};

export type WakeSpeechResponse = {
  transcript: string;
  stt_confidence: number;
};

export type ChatSpeechResponse = {
  transcript: string;
  stt_confidence: number;
  answer: string;
  confirmation_needed: boolean;
  clarification_question: string | null;
  intent: string;
  stt_provider: string;
  llm_provider: string;
  mode: CareMode;
  session_id?: string | null;
  pending_action?: string | null;
  awaiting_confirmation?: boolean;
  missing_slots?: string[];
  executed_action?: string | null;
  places?: ChatPlaceItem[];
  sources?: ChatSourceItem[];
  stt_latency_ms?: number | null;
  llm_latency_ms?: number | null;
  total_latency_ms?: number | null;
};

export type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
  mode: CareMode;
  created_at: string;
  requester_role: ChatRequesterRole;
};

type ChatHistoryResponse = {
  items: ChatHistoryItem[];
};

export type ChatPlaceStatusRequest = {
  place_name: string;
  address?: string | null;
  phone?: string | null;
  place_url?: string | null;
  latitude?: number;
  longitude?: number;
};

export type ChatPlaceStatusResponse = {
  answer: string;
  sources: ChatSourceItem[];
};

export type TtsVoiceId =
  | "alloy"
  | "echo"
  | "fable"
  | "onyx"
  | "nova"
  | "shimmer";

export type VoiceOption = {
  id: TtsVoiceId;
  name: string;
  gender: "male" | "female" | "neutral";
  tone: string;
  description: string;
  avatar: string;
};

export const CHAT_TTS_VOICE_OPTIONS: VoiceOption[] = [
  {
    id: "alloy",
    name: "기본 음성",
    gender: "neutral",
    tone: "중립적",
    description: "또렷하고 무난한 기본 목소리",
    avatar: "기본",
  },
  {
    id: "echo",
    name: "차분한 남성",
    gender: "male",
    tone: "차분함",
    description: "안정적이고 침착한 목소리",
    avatar: "남",
  },
  {
    id: "fable",
    name: "부드러운 여성",
    gender: "female",
    tone: "부드러움",
    description: "편안하고 자연스러운 목소리",
    avatar: "여",
  },
  {
    id: "onyx",
    name: "신뢰감 남성",
    gender: "male",
    tone: "묵직함",
    description: "낮고 안정적인 목소리",
    avatar: "남",
  },
  {
    id: "nova",
    name: "밝은 여성",
    gender: "female",
    tone: "밝음",
    description: "친근하고 경쾌한 목소리",
    avatar: "여",
  },
  {
    id: "shimmer",
    name: "따뜻한 여성",
    gender: "female",
    tone: "따뜻함",
    description: "부드럽고 다정한 목소리",
    avatar: "여",
  },
];

export type AgentProfilePayload = {
  elder_user_id: string;
  agent_voice?: string;
  agent_name?: string;
};

export type AgentProfileResponse = {
  elder_user_id: string;
  agent_voice?: string | null;
  agent_name?: string | null;
};

export async function updateAgentProfile(
  payload: AgentProfilePayload
): Promise<AgentProfileResponse> {
  return apiPatch("/elder-profile/agent", payload);
}

export async function getAgentProfile(
  elderUserId: string
): Promise<AgentProfileResponse> {
  return apiGet(`/elder-profile/agent?elder_user_id=${encodeURIComponent(elderUserId)}`);
}

export function sendChatMessage(payload: ChatMessageRequest) {
  return apiPost<ChatMessageResponse>("/chat/message", payload);
}

export function sendChatSpeech(payload: ChatSpeechRequest) {
  const formData = new FormData();

  formData.append(
    "audio_file",
    {
      uri: payload.fileUri,
      name: payload.fileName,
      type: payload.mimeType,
    } as unknown as Blob
  );

  formData.append("mode", payload.mode);
  formData.append("audio_format", payload.audioFormat);

  if (payload.audioDurationMs !== undefined) {
    formData.append("audio_duration_ms", String(payload.audioDurationMs));
  }

  if (payload.clientMessageId) {
    formData.append("client_message_id", payload.clientMessageId);
  }

  if (payload.sessionId) {
    formData.append("session_id", payload.sessionId);
  }

  if (payload.elderUserId) {
    formData.append("elder_user_id", payload.elderUserId);
  }

  if (payload.requesterRole) {
    formData.append("requester_role", payload.requesterRole);
  }

  formData.append("transcript_visibility", payload.transcriptVisibility);

  if (payload.latitude !== undefined) {
    formData.append("latitude", String(payload.latitude));
  }

  if (payload.longitude !== undefined) {
    formData.append("longitude", String(payload.longitude));
  }

  return apiPostForm<ChatSpeechResponse>("/chat/speech", formData);
}

export function sendWakeSpeech(payload: WakeSpeechRequest) {
  const formData = new FormData();

  formData.append(
    "audio_file",
    {
      uri: payload.fileUri,
      name: payload.fileName,
      type: payload.mimeType,
    } as unknown as Blob
  );

  formData.append("mode", payload.mode);
  formData.append("audio_format", payload.audioFormat);
  formData.append("transcript_visibility", "hidden");

  if (payload.audioDurationMs !== undefined) {
    formData.append("audio_duration_ms", String(payload.audioDurationMs));
  }

  if (payload.elderUserId) {
    formData.append("elder_user_id", payload.elderUserId);
  }

  return apiPostForm<WakeSpeechResponse>("/chat/speech", formData);
}

export function getChatHistory(
  limit = 50,
  elderUserId?: string,
  requesterRole?: ChatRequesterRole
) {
  const searchParams = new URLSearchParams({
    limit: String(limit),
  });

  if (elderUserId) {
    searchParams.append("elder_user_id", elderUserId);
  }

  if (requesterRole) {
    searchParams.append("requester_role", requesterRole);
  }

  return apiGet<ChatHistoryResponse>(`/chat/history?${searchParams.toString()}`);
}

export function getPlaceStatus(payload: ChatPlaceStatusRequest) {
  return apiPost<ChatPlaceStatusResponse>("/chat/place-status", payload);
}

export function buildChatTtsUrl(
  text: string,
  mode: CareMode,
  voice?: TtsVoiceId | string
) {
  const searchParams = new URLSearchParams({
    text,
    mode,
  });

  if (voice) {
    searchParams.append("voice", voice);
  }

  return buildApiUrl(`/chat/tts?${searchParams.toString()}`);
}

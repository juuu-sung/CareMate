import { apiGet, apiPost, apiPostForm, buildApiUrl } from "@/services/api";
import { CareMode } from "@/types/care";

export type ChatMessageRequest = {
  text: string;
  mode: CareMode;
  context_source: "text";
  client_message_id?: string;
  session_id?: string;
  elder_user_id?: string;
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
  transcriptVisibility: TranscriptVisibility;
  latitude?: number;
  longitude?: number;
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

  formData.append("transcript_visibility", payload.transcriptVisibility);

  if (payload.latitude !== undefined) {
    formData.append("latitude", String(payload.latitude));
  }

  if (payload.longitude !== undefined) {
    formData.append("longitude", String(payload.longitude));
  }

  return apiPostForm<ChatSpeechResponse>("/chat/speech", formData);
}

export function getChatHistory(limit = 50, elderUserId?: string) {
  const searchParams = new URLSearchParams({
    limit: String(limit),
  });

  if (elderUserId) {
    searchParams.append("elder_user_id", elderUserId);
  }

  return apiGet<ChatHistoryResponse>(`/chat/history?${searchParams.toString()}`);
}

export function getPlaceStatus(payload: ChatPlaceStatusRequest) {
  return apiPost<ChatPlaceStatusResponse>("/chat/place-status", payload);
}

export function buildChatTtsUrl(text: string, mode: CareMode) {
  const searchParams = new URLSearchParams({
    text,
    mode,
  });

  return buildApiUrl(`/chat/tts?${searchParams.toString()}`);
}

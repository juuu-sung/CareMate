import { apiPost } from "@/services/api";

export type ChatMessageRequest = {
  text: string;
  mode: string;
};

export type ChatMessageResponse = {
  answer: string;
  confirmation_needed: boolean;
};

export function sendChatMessage(payload: ChatMessageRequest) {
  return apiPost<ChatMessageResponse>("/chat/message", payload);
}

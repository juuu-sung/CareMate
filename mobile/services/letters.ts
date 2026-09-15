import { apiGet, apiPost } from "@/services/api";

export type SendLetterPayload = {
  elderUserId: string;
  linkCode: string;
  content: string;
};

export type LetterItem = {
  guardian_user_id: string;
  elder_user_id: string;
  content: string;
  created_at: string;
  sender_role: string;
};

type LetterListResponse = {
  success: boolean;
  letters: LetterItem[];
};

export function sendLetterFromGuardian(payload: SendLetterPayload) {
  return apiPost("/letters/send", {
    content: payload.content,
  });
}

export function fetchLettersForElder(elderUserId: string) {
  return apiGet<LetterListResponse>(`/letters/elder/${elderUserId}`);
}

export function fetchLettersForGuardian(elderUserId: string) {
  return apiGet<LetterListResponse>(`/letters/elder/${elderUserId}`);
}

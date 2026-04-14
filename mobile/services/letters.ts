import { apiGet, apiPost } from "@/services/api";

export type SendLetterPayload = {
  elderUserId: string;
  linkCode: string;
  content: string;
};

type LetterListResponse = {
  success: boolean;
  letters: Array<{
    guardian_user_id: string;
    elder_user_id: string;
    content: string;
    created_at: string;
    link_code: string;
    sender_role: string;
  }>;
};

export function sendLetterFromGuardian(payload: SendLetterPayload) {
  return apiPost("/letters/send", {
    elder_user_id: payload.elderUserId,
    link_code: payload.linkCode,
    content: payload.content,
  });
}

export function fetchLettersForElder(elderUserId: string, linkCode: string) {
  return apiGet<LetterListResponse>(
    `/letters/elder/${elderUserId}?link_code=${encodeURIComponent(linkCode)}`
  );
}

import { apiGet } from "@/services/api";

export type ScheduleItem = {
  id: string;
  elder_user_id?: string;
  senior_user_id?: string;
  title: string;
  description?: string;
  scheduled_at: string;
  date: string;
  time: string;
  type?: string;
  status: string;
  created_at?: string;
};

type ScheduleListResponse = {
  items: ScheduleItem[];
};

export async function getSchedules(elderUserId?: string): Promise<ScheduleItem[]> {
  const searchParams = elderUserId
    ? `?${new URLSearchParams({ senior_user_id: elderUserId }).toString()}`
    : "";

  console.log("[getSchedules] request =", `/schedules${searchParams}`);

  const response = await apiGet<ScheduleListResponse>(`/schedules${searchParams}`);
  console.log("[getSchedules] response =", response);

  return response.items ?? [];
}
import { apiGet } from "@/services/api";

export type ScheduleItem = {
  title: string;
  date: string;
  time: string;
  status: string;
};

type ScheduleListResponse = {
  items: ScheduleItem[];
};

export async function getSchedules(elderUserId?: string): Promise<ScheduleItem[]> {
  const searchParams = elderUserId
    ? `?${new URLSearchParams({ elder_user_id: elderUserId }).toString()}`
    : "";
  const response = await apiGet<ScheduleListResponse>(`/schedules${searchParams}`);
  return response.items;
}

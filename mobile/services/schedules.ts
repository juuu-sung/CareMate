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

export async function getSchedules(): Promise<ScheduleItem[]> {
  const response = await apiGet<ScheduleListResponse>("/schedules");
  return response.items;
}

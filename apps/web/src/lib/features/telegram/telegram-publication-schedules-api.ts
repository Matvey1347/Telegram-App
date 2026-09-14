import type { AxiosInstance } from "axios";
import type {
  TelegramChannelPublicationScheduleAssignment,
  TelegramChannelPublicationScheduleAssignmentInput,
  TelegramPublicationSchedule,
  TelegramPublicationScheduleInput,
  TelegramPublicationSlotOccurrence,
} from "@telegram-system/shared";

export function createTelegramPublicationSchedulesApi(api: AxiosInstance) {
  return {
    list: async () =>
      (await api.get<TelegramPublicationSchedule[]>("/telegram-publication-schedules")).data,
    create: async (payload: TelegramPublicationScheduleInput) =>
      (await api.post<TelegramPublicationSchedule>("/telegram-publication-schedules", payload)).data,
    update: async (id: string, payload: TelegramPublicationScheduleInput) =>
      (await api.patch<TelegramPublicationSchedule>(`/telegram-publication-schedules/${id}`, payload)).data,
    remove: async (id: string) =>
      (await api.delete<TelegramPublicationSchedule>(`/telegram-publication-schedules/${id}`)).data,
    getAssignment: async (channelId: string) =>
      (await api.get<TelegramChannelPublicationScheduleAssignment | null>(`/telegram-channels/${channelId}/publication-schedule`)).data,
    assign: async (channelId: string, payload: TelegramChannelPublicationScheduleAssignmentInput) =>
      (await api.put<TelegramChannelPublicationScheduleAssignment>(`/telegram-channels/${channelId}/publication-schedule`, payload)).data,
    occurrences: async (channelId: string, params: { from: string; to: string }) =>
      (await api.get<TelegramPublicationSlotOccurrence[]>(`/telegram-channels/${channelId}/publication-schedule/occurrences`, { params })).data,
  };
}

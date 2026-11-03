import type { ResolvedEmoji } from "@telegram-system/shared";
import { api } from "@/lib/api";

export type ChannelReminderTemplateInput = { name: string; iconId?: string | null; daysBefore: number[]; notifyEmpty: boolean };
export type ChannelReminderTemplate = ChannelReminderTemplateInput & { id: string; iconPresentation: ResolvedEmoji | null };
export type ChannelReminderAssignment = { channelId: string; templateId: string | null; memberId: string | null };
export type ChannelReminderSettings = { templates: ChannelReminderTemplate[]; assignments: ChannelReminderAssignment[] };
export type ChannelReminderAssignmentInput = { channelId: string; templateId: string | null; memberId: string | null };
const base = "/telegram/channel-reminders";
export const channelRemindersApi = {
  list: async () => (await api.get<ChannelReminderSettings>(base)).data,
  create: async (value: ChannelReminderTemplateInput) => (await api.post(`${base}/templates`, value)).data,
  update: async (id: string, value: ChannelReminderTemplateInput) => (await api.patch(`${base}/templates/${id}`, value)).data,
  remove: async (id: string) => (await api.delete(`${base}/templates/${id}`)).data,
  assign: async (value: { items: ChannelReminderAssignmentInput[] }) => (await api.put(`${base}/assignments`, value)).data,
};

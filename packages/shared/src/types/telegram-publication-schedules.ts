import type { ResolvedEmoji } from "./resolved-emoji";

export type TelegramPublicationSlotKind = "CONTENT" | "AD";

export type TelegramPublicationScheduleSelectionMode = "FULL" | "SUBSET";

export type TelegramPublicationScheduleSlot = {
  id: string;
  scheduleId: string;
  title: string;
  kind: TelegramPublicationSlotKind;
  time: string;
  position: number;
  isActive: boolean;
  iconPresentation: ResolvedEmoji | null;
};

export type TelegramPublicationSchedule = {
  id: string;
  name: string;
  iconId: string | null;
  iconPresentation: ResolvedEmoji | null;
  /** The timezone used to present `slots[].time`. Slot times are stored in UTC. */
  timezone: string;
  isDefault: boolean;
  slots: TelegramPublicationScheduleSlot[];
  assignedChannelsCount: number;
  assignedChannelIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type TelegramChannelPublicationScheduleAssignment = {
  id: string;
  channelId: string;
  scheduleId: string;
  selectionMode: TelegramPublicationScheduleSelectionMode;
  selectedSlotIds: string[];
  schedule: TelegramPublicationSchedule;
  updatedAt: string;
};

export type TelegramPublicationScheduleInput = {
  name: string;
  iconId?: string | null;
  isDefault?: boolean;
  slots: Array<{
    id?: string;
    title: string;
    kind: TelegramPublicationSlotKind;
    time: string;
    position?: number;
    isActive?: boolean;
    iconId?: string | null;
  }>;
};

export type TelegramChannelPublicationScheduleAssignmentInput = {
  scheduleId: string;
  selectionMode: TelegramPublicationScheduleSelectionMode;
  selectedSlotIds?: string[];
};

export type TelegramPublicationSlotOccurrence = {
  slotId: string;
  scheduledAt: string;
  title: string;
  kind: TelegramPublicationSlotKind;
  time: string;
  timezone: string;
  state: "AVAILABLE" | "OCCUPIED" | "PAST";
  postId?: string | null;
  postTitle?: string | null;
};

export type TelegramPublicationSlotOccurrencesByChannel = Record<
  string,
  TelegramPublicationSlotOccurrence[]
>;

/** A scheduled publication, including one that does not land on a plan slot. */
export type TelegramPublicationPlanCalendarEvent = {
  id: string;
  channelId: string;
  scheduledAt: string;
  title: string;
  kind: "CONTENT" | "AD" | "VP";
  slotId: string | null;
  adSaleId?: string | null;
  crossPromotionPlanId?: string | null;
  avatarPresentation?: ResolvedEmoji | null;
  avatarUrl?: string | null;
};

export type TelegramPublicationPlanCalendar = {
  channelIds: string[];
  occurrencesByChannel: TelegramPublicationSlotOccurrencesByChannel;
  events: TelegramPublicationPlanCalendarEvent[];
};

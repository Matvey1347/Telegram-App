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
  isDefault: boolean;
  slots: TelegramPublicationScheduleSlot[];
  assignedChannelsCount: number;
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
};

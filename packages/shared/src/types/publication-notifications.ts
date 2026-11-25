import type { ResolvedEmoji } from "./resolved-emoji";

export type PublicationNotificationPart = {
  text: string;
  href?: string;
  strong?: boolean;
};
export type PublicationNotificationLine = PublicationNotificationPart & {
  icon?: ResolvedEmoji | null;
  iconFallback?: string;
  parts?: PublicationNotificationPart[];
};

export type PublicationNotificationChannel = {
  id: string;
  title: string;
  iconPresentation: ResolvedEmoji | null;
};

export const publicationNotificationDestinations = [
  "IN_APP",
  "TELEGRAM_GROUP",
  "TELEGRAM_PRIVATE",
] as const;
export type PublicationNotificationDestination =
  (typeof publicationNotificationDestinations)[number];
export const publicationConfirmationDestinations = [
  "TELEGRAM_PRIVATE",
  "TELEGRAM_GROUP",
  "DISABLED",
] as const;
export type PublicationConfirmationDestination =
  (typeof publicationConfirmationDestinations)[number];
export type PublicationConfirmationDelivery = {
  status: "SENT" | "NOT_CONNECTED" | "NOT_CONFIGURED" | "DISABLED";
  customEmojiCount?: number;
};

export type PublicationNotificationSettings = {
  coverageDestination: PublicationNotificationDestination;
  autopilotDestination: PublicationNotificationDestination;
  autopilotErrorDestination: PublicationNotificationDestination;
  scheduledConfirmationDestination: PublicationConfirmationDestination;
  publishedConfirmationDestination: PublicationConfirmationDestination;
  enabled: boolean;
  excludedChannelIds: string[];
};

export type PublicationNotificationSettingsView =
  PublicationNotificationSettings & {
    channels: PublicationNotificationChannel[];
  };

export type PublicationNotificationPreview = {
  coverage: PublicationNotificationLine[];
  autopilot: PublicationNotificationLine[];
  autopilotError: PublicationNotificationLine[];
  scheduledConfirmation: PublicationNotificationLine[];
  publishedConfirmation: PublicationNotificationLine[];
};

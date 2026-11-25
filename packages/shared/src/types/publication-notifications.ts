import type { ResolvedEmoji } from "./resolved-emoji";

export type PublicationNotificationLine = {
  text: string;
  icon?: ResolvedEmoji | null;
  href?: string;
  strong?: boolean;
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
export type PublicationNotificationSettings = {
  coverageDestination: PublicationNotificationDestination;
  autopilotDestination: PublicationNotificationDestination;
  autopilotErrorDestination: PublicationNotificationDestination;
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
};

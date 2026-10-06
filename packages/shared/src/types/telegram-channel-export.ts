/**
 * Stable groups of channel data that can be included in a workbook export.
 * Keep new channel-owned data in one of these groups (or add a new group) so
 * the export UI and API stay in sync as the product grows.
 */
export const TELEGRAM_CHANNEL_EXPORT_SECTIONS = [
  'channel_profile',
  'ads',
  'crm',
  'finance',
  'channel_stats',
  'channel_dynamics',
  'traffic_attribution',
] as const;

export type TelegramChannelExportSection =
  (typeof TELEGRAM_CHANNEL_EXPORT_SECTIONS)[number];

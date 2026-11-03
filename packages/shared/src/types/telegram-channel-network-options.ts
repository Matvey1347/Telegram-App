import type { ResolvedEmoji } from "./resolved-emoji";

/** Compact network shape for channel-scope selectors. */
export type TelegramChannelNetworkOption = {
  id: string;
  name: string;
  iconPresentation?: ResolvedEmoji | null;
  channels: Array<{ id: string }>;
};

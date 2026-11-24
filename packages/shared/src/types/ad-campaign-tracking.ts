export type AdCampaignTrackingScope = {
  kind: string;
  /** null selects all other owned channels, including subsequently configured channels. */
  channelIds: string[] | null;
};

export type AdCampaignTrackingChannel = {
  id: string;
  title: string;
  photoUrl: string | null;
  hasSystemLink: boolean;
};

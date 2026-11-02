/** Neutral channel transport only. Business processing approval is checked by CRM. */
export type TelegramLeadChannel = {
  channelId: string;
  username: string | null;
  title: string;
  url: string | null;
  pts: number | null;
  subscribed: boolean;
};
export type TelegramLeadPost = {
  channelId: string;
  messageId: number;
  text: string;
  publishedAt: Date;
  editedAt: Date | null;
  metadata?: TelegramLeadPostMetadata;
};
export type TelegramLeadPostMetadata = {
  complete: boolean;
  textComplete?: boolean;
  incompleteReasons: string[];
  unsupportedEntityTypes?: string[];
  entityUrls: string[];
  textUrls?: string[];
  inlineButtonUrls: string[];
  mentions: string[];
  hasForwardMetadata: boolean;
  forwardChannelId: string | null;
  hasMedia: boolean;
  mediaType: 'PHOTO' | 'DOCUMENT' | 'OTHER' | null;
};
export type TelegramLeadChannelEvent =
  | {
      type: 'post.new' | 'post.edited';
      post: TelegramLeadPost;
      pts: number;
      ptsCount: number;
    }
  | {
      type: 'post.deleted';
      channelId: string;
      messageIds: number[];
      pts: number;
      ptsCount: number;
    }
  | { type: 'channel.gap'; channelId: string | null };
export type TelegramLeadRecovery = {
  posts: TelegramLeadPost[];
  deletedIds: number[];
  pts: number;
  final: boolean;
  tooLong: boolean;
};
export interface TelegramLeadChannelHandle {
  /** Public channel description on the existing session; never joins or reads messages. */
  publicProfile?(
    username: string,
  ): Promise<{ channelId: string; username: string; about: string }>;
  /** Explicit, bounded media read on the existing live session; never marks read. */
  readPhoto?(
    channelId: string,
    input: { messageId: number; maxBytes: number; reference?: string },
  ): Promise<{ data: Buffer; mime: string; post: TelegramLeadPost }>;
  list(input: { cursor?: string; limit?: number }): Promise<{
    items: TelegramLeadChannel[];
    nextCursor: string | null;
    hasMore: boolean;
  }>;
  resolve(reference: string): Promise<TelegramLeadChannel>;
  history(
    channelId: string,
    input: { beforeId?: number; limit?: number; reference?: string },
  ): Promise<{
    items: TelegramLeadPost[];
    hasMore: boolean;
    nextBeforeId: number | null;
  }>;
  recover(
    channelId: string,
    pts: number,
    reference?: string,
  ): Promise<TelegramLeadRecovery>;
  onEvent(handler: (event: TelegramLeadChannelEvent) => void): () => void;
}

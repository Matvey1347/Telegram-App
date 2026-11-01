import type { TelegramLeadChannelHandle } from './telegram-lead-channel.types';

export type TelegramCrmMtprotoCredentials = {
  apiId: string;
  apiHash: string;
  session: string;
};

export type TelegramCrmMtprotoPeer = {
  telegramUserId: string;
  telegramAccessHash: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  /** Available only when Telegram exposes the number to this account. */
  phone?: string | null;
  photoUrl: string | null;
};

export type TelegramCrmMtprotoMessage = {
  telegramMessageId: number;
  telegramUserId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  text: string | null;
  sentAt: Date;
  editedAt: Date | null;
  contentMetadata: Record<string, unknown> | null;
};

export type TelegramCrmMtprotoDialog = {
  peer: TelegramCrmMtprotoPeer;
  telegramDialogId: string;
  unreadCount: number;
  lastMessage: TelegramCrmMtprotoMessage | null;
  folderIds?: number[];
};

export type TelegramCrmMtprotoDialogFolder = {
  id: number;
  title: string;
  emoticon: string | null;
  color: number | null;
};

export type TelegramCrmMtprotoDialogPage = {
  dialogs: TelegramCrmMtprotoDialog[];
  folders?: TelegramCrmMtprotoDialogFolder[];
  scanned: number;
  total: number;
  nextCursor: string | null;
  exhausted: boolean;
};

export type TelegramCrmMtprotoHistoryPage = {
  messages: TelegramCrmMtprotoMessage[];
  nextBeforeTelegramMessageId: number | null;
  exhausted: boolean;
};

export type TelegramCrmMtprotoCheckpoint = {
  pts: number;
  qts: number;
  date: number;
  seq: number;
};

export type TelegramCrmChatPeer = {
  telegramUserId: string;
  telegramAccessHash: string;
};

export type TelegramCrmChatReadState = {
  pts: number;
  topMessageId: number;
  unreadCount: number;
  readInboxMaxId: number;
};

export type TelegramCrmChatActions = {
  getReadState?: (
    input: TelegramCrmChatPeer,
  ) => Promise<TelegramCrmChatReadState>;
  getMessage(
    input: TelegramCrmChatPeer & { telegramMessageId: number },
  ): Promise<TelegramCrmMtprotoMessage | null>;
  editText(
    input: TelegramCrmChatPeer & { telegramMessageId: number; text: string },
  ): Promise<TelegramCrmMtprotoMessage>;
  deleteMessages(
    input: TelegramCrmChatPeer & {
      telegramMessageIds: number[];
      revoke: boolean;
    },
  ): Promise<{ confirmed: true }>;
  setReaction(
    input: TelegramCrmChatPeer & {
      telegramMessageId: number;
      emoji: string | null;
    },
  ): Promise<TelegramCrmMtprotoMessage>;
  forwardMessage(input: {
    origin: TelegramCrmChatPeer;
    destination: TelegramCrmChatPeer;
    telegramMessageId: number;
    randomId: bigint;
  }): Promise<TelegramCrmMtprotoMessage>;
  sendMedia(
    input: TelegramCrmChatPeer & {
      data: Buffer;
      fileName: string;
      mimeType: string;
      kind: 'IMAGE' | 'FILE' | 'VOICE';
      caption?: string;
      randomId: bigint;
      replyToTelegramMessageId?: number;
    },
  ): Promise<TelegramCrmMtprotoMessage>;
  downloadMedia(
    input: TelegramCrmChatPeer & {
      telegramMessageId: number;
      maxBytes: number;
    },
  ): Promise<{ data: Buffer; fileName: string; mimeType: string }>;
};

export type TelegramCrmMtprotoUpdate =
  | {
      type: 'message.deleted';
      telegramMessageIds: number[];
      /** Hydrated by the domain before commit, never guessed from local unread flags. */
      readStates?: Array<TelegramCrmChatReadState & { telegramUserId: string }>;
      sequence?: { pts: number; ptsCount: number };
    }
  | {
      type: 'message.reactions';
      telegramUserId: string;
      telegramMessageId: number;
      reactions: Array<{ emoji: string; count: number; chosen: boolean }>;
    }
  | {
      type: 'message.new' | 'message.edited';
      message: TelegramCrmMtprotoMessage;
      sequence?: { pts: number; ptsCount: number };
    }
  | {
      type: 'history.inboxRead' | 'history.outboxRead';
      telegramUserId: string;
      maxTelegramMessageId: number;
      stillUnreadCount: number | null;
      sequence?: { pts: number; ptsCount: number };
    }
  | {
      type: 'peer.metadata';
      telegramUserId: string;
      username?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    }
  | { type: 'sync.gap'; reason: 'UPDATES_TOO_LONG' };

export type TelegramCrmMtprotoDifference = {
  updates: TelegramCrmMtprotoUpdate[];
  peers: TelegramCrmMtprotoPeer[];
  checkpoint: TelegramCrmMtprotoCheckpoint;
  final: boolean;
  tooLong: boolean;
};

export interface TelegramCrmMtprotoHandle {
  readonly leadDiscovery?: TelegramLeadChannelHandle;
  readonly chatActions?: TelegramCrmChatActions;
  listPrivateDialogs(input: {
    cursor?: string | null;
    limit?: number;
  }): Promise<TelegramCrmMtprotoDialogPage>;
  setDialogFolderMembership(input: {
    folderId: number;
    telegramUserId: string;
    telegramAccessHash: string;
    included: boolean;
  }): Promise<void>;
  getHistory(input: {
    telegramUserId: string;
    telegramAccessHash: string;
    beforeTelegramMessageId?: number | null;
    limit?: number;
  }): Promise<TelegramCrmMtprotoHistoryPage>;
  resolvePrivatePeer(input: {
    telegramUserId: string;
    username?: string | null;
  }): Promise<TelegramCrmMtprotoPeer>;
  resolvePrivatePeerReference(
    reference: string,
  ): Promise<TelegramCrmMtprotoPeer>;
  sendText(input: {
    telegramUserId: string;
    telegramAccessHash: string;
    text: string;
    randomId: bigint;
    replyToTelegramMessageId?: number;
  }): Promise<TelegramCrmMtprotoMessage>;
  markRead(input: {
    telegramUserId: string;
    telegramAccessHash: string;
    maxTelegramMessageId: number;
  }): Promise<void>;
  getState(): Promise<TelegramCrmMtprotoCheckpoint>;
  getDifference(
    checkpoint: TelegramCrmMtprotoCheckpoint,
  ): Promise<TelegramCrmMtprotoDifference>;
  onUpdate(
    handler: (update: TelegramCrmMtprotoUpdate) => void,
    onError?: (error: Error) => void,
  ): () => void;
  close(): Promise<void>;
}

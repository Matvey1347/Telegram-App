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
};

export type TelegramCrmMtprotoDialogPage = {
  dialogs: TelegramCrmMtprotoDialog[];
  scanned: number;
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

export type TelegramCrmMtprotoUpdate =
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
  listPrivateDialogs(input: {
    cursor?: string | null;
    limit?: number;
  }): Promise<TelegramCrmMtprotoDialogPage>;
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
  sendText(input: {
    telegramUserId: string;
    telegramAccessHash: string;
    text: string;
    randomId: bigint;
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

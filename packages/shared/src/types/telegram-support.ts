export type SupportProduct = "NEXELOQ" | "GROSHLY";

export type SupportBotView = {
  product: SupportProduct;
  username: string | null;
  configured: boolean;
  open: number;
  needsReply: number;
};

export type SupportTicket = {
  id: string;
  workspaceId: string;
  product: SupportProduct;
  senderName: string;
  username: string | null;
  preview: string;
  needsReply: boolean;
  closedAt: string | null;
  updatedAt: string;
};

export type SupportMessage = {
  id: string;
  text: string;
  status: string;
  automatic?: boolean;
  replyId?: string | null;
  telegramMessageId?: number | null;
  replyToTelegramId?: number | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  reactions?: string[];
  legacy?: boolean;
  formatted?: boolean;
  createdAt: string;
};


export type SupportThreadPage = {
  items: SupportMessage[];
  nextCursor: string | null;
  lastInboundAt: string | null;
};

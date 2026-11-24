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
  createdAt: string;
};

import type {
  TelegramAdPricingMode,
  TelegramAdSale,
} from "./telegram-ad-sales";

export type TelegramAdSaleCheckoutPlacement = {
  telegramChannelId: string;
  telegramChannelNetworkId?: string | null;
  telegramAdProductId?: string | null;
  inventoryOpportunityKey?: string | null;
  scheduledAt: string;
  timezone: string;
  pricingMode?: TelegramAdPricingMode;
  agreedPrice: number;
  expectedViews?: number | null;
  recommendedPrice?: number | null;
  minimumPrice?: number | null;
  currency: string;
  manualPriceReason?: string | null;
  telegramPostId?: string | null;
  managedPostDraft?: {
    title: string;
    text: string;
    /** Imported Telegram source text retained for the composer preview. */
    plainText?: string;
    /** Sanitized imported Telegram HTML retained for the composer preview. */
    formattedHtml?: string;
    imageUrls: string[];
    buttonRows: Array<
      Array<{
        text: string;
        url: string;
        style: "default" | "primary" | "success" | "danger";
      }>
    >;
  } | null;
};

export type TelegramAdSaleCheckoutRequest = {
  advertiserId?: string | null;
  createAdvertiser?: boolean;
  advertiserName: string;
  advertiserTelegram?: string | null;
  advertiserContact?: string | null;
  advertiserCompanyName?: string | null;
  origin?: string;
  settlementCurrency: string;
  assignedMemberId?: string | null;
  placements: TelegramAdSaleCheckoutPlacement[];
  priceAllocation?: {
    mode: "PROPORTIONAL_BY_AUDIENCE";
    totalAmount: number;
  };
  /** Creates the reservation without a Finance payment or transaction. */
  financeSkipped?: boolean;
  /** Required by paymentless checkout retries. */
  idempotencyKey?: string;
  payment?: {
    accountId: string;
    amount: number;
    currency: string;
    paidAt: string;
    notes?: string | null;
    idempotencyKey?: string | null;
  };
};

export type TelegramAdSaleCheckoutResponse = TelegramAdSale;

export type TelegramAdSaleDraft = {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  title: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type TelegramAdSaleCheckoutWorkflowFailure = {
  placementId: string;
  channelId: string;
  operation: "CREATE_POST" | "SCHEDULE_POST";
  message: string;
};

export type TelegramAdSaleCheckoutWorkflowResponse = {
  sale: TelegramAdSale;
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
  };
  failures: TelegramAdSaleCheckoutWorkflowFailure[];
};

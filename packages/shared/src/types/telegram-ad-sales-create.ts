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
  payment: {
    accountId: string;
    amount: number;
    currency: string;
    paidAt: string;
    notes?: string | null;
    idempotencyKey?: string | null;
  };
};

export type TelegramAdSaleCheckoutResponse = TelegramAdSale;

import type {
  TelegramAdPriceQuote,
  TelegramAdPricingMode,
  TelegramAdSale,
  TelegramAdSalePlacement,
} from "./telegram-ad-sales";
import type { PaginatedResponse } from "../pagination";

/**
 * Supports the product's 100-channel, three-month quote surface in one request
 * while keeping request validation and backend work explicitly bounded.
 */
export const TELEGRAM_AD_QUOTE_PREVIEW_MAX_REQUESTS = 10_000;

/** Historical quote previews retain exact as-of semantics up to this bound. */
export const TELEGRAM_AD_QUOTE_PREVIEW_MAX_HISTORICAL_CUTOFFS = 31;

/** The overview renders one comparable series/card set per selected channel. */
export const TELEGRAM_AD_ANALYTICS_MAX_SELECTED_CHANNELS = 6;

export type TelegramAdSaleListManagedPostSummary = Pick<
  NonNullable<TelegramAdSalePlacement["managedPost"]>,
  | "status"
  | "lastError"
  | "telegramMessageIds"
  | "telegramMessageUrls"
  | "telegramRemoteStatus"
>;

export type TelegramAdSaleListPlacement = Omit<
  TelegramAdSalePlacement,
  "managedPost"
> & {
  managedPost?: TelegramAdSaleListManagedPostSummary | null;
};

/** Compact collection row. Rich managed posts, payments and advertisers remain detail-only. */
export type TelegramAdSaleListItem = Omit<
  TelegramAdSale,
  "payments" | "advertiser" | "placements"
> & {
  advertiserSummary?: {
    displayName: string;
    telegramUsername: string | null;
  } | null;
  placements: TelegramAdSaleListPlacement[];
};

export type TelegramAdSalesListResult =
  PaginatedResponse<TelegramAdSaleListItem>;

export type TelegramAdQuotePreviewRequest = {
  requestId: string;
  telegramChannelId: string;
  telegramAdProductId?: string | null;
  targetCpm?: number | null;
  minimumCpm?: number | null;
  fixedPrice?: number | null;
  pricingMode?: TelegramAdPricingMode;
  currency?: string;
  scheduledAt?: string;
};

export type TelegramAdQuotePreviewBatchRequest = {
  requests: TelegramAdQuotePreviewRequest[];
};

export type TelegramAdQuotePreviewResult =
  | {
      requestId: string;
      quote: TelegramAdPriceQuote;
      error?: never;
    }
  | {
      requestId: string;
      quote?: never;
      error: {
        code: "CHANNEL_NOT_FOUND" | "PRODUCT_NOT_FOUND" | "INVALID_REQUEST";
        message: string;
      };
    };

export type TelegramAdQuotePreviewBatchResponse = {
  items: TelegramAdQuotePreviewResult[];
};

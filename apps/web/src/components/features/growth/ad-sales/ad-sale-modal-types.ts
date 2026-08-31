import type { ReactNode } from "react";
import type {
  TelegramAdAvailabilitySlot,
  TelegramAdProduct,
  TelegramAdQuotePreviewBatchResponse,
  TelegramAdQuotePreviewRequest,
  TelegramAdSale,
  TelegramAdSaleOrigin,
  TelegramAdvertiser,
  TelegramAdStructuredError,
} from "@telegram-system/shared";
import type { Account, TelegramChannel, TelegramChannelNetwork } from "@/lib/api";
import type { PlacementManagedPostDraft } from "./placement-post/placement-post-composer";
import type { PublishedPostOption } from "./ad-sale-types";
import type { AdSalePriceAllocation } from "./ad-sale-network-pricing";

export type AdSaleModalProps = {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  channels: TelegramChannel[];
  networks: TelegramChannelNetwork[];
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  defaultCurrency: string;
  workspaceTimezone: string;
  onLoadAvailableSlots: (params: {
    channelId: string;
    productId?: string;
    from: string;
    to: string;
  }) => Promise<TelegramAdAvailabilitySlot[]>;
  onLoadPublishedPosts: (params: {
    channelId: string;
    date: string;
    timezone: string;
    telegramPostUrl?: string;
  }) => Promise<PublishedPostOption[]>;
  onRequestQuotePreview: (
    requests: TelegramAdQuotePreviewRequest[],
    signal?: AbortSignal,
  ) => Promise<TelegramAdQuotePreviewBatchResponse>;
  onSearchAdvertisers: (query: string) => Promise<TelegramAdvertiser[]>;
  onSubmit: (payload: {
    advertiserId?: string | null;
    createAdvertiser?: boolean;
    advertiserName: string;
    advertiserTelegram?: string;
    advertiserContact?: string;
    notes?: string;
    origin: TelegramAdSaleOrigin;
    assignedMemberId?: string | null;
    accountId: string;
    paymentAmount: number;
    paymentCurrency: string;
    priceAllocation?: AdSalePriceAllocation;
    placements: Array<{
      channelId: string;
      productId?: string;
      inventoryOpportunityKey?: string | null;
      scheduledAt: string;
      timezone: string;
      agreedPrice: number;
      recommendedPrice: number;
      minimumPrice: number;
      expectedViews: number;
      pricingMode: "CPM" | "FIXED" | "MANUAL";
      manualPriceReason?: string;
      telegramPostId?: string | null;
      managedPostDraft?: PlacementManagedPostDraft | null;
    }>;
  }) => Promise<{
    sale: TelegramAdSale;
    conflicts?: TelegramAdStructuredError[];
  }>;
  busy?: boolean;
  initialChannelId?: string | null;
  initialScheduledAt?: string | null;
  initialInventoryOpportunityKey?: string | null;
  headerAction?: ReactNode;
  sessionOpen?: boolean;
  systemBotConnected?: boolean;
  systemBotUsername?: string | null;
  onSystemBotReturn?: (
    workflowId: string,
    channelIds: string[],
  ) => Promise<PlacementManagedPostDraft | null>;
  onPrepareSystemBot?: () => Promise<string>;
  onSendSystemBotPost?: (draft: PlacementManagedPostDraft) => Promise<void>;
};

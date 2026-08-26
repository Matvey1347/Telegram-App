import type {
  TelegramAdSale,
  TelegramPostButtonRows,
} from '@telegram-system/shared';

export type TelegramAdSalesBotSale = TelegramAdSale & {
  placements: Array<
    TelegramAdSale['placements'][number] & {
      managedPost?: { id: string; status: string } | null;
    }
  >;
};

export type TelegramAdSalesBotDeliveryAction =
  | 'SKIP_POST'
  | 'SAVE_DRAFT'
  | 'SCHEDULE'
  | 'PUBLISH_NOW';

export type TelegramAdSalesBotPostInput = {
  title?: string;
  text?: string | null;
  imageUrls?: string[];
  buttonRows?: TelegramPostButtonRows;
  icon?: string | null;
  longTextMode?: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT';
};

export type TelegramAdSalesBotCommitInput = {
  commandId: string;
  existingSaleId?: string;
  existingPlacementId?: string;
  existingManagedPostId?: string;
  assignedMemberId?: string;
  target?:
    | { kind: 'CHANNELS'; channelIds: string[] }
    | { kind: 'NETWORK'; networkId: string };
  formatName?: '1/24' | '2/48' | '3/72' | 'No auto-delete';
  /** @deprecated Temporary compatibility for the original single-channel wizard. */
  channelId?: string;
  /** @deprecated Temporary compatibility for the original single-channel wizard. */
  productId?: string;
  finance?: {
    accountId: string;
    amount: number;
    paidAt?: string;
  };
  advertiserLabel?: string;
  scheduledAt?: string;
  deliveryAction: TelegramAdSalesBotDeliveryAction;
  post?: TelegramAdSalesBotPostInput;
};

export type TelegramLoginStartResponse = {
  success: true;
  status: "needs_code";
  isCodeViaApp: boolean;
  smsUnavailable?: boolean;
};

export type TelegramQrLoginAccount = {
  id: string;
  label: string;
  apiId: string;
  phoneMasked?: string | null;
  telegramUserId?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  photoUrl?: string | null;
  nameColor?: number | null;
  isPremium: boolean;
  premiumCheckedAt?: string | null;
  captionLengthMax: number;
  messageLengthMax: number;
  premiumCapabilities?: {
    maxUploadFileSizeMb: number;
    supportsCustomEmoji: boolean;
    limitsSource: "telegram_config" | "fallback";
  } | null;
  status: "connected";
  lastErrorMessage?: string | null;
  lastCheckedAt?: string | null;
  lastSyncedAt?: string | null;
  isActive: boolean;
};

export type TelegramQrLoginProgress =
  | {
      type: "qr";
      loginUrl: string;
      /** Telegram token expiry as Unix epoch milliseconds. */
      expiresAt: number;
    }
  | {
      /** Emitted immediately after the new StringSession is persisted. */
      type: "connected";
      account: TelegramQrLoginAccount;
    };

export type TelegramQrLoginResult =
  | { success: true; status: "needs_password" }
  | {
      success: true;
      status: "connected";
      account: TelegramQrLoginAccount;
    };

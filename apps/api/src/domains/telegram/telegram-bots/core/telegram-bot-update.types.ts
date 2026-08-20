import type {
  TelegramBotIntegration,
  TelegramBotRuntimeInstance,
} from '@prisma/client';

export type TelegramBotUpdateActor = {
  id?: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};

export type TelegramBotWebhookUpdate = {
  update_id?: number | string;
  message?: {
    chat?: { id?: number | string; type?: string };
    from?: TelegramBotUpdateActor;
    text?: string;
    photo?: Array<{
      file_id?: string;
      file_size?: number;
      width?: number;
      height?: number;
    }>;
    document?: {
      file_id?: string;
      file_size?: number;
      mime_type?: string;
      file_name?: string;
    };
    successful_payment?: {
      currency?: string;
      total_amount?: number;
      invoice_payload?: string;
      telegram_payment_charge_id?: string;
      provider_payment_charge_id?: string;
      subscription_expiration_date?: number;
      is_recurring?: boolean;
      is_first_recurring?: boolean;
    };
  };
  pre_checkout_query?: {
    id?: string;
    from?: TelegramBotUpdateActor;
    currency?: string;
    total_amount?: number;
    invoice_payload?: string;
  };
  callback_query?: {
    id?: string;
    from?: TelegramBotUpdateActor;
    message?: { chat?: { id?: number | string }; message_id?: number };
    data?: string;
  };
  chat_join_request?: {
    chat?: { id?: number | string; title?: string; username?: string };
    from?: TelegramBotUpdateActor;
    user_chat_id?: number | string;
    date?: number;
    invite_link?: { invite_link?: string };
  };
};

export type TelegramBotApplicationContext = {
  bot: TelegramBotIntegration;
  runtime: TelegramBotRuntimeInstance;
  token: string;
  update: TelegramBotWebhookUpdate;
  updateLogId: string;
};

export type FinanceFlowKind =
  | 'TRANSACTION_CREATE'
  | 'ACCOUNT_CREATE'
  | 'ACCOUNT_EDIT'
  | 'CATEGORY_CREATE'
  | 'CATEGORY_EDIT'
  | 'CATEGORY_ARCHIVE'
  | 'TRANSFER_CREATE'
  | 'SETTINGS_LANGUAGE';

export type FinanceFlowPayload = Record<string, string | null | undefined>;

export type FinanceFlowChoice = {
  id: string;
  label: string;
  key?: string | null;
  emoji?: string;
  telegramCustomEmojiId?: string;
};

export type FinanceFlowInput = {
  profileId: string;
  botIntegrationId: string;
  telegramBotUserId: string;
};

export type FinanceFlowCallback =
  | { action: 'back' | 'cancel' | 'confirm' | 'skip'; revision?: string }
  | {
      action:
        | 'account'
        | 'category'
        | 'parent'
        | 'type'
        | 'currency'
        | 'language'
        | 'page'
        | 'emoji';
      id: string;
      revision?: string;
    };

export type FinanceFlowResult =
  | {
      kind: 'prompt';
      flow: FinanceFlowKind;
      step: string;
      payload: FinanceFlowPayload;
      page?: number;
      choices?: FinanceFlowChoice[];
    }
  | {
      kind: 'review';
      flow: FinanceFlowKind;
      step: string;
      payload: FinanceFlowPayload;
      page?: number;
    }
  | {
      kind: 'created' | 'updated';
      flow: FinanceFlowKind;
      id: string;
      payload: FinanceFlowPayload;
    }
  | {
      kind: 'invalid';
      flow: FinanceFlowKind;
      reason: 'text' | 'amount' | 'currency' | 'selection';
    }
  | {
      kind: 'cancelled' | 'expired';
      flow?: FinanceFlowKind;
      payload?: FinanceFlowPayload;
    }
  | null;

export type AccountFlowResult =
  | { kind: 'name' }
  | { kind: 'currency'; name: string }
  | { kind: 'balance' }
  | { kind: 'created'; name: string; currency: string; balance: string }
  | {
      kind:
        | 'invalid-name'
        | 'invalid-currency'
        | 'invalid-balance'
        | 'cancelled';
    }
  | null;

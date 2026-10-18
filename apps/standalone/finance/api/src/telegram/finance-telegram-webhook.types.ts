export interface FinanceTelegramWebhookUpdate {
  update_id?: number | string;
  [key: string]: unknown;
}

export interface FinanceWebhookUpdateStore {
  findUnique(args: {
    where: { financeBotId_updateId: { financeBotId: string; updateId: string } };
  }): Promise<{ id: string } | null>;
  create(args: {
    data: { financeBotId: string; updateId: string; payload: any };
  }): Promise<{ id: string }>;
  update(args: {
    where: { id: string };
    data: { status: 'ACCEPTED'; processedAt: Date };
  }): Promise<unknown>;
}

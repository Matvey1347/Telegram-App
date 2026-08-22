export const FINANCE_REMINDER_DELIVERY_PORT = Symbol(
  'FINANCE_REMINDER_DELIVERY_PORT',
);

export type FinanceReminderDelivery = {
  workspaceId: string;
  botIntegrationId: string;
  telegramBotUserId: string;
  financeReminderId: string;
  chatId: string;
  text: string;
  scheduledAt: Date;
  idempotencyKey: string;
};

export interface FinanceReminderDeliveryPort {
  scheduleNext(reminderId: string): Promise<FinanceReminderDelivery | null>;
}

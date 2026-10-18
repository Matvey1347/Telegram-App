import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FinanceTelegramWebhookService } from './finance-telegram-webhook.service';
import type { FinanceWebhookUpdateStore } from './finance-telegram-webhook.types';

const secret = 'a-secure-finance-webhook-secret-with-32-chars';

function createStore(): jest.Mocked<FinanceWebhookUpdateStore> {
  return {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'update-log-1' }),
    update: jest.fn().mockResolvedValue({}),
  };
}

describe('FinanceTelegramWebhookService', () => {
  it('accepts a signed update once and persists its idempotency record', async () => {
    const store = createStore();
    const service = new FinanceTelegramWebhookService(
      {} as never,
      { financeWebhookUpdate: store } as never,
      { webhookSecret: () => secret, resolve: jest.fn().mockResolvedValue({ id: 'bot-1' }) } as never,
    );

    await expect(service.receive(secret, { update_id: 42 })).resolves.toEqual({
      ok: true,
      duplicate: false,
    });
    expect(store.create).toHaveBeenCalledWith({
      data: { financeBotId: 'bot-1', updateId: '42', payload: { update_id: 42 } },
    });
  });

  it('returns duplicate when a concurrent Telegram retry hits the unique key', async () => {
    const store = createStore();
    store.create.mockRejectedValue({ code: 'P2002' });
    const service = new FinanceTelegramWebhookService(
      {} as never,
      { financeWebhookUpdate: store } as never,
      { webhookSecret: () => secret, resolve: jest.fn().mockResolvedValue({ id: 'bot-1' }) } as never,
    );

    await expect(service.receive(secret, { update_id: 42 })).resolves.toEqual({
      ok: true,
      duplicate: true,
    });
  });

  it('rejects unsigned and malformed updates before persistence', async () => {
    const store = createStore();
    const service = new FinanceTelegramWebhookService(
      {} as never,
      { financeWebhookUpdate: store } as never,
      { webhookSecret: () => secret, resolve: jest.fn().mockResolvedValue({ id: 'bot-1' }) } as never,
    );

    await expect(service.receive(undefined, { update_id: 42 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.receive(secret, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(store.create).not.toHaveBeenCalled();
  });
});

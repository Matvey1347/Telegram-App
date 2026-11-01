import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { FinanceTelegramWebhookService, claimAndAccept } from './finance-telegram-webhook.service';
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
  it('keeps the deduplication store primitive for a future processing adapter', async () => {
    const store = createStore();
    await expect(claimAndAccept(store, 'bot-1', { update_id: 42 })).resolves.toEqual({
      ok: true,
      duplicate: false,
    });
    expect(store.create).toHaveBeenCalledWith({
      data: { financeBotId: 'bot-1', updateId: '42', payload: { update_id: 42 } },
    });
  });

  it('returns duplicate when a concurrent claim hits the unique key', async () => {
    const store = createStore();
    store.create.mockRejectedValue({ code: 'P2002' });
    await expect(claimAndAccept(store, 'bot-1', { update_id: 42 })).resolves.toEqual({
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

  it('rejects signed updates without claiming or acknowledging them while no dispatcher exists', async () => {
    const store = createStore();
    const primaryBot = { webhookSecret: () => secret, resolve: jest.fn() };
    const service = new FinanceTelegramWebhookService(
      {} as never,
      { financeWebhookUpdate: store } as never,
      primaryBot as never,
    );

    expect(service.canProcessUpdates()).toBe(false);
    await expect(service.receive(secret, { update_id: 42 })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(primaryBot.resolve).not.toHaveBeenCalled();
    expect(store.findUnique).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });
});

import { BadRequestException } from '@nestjs/common';
import { BotBillingService } from './bot-billing.service';

function setup(providerConfigs: Array<{ botIntegrationId: string | null; mode: 'TEST' | 'LIVE' }>) {
  let planSequence = 0;
  const prisma = {
    telegramBotIntegration: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce({ id: 'bot-1', workspaceId: 'workspace-1' })
        .mockResolvedValueOnce({ id: 'bot-1' }),
    },
    botBillingProviderConfig: { findMany: jest.fn().mockResolvedValue(providerConfigs) },
    botSubscriptionPlan: {
      upsert: jest.fn().mockImplementation(async ({ create }) => ({
        id: `plan-${++planSequence}`,
        description: null,
        ...create,
      })),
    },
    botPlanPrice: {
      findFirst: jest.fn().mockImplementation(async ({ where }) => ({
        id: `price-${where.planId}`,
        planId: where.planId,
        currency: 'UAH',
        interval: 'MONTH',
        amountMinor: where.amountMinor,
        version: 1,
        providerPriceIdentity: null,
      })),
      aggregate: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  };
  const stripe = {
    ensurePrice: jest.fn().mockImplementation(async ({ mode, price }) => `stripe-${mode}-${price.id}`),
  };
  const workspace = {
    requireWorkspaceRole: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
  };
  const service = new BotBillingService(
    prisma as never,
    workspace as never,
    {} as never,
    { info: jest.fn() } as never,
    stripe as never,
    {} as never,
    {} as never,
  );
  return { prisma, stripe, service };
}

describe('BotBillingService Finance catalog synchronization', () => {
  it('synchronizes through connected TEST Stripe credentials without reading unrelated bot columns', async () => {
    const { prisma, stripe, service } = setup([{ botIntegrationId: null, mode: 'TEST' }]);

    const result = await service.syncFinanceCatalog('owner-1', 'bot-1');

    expect(result).toHaveLength(2);
    expect(result.every((item) => item.mode === 'TEST')).toBe(true);
    expect(stripe.ensurePrice).toHaveBeenCalledTimes(2);
    expect(stripe.ensurePrice).toHaveBeenCalledWith(expect.objectContaining({ mode: 'TEST' }));
    expect(prisma.telegramBotIntegration.findFirst).toHaveBeenNthCalledWith(2, {
      where: { id: 'bot-1', applicationType: 'FINANCE' },
      select: { id: true },
    });
  });

  it('returns a client error before changing plans when no Stripe mode is connected', async () => {
    const { prisma, stripe, service } = setup([]);

    await expect(service.syncFinanceCatalog('owner-1', 'bot-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.botSubscriptionPlan.upsert).not.toHaveBeenCalled();
    expect(stripe.ensurePrice).not.toHaveBeenCalled();
  });
});

import { BotEntitlementsService } from './bot-entitlements.service';

describe('BotEntitlementsService', () => {
  const botIntegrationId = 'bot';
  const telegramBotUserId = 'subscriber';

  it('keeps free capabilities when no paid subscription exists', async () => {
    const prisma = { botSubscriptionPlan: { findMany: jest.fn().mockResolvedValue([{ id: 'pro', freeCapabilities: ['record_expense'], paidCapabilities: ['export'] }]) }, botSubscription: { findMany: jest.fn().mockResolvedValue([]) } } as never;
    await expect(new BotEntitlementsService(prisma).resolve({ botIntegrationId, telegramBotUserId })).resolves.toMatchObject({ capabilities: ['record_expense'], hasPaidEntitlement: false });
  });

  it('unions paid capabilities from an active grandfathered subscription without changing its price', async () => {
    const prisma = { botSubscriptionPlan: { findMany: jest.fn().mockResolvedValue([{ id: 'pro', freeCapabilities: ['record_expense'], paidCapabilities: ['export'] }]) }, botSubscription: { findMany: jest.fn().mockResolvedValue([{ planId: 'pro', currentPeriodEnd: new Date('2030-01-01'), grants: [] }]) } } as never;
    await expect(new BotEntitlementsService(prisma).resolve({ botIntegrationId, telegramBotUserId })).resolves.toMatchObject({ capabilities: ['export', 'record_expense'], hasPaidEntitlement: true });
  });

  it('does not count a revoked manual grant as paid', async () => {
    const prisma = { botSubscriptionPlan: { findMany: jest.fn().mockResolvedValue([{ id: 'pro', freeCapabilities: ['record_expense'], paidCapabilities: ['export'] }]) }, botSubscription: { findMany: jest.fn().mockResolvedValue([]) } } as never;
    const service = new BotEntitlementsService(prisma);
    await service.resolve({ botIntegrationId, telegramBotUserId });
    expect((prisma as any).botSubscription.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { in: ['ACTIVE', 'CANCELED'] } }) }));
  });

  it('keeps a canceled provider subscription effective through its paid period', async () => {
    const prisma = {
      botSubscriptionPlan: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'pro', freeCapabilities: ['record_expense'], paidCapabilities: ['AI_INPUT'] },
        ]),
      },
      botSubscription: { findMany: jest.fn().mockResolvedValue([{ planId: 'pro', currentPeriodEnd: new Date('2030-01-01'), grants: [] }]) },
    } as never;

    await expect(new BotEntitlementsService(prisma).resolve({ botIntegrationId, telegramBotUserId }))
      .resolves.toMatchObject({ hasPaidEntitlement: true, capabilities: ['AI_INPUT', 'record_expense'] });
    expect((prisma as any).botSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ['ACTIVE', 'CANCELED'] } }),
      }),
    );
  });
});

import { NotFoundException } from '@nestjs/common';
import { BotBillingProviderMode } from '@prisma/client';
import { BotBillingService } from './bot-billing.service';
import { BotBillingAnalyticsService } from './bot-billing-analytics.service';

function setup() {
  const prisma = {
    telegramBotIntegration: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'bot-1',
        workspaceId: 'workspace-1',
      }),
    },
    telegramBotRuntimeInstance: { findFirst: jest.fn().mockResolvedValue(null) },
    botSubscriptionPlan: { findMany: jest.fn().mockResolvedValue([]) },
    botCoupon: { findMany: jest.fn().mockResolvedValue([]) },
    botSubscription: { findMany: jest.fn() },
    telegramBotUser: {
      count: jest.fn().mockResolvedValue(250),
      findMany: jest.fn().mockResolvedValue([]),
    },
    financeProfile: { findFirst: jest.fn(), update: jest.fn() },
    botBillingEvent: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
  };
  const workspace = {
    requireWorkspaceRole: jest.fn().mockResolvedValue({
      workspaceId: 'workspace-1',
    }),
  };
  const service = new BotBillingService(
    prisma as never,
    workspace as never,
    {} as never,
    { info: jest.fn() } as never,
    {} as never,
    {} as never,
    new BotBillingAnalyticsService(prisma as never),
  );
  return { prisma, service };
}

describe('BotBillingService overview', () => {
  it('calculates metrics from all live subscriptions, not the 200-row list', async () => {
    const { prisma, service } = setup();
    prisma.botSubscription.findMany.mockImplementation((input: { select?: { telegramBotUserId?: boolean } }) => {
      if (!input.select?.telegramBotUserId) return Promise.resolve([]);
      return Promise.resolve(
        Array.from({ length: 225 }, (_, index) => ({
          telegramBotUserId: `user-${index}`,
          status: 'ACTIVE',
          currency: 'USD',
          interval: 'MONTH',
          amountMinor: 100,
          currentPeriodEnd: null,
          providerSubscription: {
            mode:
              index === 224
                ? BotBillingProviderMode.TEST
                : BotBillingProviderMode.LIVE,
          },
        })),
      );
    });

    const result = await service.overview('owner-1', 'bot-1');

    expect(result.analytics.activeSubscriptions).toBe(224);
    expect(result.analytics.paidUsers).toBe(224);
    expect(result.analytics.mrr).toEqual([
      { currency: 'USD', amountMinor: 22_400 },
    ]);
    expect(prisma.botBillingEvent.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ mode: BotBillingProviderMode.LIVE }),
      }),
    );
    expect(prisma.telegramBotUser.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        runtimeInstance: { is: { environment: 'PRODUCTION' } },
      }),
    });
  });

  it('keeps local runtime data out of production analytics', async () => {
    const { prisma, service } = setup();
    prisma.botSubscription.findMany.mockResolvedValue([]);

    await service.overview('owner-1', 'bot-1', 'LOCAL');

    expect(prisma.botSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          telegramBotUser: {
            runtimeInstance: { is: { environment: 'LOCAL' } },
          },
        }),
      }),
    );
  });

  it('does not expose another workspace bot', async () => {
    const { prisma, service } = setup();
    prisma.telegramBotIntegration.findFirst.mockResolvedValue(null);

    await expect(service.overview('owner-1', 'foreign-bot')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.botSubscription.findMany).not.toHaveBeenCalled();
  });
});

describe('BotBillingService user support', () => {
  it('lists free and paid users from only the selected runtime', async () => {
    const { prisma, service } = setup();
    prisma.telegramBotUser.findMany.mockResolvedValue([{
      id: 'telegram-user-1', telegramUserId: '42', username: null, firstName: 'User', lastName: null,
      languageCode: 'ru-RU', firstSeenAt: new Date('2026-08-01T00:00:00Z'), lastInteractionAt: new Date('2026-08-22T00:00:00Z'),
      runtimeInstance: { environment: 'LOCAL' },
      financeProfiles: [{ id: 'profile-1', locale: null, defaultCurrency: 'UAH', timezone: 'Europe/Warsaw', onboardingCompletedAt: null }],
      billingSubscriptions: [],
    }]);

    await expect(
      service.users('owner-1', 'bot-1', { environment: 'LOCAL', limit: 25 }),
    ).resolves.toMatchObject({
      items: [{ environment: 'LOCAL', profile: { locale: 'ru', onboardingCompleted: false }, subscription: null }],
      nextCursor: null,
    });
    expect(prisma.telegramBotUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          botIntegrationId: 'bot-1',
          runtimeInstance: { is: { environment: 'LOCAL' } },
        }),
      }),
    );
  });

  it('repairs a finance profile only after bot and workspace scoping', async () => {
    const { prisma, service } = setup();
    prisma.financeProfile.findFirst.mockResolvedValue({ id: 'profile-1' });
    prisma.financeProfile.update.mockResolvedValue({ id: 'profile-1', locale: 'ru' });

    await service.updateFinanceSupportProfile(
      'owner-1',
      'bot-1',
      'telegram-user-1',
      { locale: 'ru', currency: 'uah', resetOnboarding: true },
    );

    expect(prisma.financeProfile.findFirst).toHaveBeenCalledWith({
      where: {
        botIntegrationId: 'bot-1',
        telegramBotUserId: 'telegram-user-1',
        botIntegration: { workspaceId: 'workspace-1' },
      },
      select: { id: true },
    });
    expect(prisma.financeProfile.update).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: {
        locale: 'ru',
        defaultCurrency: 'UAH',
        onboardingCompletedAt: null,
      },
      select: {
        id: true,
        locale: true,
        defaultCurrency: true,
        timezone: true,
        onboardingCompletedAt: true,
      },
    });
  });

  it('rejects an invalid support timezone before writing', async () => {
    const { prisma, service } = setup();

    await expect(
      service.updateFinanceSupportProfile(
        'owner-1',
        'bot-1',
        'telegram-user-1',
        { timezone: 'Not/A_Timezone' },
      ),
    ).rejects.toThrow('Unknown timezone');
    expect(prisma.financeProfile.update).not.toHaveBeenCalled();
  });
});

describe('BotBillingService provider credentials', () => {
  function providerSetup(existing: Record<string, unknown> | null = null) {
    const row = {
      id: 'config-1', provider: 'STRIPE', mode: 'TEST', connectionStatus: 'NOT_CONFIGURED',
      publicKey: null, publicKeyMasked: null, secretKeyEncrypted: null, secretKeyIv: null,
      secretKeyAuthTag: null, webhookSecretEncrypted: null, webhookSecretIv: null,
      webhookSecretAuthTag: null, lastCheckedAt: null, lastValidationError: null,
      ...(existing || {}),
    };
    const prisma = {
      telegramBotIntegration: { findFirst: jest.fn().mockResolvedValue({ id: 'bot-1', workspaceId: 'workspace-1' }) },
      botBillingProviderConfig: {
        findFirst: jest.fn().mockResolvedValue(existing ? row : null),
        create: jest.fn().mockImplementation(async ({ data }) => Object.assign(row, data)),
        update: jest.fn().mockImplementation(async ({ data }) => Object.assign(row, data)),
        deleteMany: jest.fn(),
      },
    };
    const encryption = { encrypt: jest.fn().mockReturnValue({ encrypted: 'encrypted', iv: 'iv', authTag: 'tag' }), decrypt: jest.fn().mockReturnValue('sk_test_123456') };
    const workspace = { requireWorkspaceRole: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }) };
    const stripe = { validateKey: jest.fn().mockResolvedValue({ status: 'CONNECTED', error: null }) };
    const service = new BotBillingService(prisma as never, workspace as never, encryption as never, { info: jest.fn() } as never, stripe as never, {} as never, {} as never);
    return { prisma, encryption, stripe, service };
  }

  it('persists the canonical publishable key but never returns credential values', async () => {
    const { prisma, service } = providerSetup();
    const result = await service.saveProviderConfig('owner-1', { botIntegrationId: 'bot-1', provider: 'STRIPE', mode: 'TEST', dto: { publicKey: 'pk_test_123456' } });

    expect(prisma.botBillingProviderConfig.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ publicKey: 'pk_test_123456', publicKeyMasked: 'pk_t••••3456' }) }));
    expect(result).toMatchObject({ publicKeyConfigured: true, publicKeyMasked: 'pk_t••••3456', secretKeyConfigured: false });
    expect(JSON.stringify(result)).not.toContain('pk_test_123456');
  });

  it('rejects credentials that do not match Stripe mode before saving', async () => {
    const { prisma, service } = providerSetup();
    await expect(service.saveProviderConfig('owner-1', { botIntegrationId: 'bot-1', provider: 'STRIPE', mode: 'LIVE', dto: { secretKey: 'sk_test_123456' } })).rejects.toThrow('does not match LIVE mode');
    expect(prisma.botBillingProviderConfig.create).not.toHaveBeenCalled();
  });

  it('preserves existing credentials when blank fields are submitted', async () => {
    const { prisma, encryption, service } = providerSetup({ publicKey: 'pk_test_old', publicKeyMasked: 'pk_t••••_old', secretKeyEncrypted: 'old-secret', webhookSecretEncrypted: 'old-webhook' });
    await service.saveProviderConfig('owner-1', { botIntegrationId: 'bot-1', provider: 'STRIPE', mode: 'TEST', dto: { publicKey: ' ', secretKey: ' ', webhookSecret: ' ' } });
    const write = prisma.botBillingProviderConfig.update.mock.calls[0][0].data;
    expect(write).not.toHaveProperty('publicKey');
    expect(write).not.toHaveProperty('secretKeyEncrypted');
    expect(write).not.toHaveProperty('webhookSecretEncrypted');
    expect(encryption.encrypt).not.toHaveBeenCalled();
  });

  it('disables a workspace provider without touching bot overrides', async () => {
    const { prisma, service } = providerSetup();
    const result = await service.removeWorkspaceProviderDefault('owner-1', 'TELEGRAM_STARS', 'LIVE');
    expect(prisma.botBillingProviderConfig.deleteMany).toHaveBeenCalledWith({ where: { workspaceId: 'workspace-1', botIntegrationId: null, provider: 'TELEGRAM_STARS', mode: 'LIVE' } });
    expect(result).toMatchObject({ provider: 'TELEGRAM_STARS', mode: 'LIVE', status: 'NOT_CONFIGURED', source: 'NONE' });
  });
});

describe('BotBillingService Stripe redirects', () => {
  it('passes the consumer application return routes to Stripe unchanged', async () => {
    const prisma = {
      botPlanPrice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'price-1',
          planId: 'plan-1',
          currency: 'UAH',
          interval: 'MONTH',
          amountMinor: 14900,
          version: 1,
          providerPriceIdentity: {
            STRIPE: { LIVE: { configId: 'stripe-config', priceId: 'stripe-price' } },
          },
          plan: {
            id: 'plan-1',
            code: 'PRO',
            name: 'Pro',
            workspaceId: 'workspace-1',
          },
        }),
      },
      telegramBotIntegration: {
        findUnique: jest.fn().mockResolvedValue({ applicationType: 'FINANCE' }),
      },
      telegramBotUser: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'subscriber-1',
          workspaceId: 'workspace-1',
        }),
      },
      botSubscription: {
        create: jest.fn().mockResolvedValue({ id: 'subscription-1' }),
        delete: jest.fn(),
      },
    };
    const stripe = {
      configId: jest.fn().mockResolvedValue('stripe-config'),
      customer: jest.fn().mockResolvedValue('customer-1'),
      checkout: jest.fn().mockResolvedValue({ url: 'https://checkout.example' }),
    };
    const service = new BotBillingService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      stripe as never,
      {} as never,
      {} as never,
    );

    await service.createStripeCheckout({
      botIntegrationId: 'finance-bot',
      telegramBotUserId: 'subscriber-1',
      priceId: 'price-1',
      requestedMode: 'LIVE',
      successUrl: 'https://web.example/finance/finance-bot?checkout=success',
      cancelUrl:
        'https://web.example/finance/finance-bot?checkout=cancelled',
    });

    expect(stripe.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        successUrl:
          'https://web.example/finance/finance-bot?checkout=success',
        cancelUrl:
          'https://web.example/finance/finance-bot?checkout=cancelled',
      }),
    );
  });
});

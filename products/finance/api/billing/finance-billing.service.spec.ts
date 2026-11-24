import { BadRequestException } from "@nestjs/common";
import { FinanceBillingService } from "@consumer-finance/api/billing/finance-billing.service";

describe("FinanceBillingService", () => {
  function setup() {
    const prisma = {
      botPlanPrice: { findFirst: jest.fn() },
      botSubscription: { findFirst: jest.fn().mockResolvedValue(null) },
      botBillingEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const billing = {
      catalog: jest.fn().mockResolvedValue({
        providers: [],
        subscriptions: [
          {
            id: "subscription-1",
            currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
          },
        ],
        plans: [
          {
            id: "persisted-pro",
            code: "PRO",
            prices: [
              {
                id: "pro-uah",
                currency: "UAH",
                interval: "MONTH",
                intervalCount: 1,
                amountMinor: 17900,
                version: 2,
              },
              {
                id: "stale-pro",
                currency: "UAH",
                interval: "MONTH",
                intervalCount: 1,
                amountMinor: 19900,
                version: 3,
              },
              {
                id: "annual-pro",
                currency: "UAH",
                interval: "YEAR",
                intervalCount: 1,
                amountMinor: 109900,
                version: 1,
              },
              {
                id: "quarter-pro",
                currency: "UAH",
                interval: "MONTH",
                intervalCount: 3,
                amountMinor: 39900,
                version: 1,
              },
              {
                id: "intro-pro",
                currency: "UAH",
                interval: "DAY",
                intervalCount: 7,
                amountMinor: 700,
                version: 1,
              },
              {
                id: "pro-stars",
                currency: "XTR",
                interval: "MONTH",
                intervalCount: 1,
                amountMinor: 250,
                version: 1,
              },
            ],
          },
        ],
      }),
      createStripeCheckout: jest
        .fn()
        .mockResolvedValue({ url: "https://checkout" }),
      createStarsCheckout: jest
        .fn()
        .mockResolvedValue({ invoiceLink: "https://t.me/invoice" }),
      syncFixedCatalog: jest.fn().mockResolvedValue([]),
      stripeRenewal: jest.fn(),
      changeStripePlan: jest
        .fn()
        .mockResolvedValue({ url: "https://stripe.test/confirm" }),
    };
    const entitlements = {
      resolve: jest.fn().mockResolvedValue({
        tier: "FREE",
        capabilities: [],
        usage: [],
        activeUntil: null,
        cancelAtPeriodEnd: false,
      }),
    };
    const entitlementMocks = {
      ...entitlements,
      resolveForBilling: jest.fn(async () => ({
        ...(await entitlements.resolve()),
        activeSubscriptions: [],
      })),
    };
    return {
      prisma,
      billing,
      entitlements: entitlementMocks,
      service: new FinanceBillingService(
        prisma as never,
        billing as never,
        entitlementMocks as never,
      ),
    };
  }

  it("maps exactly the canonical Free, Pro and Ultimate definitions", async () => {
    const { service, billing, entitlements } = setup();

    const result = await service.catalog({
      botIntegrationId: "bot-1",
      telegramBotUserId: "user-1",
      profileId: "profile-1",
    });

    expect(result.plans.map((plan) => plan.code)).toEqual([
      "FREE",
      "PRO",
      "ULTIMATE",
    ]);
    expect(result.plans[0]).toEqual(
      expect.objectContaining({
        id: null,
        prices: [],
      }),
    );
    expect(result.plans[0].features).toEqual(
      expect.arrayContaining(["DETAILED_ANALYTICS", "PERIOD_COMPARISON"]),
    );
    expect(result.plans[1].prices).toEqual([
      expect.objectContaining({ id: "pro-uah", amountMinor: 17900 }),
      expect.objectContaining({ id: "annual-pro", amountMinor: 109900 }),
      expect.objectContaining({ id: "quarter-pro", amountMinor: 39900 }),
      expect.objectContaining({ id: "intro-pro", amountMinor: 700 }),
      expect.objectContaining({ id: "pro-stars", amountMinor: 250 }),
    ]);
    expect(result.plans.map((plan) => plan.canPurchase)).toEqual([
      false,
      true,
      false,
    ]);
    expect(result.plans[2].usageLimits.AI_INSIGHTS).toBe(100);
    expect(result.current.tier).toBe("FREE");
    expect(result.subscriptions[0].currentPeriodEnd).toBe(
      "2026-10-01T00:00:00.000Z",
    );
    expect(result.paymentHistory).toEqual([]);
    expect(billing.catalog).toHaveBeenCalledTimes(1);
    expect(entitlements.resolve).toHaveBeenCalledTimes(1);
  });

  it("returns recent payment events for the authenticated subscriber", async () => {
    const { service, prisma } = setup();
    prisma.botBillingEvent.findMany.mockResolvedValue([
      {
        id: "event-1",
        type: "PAYMENT_SUCCEEDED",
        provider: "STRIPE",
        amountMinor: 17900,
        currency: "UAH",
        occurredAt: new Date("2026-09-09T09:30:00.000Z"),
        subscription: { plan: { code: "PRO" } },
      },
    ]);

    const result = await service.catalog({
      botIntegrationId: "bot-1",
      telegramBotUserId: "user-1",
      profileId: "profile-1",
    });

    expect(result.paymentHistory).toEqual([
      expect.objectContaining({
        id: "event-1",
        status: "SUCCEEDED",
        occurredAt: "2026-09-09T09:30:00.000Z",
        planCode: "PRO",
      }),
    ]);
    expect(prisma.botBillingEvent.findMany).toHaveBeenCalledWith({
      where: {
        botIntegrationId: "bot-1",
        subscription: { telegramBotUserId: "user-1" },
        OR: [
          { type: { in: ["PAYMENT_SUCCEEDED", "PAYMENT_FAILED"] } },
          {
            type: "GRANT_CREATED",
            subscription: { source: { in: ["GIFT", "MANUAL"] } },
          },
        ],
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 20,
      select: {
        id: true,
        type: true,
        provider: true,
        amountMinor: true,
        currency: true,
        occurredAt: true,
        subscription: { select: { plan: { select: { code: true } } } },
      },
    });
  });

  it("returns issued gifts and keeps a lifetime gift when a timed grant overlaps", async () => {
    const { service, prisma, entitlements, billing } = setup();
    const current = {
      tier: "PRO",
      capabilities: [],
      usage: [],
      activeUntil: null,
      cancelAtPeriodEnd: false,
    };
    entitlements.resolveForBilling.mockResolvedValue({
      ...current,
      activeSubscriptions: [
        { grants: [{ expiresAt: new Date("2032-03-08") }] },
        { grants: [{ expiresAt: null }] },
      ] as never,
    });
    prisma.botBillingEvent.findMany.mockResolvedValue([
      {
        id: "grant-created",
        type: "GRANT_CREATED",
        provider: null,
        amountMinor: null,
        currency: null,
        occurredAt: new Date("2026-11-24"),
        subscription: { plan: { code: "PRO" } },
      },
    ]);
    const result = await service.catalog({
      botIntegrationId: "bot-id",
      telegramBotUserId: "recipient-id",
      profileId: "profile-id",
    });
    expect(result.current).toEqual(current);
    expect(result.activeAccess).toEqual({
      gift: { expiresAt: null },
      stripe: null,
    });
    expect(result.paymentHistory).toEqual([
      {
        id: "grant-created",
        status: "GIFTED",
        provider: null,
        amountMinor: null,
        currency: null,
        occurredAt: "2026-11-24T00:00:00.000Z",
        planCode: "PRO",
      },
    ]);
    expect(billing.stripeRenewal).not.toHaveBeenCalled();
  });

  it("uses verified Stripe renewal data and preserves access if Stripe is unavailable", async () => {
    const { service, entitlements, billing } = setup();
    entitlements.resolveForBilling.mockResolvedValue({
      tier: "PRO",
      capabilities: [],
      usage: [],
      activeUntil: "2032-03-08T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      activeSubscriptions: [
        {
          id: "local-sub",
          source: "STRIPE",
          status: "ACTIVE",
          interval: "DAY",
          intervalCount: 7,
          currentPeriodEnd: new Date("2032-03-08"),
          grants: [],
          plan: { code: "PRO" },
          providerSubscription: {
            mode: "TEST",
            providerSubscriptionId: "sub_intro",
            providerStatus: "trialing",
          },
        },
      ] as never,
    });
    const renewal = {
      amountMinor: 17900,
      currency: "UAH",
      chargeAt: "2032-03-08T00:00:00.000Z",
      interval: "MONTH",
      intervalCount: 1,
    };
    billing.stripeRenewal
      .mockResolvedValueOnce(renewal)
      .mockRejectedValueOnce(new Error("Stripe unavailable"));
    const input = {
      botIntegrationId: "bot-1",
      telegramBotUserId: "user-1",
      profileId: "profile-1",
    };
    const catalog = await service.catalog(input);
    expect(catalog.activeAccess?.stripe).toMatchObject({
      id: "local-sub",
      interval: "DAY",
      intervalCount: 7,
      renewal,
      canChangePlan: false,
    });
    expect(billing.stripeRenewal).toHaveBeenCalledWith({
      botIntegrationId: "bot-1",
      mode: "TEST",
      providerSubscriptionId: "sub_intro",
    });
    const unavailable = await service.catalog(input);
    expect(unavailable.current.tier).toBe("PRO");
    expect(unavailable.activeAccess?.stripe?.renewal).toBeNull();
  });

  it("opens a change confirmation only for a canonical recurring plan", async () => {
    const { service, prisma, billing } = setup();
    const request = {
      botIntegrationId: "bot-1",
      telegramBotUserId: "user-1",
      subscriptionId: "paid-subscription",
      priceId: "quarterly",
      returnUrl: "https://example.test/app/subscription",
    };
    prisma.botPlanPrice.findFirst
      .mockResolvedValueOnce({
        currency: "UAH",
        interval: "DAY",
        intervalCount: 7,
        amountMinor: 700,
      })
      .mockResolvedValueOnce({
        currency: "UAH",
        interval: "MONTH",
        intervalCount: 3,
        amountMinor: 39900,
      });
    await expect(service.changeStripePlan(request)).rejects.toThrow(
      "recurring",
    );
    expect(billing.changeStripePlan).not.toHaveBeenCalled();
    await expect(service.changeStripePlan(request)).resolves.toEqual({
      url: "https://stripe.test/confirm",
    });
    expect(billing.changeStripePlan).toHaveBeenCalledWith(request);
  });

  it("rejects a non-canonical Stripe price before creating checkout", async () => {
    const { service, prisma, billing } = setup();
    prisma.botPlanPrice.findFirst.mockResolvedValue({
      currency: "USD",
      interval: "MONTH",
      intervalCount: 1,
      amountMinor: 17900,
      plan: { code: "PRO" },
    });

    await expect(
      service.createStripeCheckout({
        botIntegrationId: "bot-1",
        telegramBotUserId: "user-1",
        priceId: "bad-price",
        successUrl: "https://example.test/success",
        cancelUrl: "https://example.test/cancel",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(billing.createStripeCheckout).not.toHaveBeenCalled();
  });

  it("allows a canonical upgrade and delegates checkout unchanged", async () => {
    const { service, prisma, billing } = setup();
    prisma.botPlanPrice.findFirst.mockResolvedValue({
      currency: "UAH",
      interval: "MONTH",
      intervalCount: 1,
      amountMinor: 17900,
      plan: { code: "PRO" },
    });

    await expect(
      service.createStripeCheckout({
        botIntegrationId: "bot-1",
        telegramBotUserId: "user-1",
        priceId: "pro-uah",
        successUrl: "https://example.test/success",
        cancelUrl: "https://example.test/cancel",
      }),
    ).resolves.toEqual({ url: "https://checkout" });
    expect(billing.createStripeCheckout).toHaveBeenCalledTimes(1);
  });

  it("advertises no second checkout while a paid plan is active", async () => {
    const { service, entitlements } = setup();
    entitlements.resolve.mockResolvedValue({
      tier: "PRO",
      capabilities: [],
      usage: [],
      activeUntil: "2026-10-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
    });

    const result = await service.catalog({
      botIntegrationId: "bot-1",
      telegramBotUserId: "user-1",
      profileId: "profile-1",
    });

    expect(result.plans.every((plan) => !plan.canPurchase)).toBe(true);
  });

  it("advertises no checkout while a recoverable payment is past due", async () => {
    const { service, billing } = setup();
    billing.catalog.mockResolvedValue({
      providers: [],
      subscriptions: [
        {
          id: "past-due-1",
          source: "STRIPE",
          status: "PAST_DUE",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        },
      ],
      plans: [],
    });

    const result = await service.catalog({
      botIntegrationId: "bot-1",
      telegramBotUserId: "user-1",
      profileId: "profile-1",
    });

    expect(result.current.tier).toBe("FREE");
    expect(result.plans.every((plan) => !plan.canPurchase)).toBe(true);
  });

  it.each([
    ["PRO", "PRO", 17900],
    ["ULTIMATE", "PRO", 17900],
  ] as const)(
    "rejects a %s member checkout for %s before calling the provider",
    async (currentTier, targetTier, amountMinor) => {
      const { service, prisma, billing, entitlements } = setup();
      prisma.botPlanPrice.findFirst.mockResolvedValue({
        currency: "UAH",
        interval: "MONTH",
        intervalCount: 1,
        amountMinor,
        plan: { code: targetTier },
      });
      entitlements.resolve.mockResolvedValue({
        tier: currentTier,
        capabilities: [],
        usage: [],
        activeUntil: null,
        cancelAtPeriodEnd: false,
      });

      await expect(
        service.createStripeCheckout({
          botIntegrationId: "bot-1",
          telegramBotUserId: "user-1",
          priceId: "pro-uah",
          successUrl: "https://example.test/success",
          cancelUrl: "https://example.test/cancel",
        }),
      ).rejects.toThrow("Finance checkout requires no active paid plan");
      expect(billing.createStripeCheckout).not.toHaveBeenCalled();
    },
  );

  it("rejects a paid-plan Stars checkout before creating a second subscription", async () => {
    const { service, prisma, billing, entitlements } = setup();
    prisma.botPlanPrice.findFirst.mockResolvedValue({
      currency: "XTR",
      interval: "MONTH",
      intervalCount: 1,
      amountMinor: 400,
      plan: { code: "ULTIMATE" },
    });
    entitlements.resolve.mockResolvedValue({
      tier: "PRO",
      capabilities: [],
      usage: [],
      activeUntil: null,
      cancelAtPeriodEnd: false,
    });

    await expect(
      service.createStarsCheckout({
        botIntegrationId: "bot-1",
        telegramBotUserId: "user-1",
        priceId: "ultimate-stars",
      }),
    ).rejects.toThrow("Finance checkout requires no active paid plan");
    expect(billing.createStarsCheckout).not.toHaveBeenCalled();
  });

  it.each(["STRIPE", "TELEGRAM_STARS"] as const)(
    "rejects %s checkout while a recoverable paid subscription is past due",
    async (provider) => {
      const { service, prisma, billing } = setup();
      prisma.botPlanPrice.findFirst.mockResolvedValue({
        currency: provider === "STRIPE" ? "UAH" : "XTR",
        interval: "MONTH",
        intervalCount: 1,
        amountMinor: provider === "STRIPE" ? 17900 : 400,
        plan: { code: "PRO" },
      });
      prisma.botSubscription.findFirst.mockResolvedValue({ id: "past-due-1" });

      const checkout =
        provider === "STRIPE"
          ? service.createStripeCheckout({
              botIntegrationId: "bot-1",
              telegramBotUserId: "user-1",
              priceId: "ultimate-uah",
              successUrl: "https://example.test/success",
              cancelUrl: "https://example.test/cancel",
            })
          : service.createStarsCheckout({
              botIntegrationId: "bot-1",
              telegramBotUserId: "user-1",
              priceId: "ultimate-stars",
            });

      await expect(checkout).rejects.toThrow(
        "Finance checkout requires no active paid plan",
      );
      expect(billing.createStripeCheckout).not.toHaveBeenCalled();
      expect(billing.createStarsCheckout).not.toHaveBeenCalled();
    },
  );

  it("passes only canonical product definitions to the neutral catalog synchronizer", async () => {
    const { service, billing } = setup();

    await service.syncCatalog("owner-1", "bot-1");

    expect(billing.syncFixedCatalog).toHaveBeenCalledWith(
      "owner-1",
      "bot-1",
      "FINANCE",
      [
        {
          code: "PRO",
          name: "PLUS",
          amountMinor: 700,
          currency: "UAH",
          interval: "DAY",
          intervalCount: 7,
        },
        {
          code: "PRO",
          name: "PLUS",
          amountMinor: 17900,
          currency: "UAH",
          interval: "MONTH",
          intervalCount: 1,
        },
        {
          code: "PRO",
          name: "PLUS",
          amountMinor: 39900,
          currency: "UAH",
          interval: "MONTH",
          intervalCount: 3,
        },
        {
          code: "PRO",
          name: "PLUS",
          amountMinor: 109900,
          currency: "UAH",
          interval: "YEAR",
          intervalCount: 1,
        },
      ],
    );
  });
});

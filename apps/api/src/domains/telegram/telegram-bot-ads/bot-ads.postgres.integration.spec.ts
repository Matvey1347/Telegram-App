import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PrismaService } from '../../../prisma/prisma.service';
import { trackBotAdInteraction } from '../telegram-bots/core/telegram-bot-ad-attribution';
import { countBotAdConversions, readBotAdCampaignTotals } from './bot-ads-read';
import { BotAdsService } from './bot-ads.service';

const connectionString = process.env.BOT_ADS_TEST_DATABASE_URL;
const integration = connectionString ? describe : describe.skip;

integration('Bot Ads funnel with PostgreSQL', () => {
  let db: PrismaClient;
  let prisma: PrismaService;

  beforeAll(() => {
    const target = new URL(connectionString!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
      throw new Error('Bot Ads integration tests require a localhost database');
    }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    prisma = db as PrismaService;
  });

  afterAll(async () => db?.$disconnect());

  it('keeps first-touch, activity, clicks, and payments isolated to the correct runtime', async () => {
    const workspace = await db.workspace.create({ data: { name: 'Ads test' } });
    try {
      const bot = await db.telegramBotIntegration.create({
        data: { workspaceId: workspace.id, label: 'Ads bot' },
      });
      const credentials = {
        botTokenEncrypted: 'fixture',
        botTokenIv: 'fixture',
        botTokenAuthTag: 'fixture',
        botTokenMasked: 'fixture',
        botIntegrationId: bot.id,
        workspaceId: workspace.id,
      };
      const [production, local] = await Promise.all([
        db.telegramBotRuntimeInstance.create({
          data: {
            ...credentials,
            username: 'ads_prod_bot',
            environment: 'PRODUCTION',
          },
        }),
        db.telegramBotRuntimeInstance.create({
          data: {
            ...credentials,
            username: 'ads_local_bot',
            environment: 'LOCAL',
          },
        }),
      ]);
      const user = await db.telegramBotUser.create({
        data: {
          workspaceId: workspace.id,
          botIntegrationId: bot.id,
          telegramUserId: '42',
        },
      });
      const promo = await db.botAdPromo.create({
        data: { runtimeInstanceId: production.id, title: 'Campaign', post: {} },
      });
      const first = randomUUID();
      const second = randomUUID();
      const localLink = randomUUID();
      const startDay = new Date('2026-10-01T12:00:00.000Z');
      const day30 = new Date(startDay.getTime() + 30 * 86400000);
      const nextDay = new Date('2026-10-02T00:00:00.000Z');
      await db.botAdLink.createMany({
        data: [
          {
            id: first,
            runtimeInstanceId: production.id,
            promoId: promo.id,
            title: 'First',
            tracked: true,
          },
          {
            id: second,
            runtimeInstanceId: production.id,
            promoId: promo.id,
            title: 'Second',
          },
          { id: localLink, runtimeInstanceId: local.id, title: 'Local' },
        ].map((link) => ({ ...link, createdAt: startDay })),
      });
      const privateChat = { type: 'private', id: 42 };
      const start = (id: string) => ({
        message: { chat: privateChat, text: `/start ad_${id}` },
      });
      await trackBotAdInteraction(
        prisma,
        local.id,
        user.id,
        start(first),
        undefined,
        startDay,
      );
      expect(
        await db.botAdAttribution.count({
          where: { telegramBotUserId: user.id },
        }),
      ).toBe(0);

      await trackBotAdInteraction(
        prisma,
        production.id,
        user.id,
        start(first),
        undefined,
        startDay,
      );
      await trackBotAdInteraction(
        prisma,
        production.id,
        user.id,
        start(second),
        undefined,
        startDay,
      );
      await trackBotAdInteraction(
        prisma,
        local.id,
        user.id,
        start(localLink),
        undefined,
        startDay,
      );
      const { pendingAdActivation } =
        await db.telegramBotUser.findUniqueOrThrow({ where: { id: user.id } });
      const reply = { message: { chat: privateChat, text: 'hello' } };
      await trackBotAdInteraction(
        prisma,
        production.id,
        user.id,
        reply,
        pendingAdActivation,
        startDay,
      );
      const productionScope = {
        runtimeInstanceId: production.id,
        workspaceId: workspace.id,
        botIntegrationId: bot.id,
        environment: 'PRODUCTION' as const,
      };
      expect(
        (
          await countBotAdConversions(prisma, productionScope, [first, second])
        ).get(first),
      ).toEqual({ starts: 1, active: 1, retained: 0, paid: 0 });

      await trackBotAdInteraction(
        prisma,
        production.id,
        user.id,
        reply,
        pendingAdActivation,
        nextDay,
      );
      const record = await db.telegramBotUser.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(record.pendingAdActivation).toEqual({
        [production.id]: day30.toISOString(),
        [local.id]: startDay.toISOString(),
      });
      await trackBotAdInteraction(
        prisma,
        production.id,
        user.id,
        reply,
        record.pendingAdActivation,
        new Date(day30.getTime() - 1),
      );
      expect(
        (await countBotAdConversions(prisma, productionScope, [first])).get(
          first,
        )?.retained,
      ).toBe(0);
      await trackBotAdInteraction(
        prisma,
        production.id,
        user.id,
        reply,
        record.pendingAdActivation,
        day30,
      );
      const returned = await db.telegramBotUser.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(returned.pendingAdActivation).toEqual({
        [local.id]: startDay.toISOString(),
      });

      const subscription = await db.botSubscription.create({
        data: {
          workspaceId: workspace.id,
          botIntegrationId: bot.id,
          telegramBotUserId: user.id,
          source: 'TELEGRAM_STARS',
        },
      });
      const receipt = {
        workspaceId: workspace.id,
        botIntegrationId: bot.id,
        subscriptionId: subscription.id,
        provider: 'TELEGRAM_STARS' as const,
        mode: 'LIVE' as const,
        type: 'PAYMENT_SUCCEEDED' as const,
        amountMinor: 25,
        occurredAt: nextDay,
      };
      await db.botBillingEvent.create({
        data: { ...receipt, runtimeInstanceId: local.id },
      });
      expect(
        (await countBotAdConversions(prisma, productionScope, [first])).get(
          first,
        )?.paid,
      ).toBe(0);
      await db.botBillingEvent.createMany({
        data: [
          { ...receipt, runtimeInstanceId: production.id },
          {
            ...receipt,
            runtimeInstanceId: production.id,
            occurredAt: new Date('2026-10-03T12:00:00.000Z'),
          },
        ],
      });

      const ads = new BotAdsService(
        prisma,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      expect(await ads.redirect(first, false)).toContain(`?start=ad_${first}`);
      await Promise.all([ads.redirect(first, true), ads.redirect(first, true)]);
      const conversions = await countBotAdConversions(prisma, productionScope, [
        first,
        second,
      ]);
      expect([...conversions]).toEqual([
        [first, { starts: 1, active: 1, retained: 1, paid: 1 }],
      ]);
      expect(
        await readBotAdCampaignTotals(prisma, productionScope, {
          promoId: promo.id,
        }),
      ).toEqual({
        placements: 2,
        published: 0,
        views: null,
        reactions: null,
        clicks: 2,
        starts: 1,
        active: 1,
        retained: 1,
        paid: 1,
      });
    } finally {
      await db.workspace.delete({ where: { id: workspace.id } });
    }
  });
});

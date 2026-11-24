import { BadRequestException, type Logger } from '@nestjs/common';
import {
  BotBillingConnectionStatus,
  BotBillingProvider,
  type TelegramBotApplicationType,
} from '@prisma/client';
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import { PrismaService } from '../../../prisma/prisma.service';
import { isProductionEnvironment } from '../../../config/deployment-config';
import { StripeBillingProvider } from './stripe-billing.provider';
import type { FixedBillingCatalogDefinition } from './bot-billing.service';

type Mode = 'TEST' | 'LIVE';

export async function reconcileFixedBillingCatalog(
  prisma: PrismaService,
  stripe: StripeBillingProvider,
  logger: Logger,
  bot: { id: string; workspaceId: string },
  applicationType: TelegramBotApplicationType,
  definitions: readonly FixedBillingCatalogDefinition[],
  strict: boolean,
) {
  const botIntegrationId = bot.id;
  const [application, providerConfigs] = await Promise.all([
    prisma.telegramBotIntegration.findFirst({
      where: { id: bot.id, applicationType },
      select: { id: true },
    }),
    prisma.botBillingProviderConfig.findMany({
      where: {
        workspaceId: bot.workspaceId,
        provider: BotBillingProvider.STRIPE,
        OR: [{ botIntegrationId }, { botIntegrationId: null }],
      },
      select: { botIntegrationId: true, mode: true, connectionStatus: true },
    }),
  ]);
  if (!application)
    throw new BadRequestException(
      'The fixed catalog does not match this bot application',
    );
  const modes = (['TEST', 'LIVE'] as const).filter((mode) => {
    const matching = providerConfigs.filter((config) => config.mode === mode);
    const config =
      matching.find((row) => row.botIntegrationId === botIntegrationId) ??
      matching.find((row) => row.botIntegrationId === null);
    return config?.connectionStatus === BotBillingConnectionStatus.CONNECTED;
  });
  if (!modes.length && strict)
    throw new BadRequestException('Stripe TEST or LIVE is not connected');
  const result: Array<{
    code: string;
    planId: string;
    priceId: string;
    mode: Mode;
    providerPriceId: string;
  }> = [];
  for (const definition of definitions) {
    const prepare = async (
      db: Pick<PrismaService, 'botSubscriptionPlan' | 'botPlanPrice'>,
    ) => {
      const plan =
        (await db.botSubscriptionPlan.findUnique({
          where: {
            botIntegrationId_code: { botIntegrationId, code: definition.code },
          },
        })) ??
        (await db.botSubscriptionPlan.upsert({
          where: {
            botIntegrationId_code: { botIntegrationId, code: definition.code },
          },
          update: { name: definition.name, isActive: true },
          create: {
            workspaceId: bot.workspaceId,
            botIntegrationId,
            code: definition.code,
            name: definition.name,
            isActive: true,
          },
        }));
      let price = await db.botPlanPrice.findFirst({
        where: {
          planId: plan.id,
          currency: definition.currency,
          interval: definition.interval,
          intervalCount: definition.intervalCount,
          amountMinor: definition.amountMinor,
          isActive: true,
        },
        orderBy: { version: 'desc' },
      });
      if (definition.interval === 'DAY') {
        await db.botPlanPrice.updateMany({
          where: {
            planId: plan.id,
            currency: definition.currency,
            interval: 'DAY',
            intervalCount: { not: definition.intervalCount },
            isPublic: true,
          },
          data: { isPublic: false },
        });
      }
      if (!price) {
        const previous = await db.botPlanPrice.aggregate({
          where: {
            planId: plan.id,
            currency: definition.currency,
            interval: definition.interval,
            intervalCount: definition.intervalCount,
          },
          _max: { version: true },
        });
        await db.botPlanPrice.updateMany({
          where: {
            planId: plan.id,
            currency: definition.currency,
            interval: definition.interval,
            intervalCount: definition.intervalCount,
            isPublic: true,
          },
          data: { isPublic: false },
        });
        price = await db.botPlanPrice.create({
          data: {
            planId: plan.id,
            currency: definition.currency,
            interval: definition.interval,
            intervalCount: definition.intervalCount,
            amountMinor: definition.amountMinor,
            version: (previous._max?.version || 0) + 1,
            isPublic: true,
          },
        });
      }
      return { plan, price };
    };
    const { plan, price } = strict
      ? await prepare(prisma)
      : await prisma.$transaction(async (tx) => {
          await acquirePostgresTransactionLock(
            tx,
            `finance-catalog:${botIntegrationId}`,
          );
          return prepare(tx);
        });
    for (const mode of modes) {
      if (!strict && mode === 'LIVE' && !isProductionEnvironment()) continue;
      try {
        const providerPriceId = await stripe.ensurePrice({
          botIntegrationId,
          mode,
          plan,
          price,
          oneTime: definition.interval === 'DAY',
        });
        result.push({
          code: definition.code,
          planId: plan.id,
          priceId: price.id,
          mode,
          providerPriceId,
        });
      } catch (error) {
        if (strict) throw error;
        logger.warn(`Could not sync Finance Stripe ${mode} offer`);
      }
    }
  }
  return result;
}

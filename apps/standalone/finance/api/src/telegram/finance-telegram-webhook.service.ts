import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Prisma } from '../generated/prisma';
import { FinanceRuntimeConfig } from '../config/finance-runtime-config';
import { FinancePrismaService } from '../prisma/finance-prisma.service';
import { FinancePrimaryBotService } from './finance-primary-bot.service';
import type {
  FinanceTelegramWebhookUpdate,
  FinanceWebhookUpdateStore,
} from './finance-telegram-webhook.types';

@Injectable()
export class FinanceTelegramWebhookService {
  constructor(
    private readonly config: FinanceRuntimeConfig,
    private readonly prisma: FinancePrismaService,
    private readonly primaryBot: FinancePrimaryBotService,
  ) {}

  async receive(
    secret: string | undefined,
    update: FinanceTelegramWebhookUpdate,
  ) {
    this.assertSecret(secret);
    if (update.update_id === undefined || update.update_id === null) {
      throw new BadRequestException('Telegram update_id is required');
    }

    const financeBot = await this.primaryBot.resolve();
    return claimAndAccept(this.prisma.financeWebhookUpdate, financeBot.id, update);
  }

  private assertSecret(candidate: string | undefined) {
    if (!candidate) throw new ForbiddenException('Invalid Telegram webhook secret');
    const expected = Buffer.from(this.primaryBot.webhookSecret());
    const actual = Buffer.from(candidate);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new ForbiddenException('Invalid Telegram webhook secret');
    }
  }
}

export async function claimAndAccept(
  store: FinanceWebhookUpdateStore,
  financeBotId: string,
  update: FinanceTelegramWebhookUpdate,
) {
  const updateId = String(update.update_id);
  const existing = await store.findUnique({
    where: { financeBotId_updateId: { financeBotId, updateId } },
  });
  if (existing) return { ok: true, duplicate: true };

  try {
    const claimed = await store.create({
      data: {
        financeBotId,
        updateId,
        payload: update as Prisma.InputJsonValue,
      },
    });
    await store.update({
      where: { id: claimed.id },
      data: { status: 'ACCEPTED', processedAt: new Date() },
    });
    return { ok: true, duplicate: false };
  } catch (error) {
    if (isUniqueConstraint(error)) return { ok: true, duplicate: true };
    throw error;
  }
}

function isUniqueConstraint(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

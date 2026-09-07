import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  isAdvertisingExpenseCategory,
  isBuyChannelsCategory,
  isChannelAdvertisingRevenueCategory,
} from './transaction-presentation';

type ChannelTransactionCategory = {
  key?: string | null;
  name?: string | null;
  type: 'income' | 'expense';
};

export class TransactionPurchaseChannelLinks {
  private columnsAvailable = false;
  private readiness: Promise<boolean> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async ensureAvailable() {
    if (this.columnsAvailable) return true;
    if (this.readiness) return this.readiness;
    if (typeof this.prisma.$executeRawUnsafe !== 'function') return false;
    this.readiness = (async () => {
      await this.prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TelegramChannelAcquisitionType') THEN
            CREATE TYPE "TelegramChannelAcquisitionType" AS ENUM ('CREATED', 'PURCHASED');
          END IF;
        END $$;
      `);
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "TelegramChannel" ADD COLUMN IF NOT EXISTS "purchaseTransactionId" TEXT`,
      );
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "TelegramChannel" ADD COLUMN IF NOT EXISTS "acquisitionType" "TelegramChannelAcquisitionType" NOT NULL DEFAULT 'CREATED'`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "TelegramChannel_purchaseTransactionId_key" ON "TelegramChannel"("purchaseTransactionId")`,
      );
      this.columnsAvailable = true;
      return true;
    })();
    try {
      return await this.readiness;
    } finally {
      this.readiness = null;
    }
  }

  async findLinked(workspaceId: string, transactionId: string) {
    await this.ensureAvailable();
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        username: string | null;
        photoUrl: string | null;
      }>
    >(Prisma.sql`
      SELECT "id", "title", "username", "photoUrl" FROM "TelegramChannel"
      WHERE "workspaceId" = ${workspaceId} AND "purchaseTransactionId" = ${transactionId}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  async resolve(params: {
    workspaceId: string;
    category: ChannelTransactionCategory;
    telegramChannelId?: string | null;
    transactionId?: string;
  }) {
    const requestedChannelId = params.telegramChannelId ?? null;
    if (!isBuyChannelsCategory(params.category)) {
      if (requestedChannelId) {
        throw new BadRequestException(
          'telegramChannelId is only allowed for Buy Channels expenses',
        );
      }
      return null;
    }
    if (!requestedChannelId) return null;
    await this.ensureAvailable();
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        username: string | null;
        photoUrl: string | null;
        purchaseTransactionId: string | null;
      }>
    >(Prisma.sql`
      SELECT "id", "title", "username", "photoUrl", "purchaseTransactionId"
      FROM "TelegramChannel"
      WHERE "workspaceId" = ${params.workspaceId} AND "id" = ${requestedChannelId}
      LIMIT 1
    `);
    const channel = rows[0] ?? null;
    if (!channel) throw new NotFoundException('Telegram channel not found');
    if (
      channel.purchaseTransactionId &&
      channel.purchaseTransactionId !== params.transactionId
    ) {
      throw new BadRequestException(
        'This Telegram channel is already linked to another purchase transaction.',
      );
    }
    return channel;
  }

  async sync(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    transactionId: string,
    nextChannelId?: string | null,
  ) {
    await tx.$executeRaw(
      nextChannelId
        ? Prisma.sql`UPDATE "TelegramChannel" SET "purchaseTransactionId" = NULL WHERE "workspaceId" = ${workspaceId} AND "purchaseTransactionId" = ${transactionId} AND "id" <> ${nextChannelId}`
        : Prisma.sql`UPDATE "TelegramChannel" SET "purchaseTransactionId" = NULL WHERE "workspaceId" = ${workspaceId} AND "purchaseTransactionId" = ${transactionId}`,
    );
    if (!nextChannelId) return;
    await tx.$executeRaw(Prisma.sql`
      UPDATE "TelegramChannel"
      SET "purchaseTransactionId" = ${transactionId}, "acquisitionType" = 'PURCHASED'
      WHERE "workspaceId" = ${workspaceId} AND "id" = ${nextChannelId}
    `);
  }

  async attach<T extends { id: string }>(
    workspaceId: string,
    transactions: T[],
  ) {
    if (!transactions.length) return transactions;
    const rows = await this.prisma.$queryRaw<
      Array<{
        purchaseTransactionId: string;
        id: string;
        title: string;
        username: string | null;
        photoUrl: string | null;
      }>
    >(Prisma.sql`
      SELECT "purchaseTransactionId", "id", "title", "username", "photoUrl"
      FROM "TelegramChannel"
      WHERE "workspaceId" = ${workspaceId}
        AND "purchaseTransactionId" IN (${Prisma.join(transactions.map(({ id }) => id))})
    `);
    const byTransactionId = new Map(
      rows.map(({ purchaseTransactionId, ...channel }) => [
        purchaseTransactionId,
        channel,
      ]),
    );
    return transactions.map((transaction) => ({
      ...transaction,
      purchasedTelegramChannel: byTransactionId.get(transaction.id) ?? null,
    }));
  }
}

export async function resolveTransactionChannelLink(
  prisma: PrismaService,
  params: {
    workspaceId: string;
    category: ChannelTransactionCategory;
    telegramChannelId?: string | null;
  },
) {
  const isRevenue = isChannelAdvertisingRevenueCategory(params.category);
  const isExpense = isAdvertisingExpenseCategory(params.category);
  const channelId = params.telegramChannelId ?? null;

  if (!isRevenue && !isExpense) {
    if (channelId) {
      throw new BadRequestException(
        'telegramChannelId is only allowed for advertising transactions',
      );
    }
    return null;
  }
  if (!channelId && isRevenue) {
    throw new BadRequestException(
      'telegramChannelId is required for Channel Advertising Revenue income',
    );
  }
  if (!channelId) return null;

  const channel = await prisma.telegramChannel.findFirst({
    where: { id: channelId, workspaceId: params.workspaceId },
    select: { id: true, title: true, username: true, photoUrl: true },
  });
  if (!channel) throw new NotFoundException('Telegram channel not found');
  return channel;
}

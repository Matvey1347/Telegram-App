import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrencyConversionService } from '../../../../common/currency-conversion.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CreateFinanceTransferDto,
  FinanceTransferQueryDto,
  UpdateFinanceTransferDto,
} from '../http/finance.dto';
import { financeTransferSavingsLinkLockKey } from '../assets/finance-asset-locks';
import {
  financeHistoryDateRange,
  financeOccurredAtFilter,
} from '../ledger/finance-history-date-range';

const transferSelect = {
  id: true,
  fromAccountId: true,
  toAccountId: true,
  fromAmount: true,
  toAmount: true,
  fromCurrency: true,
  toCurrency: true,
  exchangeRate: true,
  occurredAt: true,
  description: true,
  deletedAt: true,
  fromAccount: { select: { id: true, name: true, currency: true } },
  toAccount: { select: { id: true, name: true, currency: true } },
} satisfies Prisma.FinanceTransferSelect;

@Injectable()
export class FinanceTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversion: CurrencyConversionService,
  ) {}

  async history(
    profileId: string,
    query: FinanceTransferQueryDto,
    timezone = 'UTC',
  ) {
    const range = financeHistoryDateRange(query.from, query.to, timezone);
    const search = query.search?.trim();
    const rows = await this.prisma.financeTransfer.findMany({
      where: {
        profileId,
        deletedAt: null,
        ...(query.accountId
          ? {
              OR: [
                { fromAccountId: query.accountId },
                { toAccountId: query.accountId },
              ],
            }
          : {}),
        ...financeOccurredAtFilter(range),
        ...(search
          ? { description: { contains: search, mode: 'insensitive' } }
          : {}),
      },
      select: transferSelect,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit).map((row) => this.view(row));
    return { items, nextCursor: hasMore ? items.at(-1)?.id || null : null };
  }

  create(profileId: string, dto: CreateFinanceTransferDto, id?: string) {
    return this.createTransfer(profileId, dto, id);
  }

  async update(profileId: string, id: string, dto: UpdateFinanceTransferDto) {
    const prepared = await this.prepare(profileId, dto);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockSavingsLink(tx, profileId, id);
      const existing = await tx.financeTransfer.findFirst({
        where: { id, profileId, deletedAt: null },
        select: {
          id: true,
          fromAccountId: true,
          toAccountId: true,
          _count: { select: { savingsMovements: true } },
        },
      });
      if (!existing) throw new NotFoundException('Finance transfer not found');
      if (existing._count.savingsMovements)
        throw new ConflictException(
          'A transfer linked to savings history cannot be changed',
        );
      this.assertArchivedReferences(prepared, existing);
      return tx.financeTransfer.update({
        where: { id: existing.id },
        data: prepared.data,
        select: transferSelect,
      });
    });
    return this.view(row);
  }

  private async createTransfer(
    profileId: string,
    dto: CreateFinanceTransferDto,
    id?: string,
  ) {
    const prepared = await this.prepare(profileId, dto);
    this.assertArchivedReferences(prepared, null);
    const row = await this.prisma.financeTransfer.create({
      data: { ...(id ? { id } : {}), profileId, ...prepared.data },
      select: transferSelect,
    });
    return this.view(row);
  }

  private async prepare(profileId: string, dto: CreateFinanceTransferDto) {
    if (dto.fromAccountId === dto.toAccountId)
      throw new BadRequestException('Transfer accounts must be different');
    const amount = this.positive(dto.amount);
    const occurredAt = new Date(dto.occurredAt);
    const profile = await this.prisma.financeProfile.findUnique({
      where: { id: profileId },
      select: { botIntegration: { select: { workspaceId: true } } },
    });
    if (!profile) throw new NotFoundException('Finance profile not found');
    const accounts = await this.prisma.financeAccount.findMany({
      where: { profileId, id: { in: [dto.fromAccountId, dto.toAccountId] } },
      select: { id: true, name: true, currency: true, archivedAt: true },
    });
    const from = accounts.find((account) => account.id === dto.fromAccountId);
    const to = accounts.find((account) => account.id === dto.toAccountId);
    if (!from || !to)
      throw new NotFoundException('Finance transfer account not found');
    const rateResult = await this.conversion.getRateMetadata(
      from.currency,
      to.currency,
      profile.botIntegration.workspaceId,
      this.rateDateForWrite(occurredAt),
    );
    if (!rateResult.available)
      throw new BadRequestException({
        code: rateResult.code,
        message: rateResult.message,
      });
    const exchangeRate = new Prisma.Decimal(rateResult.rate);
    return {
      fromArchived: Boolean(from.archivedAt),
      toArchived: Boolean(to.archivedAt),
      data: {
        fromAccountId: from.id,
        toAccountId: to.id,
        fromAmount: amount,
        fromCurrency: from.currency,
        toAmount: amount.mul(exchangeRate).toDecimalPlaces(2),
        toCurrency: to.currency,
        exchangeRate,
        occurredAt,
        description: dto.description?.trim() || null,
      },
    };
  }

  async remove(profileId: string, id: string) {
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockSavingsLink(tx, profileId, id);
      const existing = await tx.financeTransfer.findFirst({
        where: { id, profileId, deletedAt: null },
        select: { id: true, _count: { select: { savingsMovements: true } } },
      });
      if (!existing) throw new NotFoundException('Finance transfer not found');
      if (existing._count.savingsMovements)
        throw new ConflictException(
          'A transfer linked to savings history cannot be deleted',
        );
      return tx.financeTransfer.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
        select: transferSelect,
      });
    });
    return this.view(row);
  }

  private assertArchivedReferences(
    prepared: {
      fromArchived: boolean;
      toArchived: boolean;
      data: {
        fromAccountId: string;
        toAccountId: string;
      };
    },
    existing: { fromAccountId: string; toAccountId: string } | null,
  ) {
    if (
      (prepared.fromArchived &&
        existing?.fromAccountId !== prepared.data.fromAccountId) ||
      (prepared.toArchived &&
        existing?.toAccountId !== prepared.data.toAccountId)
    )
      throw new NotFoundException('Finance transfer account not found');
  }

  private async lockSavingsLink(
    tx: Prisma.TransactionClient,
    profileId: string,
    transferId: string,
  ) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${financeTransferSavingsLinkLockKey(profileId, transferId)}, 0))`,
    );
  }

  private positive(value: string) {
    try {
      const amount = new Prisma.Decimal(value);
      if (!amount.isFinite() || amount.lte(0)) throw new Error();
      return amount;
    } catch {
      throw new BadRequestException('amount must be a positive decimal');
    }
  }

  private rateDateForWrite(occurredAt: Date) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return occurredAt < today ? occurredAt : undefined;
  }

  private view<
    T extends {
      fromAmount: Prisma.Decimal;
      toAmount: Prisma.Decimal;
      exchangeRate: Prisma.Decimal | null;
    },
  >(row: T) {
    return {
      ...row,
      fromAmount: row.fromAmount.toString(),
      toAmount: row.toAmount.toString(),
      exchangeRate:
        row.exchangeRate?.toString() ||
        row.toAmount.div(row.fromAmount).toString(),
    };
  }
}

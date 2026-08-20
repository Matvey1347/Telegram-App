import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FinanceProposalStatus, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  DEFAULT_FINANCE_CATEGORIES,
  FINANCE_PROPOSAL_TTL_MS,
} from './finance-defaults';
import { FinanceLedgerService } from './finance-ledger.service';

type ProposalPayload = {
  type: 'INCOME' | 'EXPENSE';
  amount: string;
  currency: string;
  description: string | null;
  accountId: string;
  categoryId: string | null;
  occurredAt: string;
};
type StoredProposal =
  | ProposalPayload
  | { operations: ProposalPayload[]; source?: 'AI' | 'RECEIPT' };

@Injectable()
export class FinanceProposalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: FinanceLedgerService,
  ) {}

  async createQuick(input: {
    profile: { id: string; defaultCurrency: string };
    botIntegrationId: string;
    telegramBotUserId: string;
    type: 'INCOME' | 'EXPENSE';
    amount: string;
    description: string | null;
  }) {
    const amount = new Prisma.Decimal(input.amount);
    if (!amount.isFinite() || amount.lte(0))
      throw new BadRequestException('Amount must be positive');
    const account = await this.prisma.financeAccount.findFirst({
      where: { profileId: input.profile.id, archivedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (!account)
      throw new BadRequestException(
        'Create an account before adding a transaction',
      );
    const category = await this.resolveCategory(
      input.profile.id,
      input.type,
      input.description,
    );
    const token = randomBytes(18).toString('base64url');
    const payload: ProposalPayload = {
      type: input.type,
      amount: amount.toString(),
      currency: account.currency,
      description: input.description,
      accountId: account.id,
      categoryId: category?.id || null,
      occurredAt: new Date().toISOString(),
    };
    await this.prisma.financePendingProposal.create({
      data: {
        profileId: input.profile.id,
        telegramBotUserId: input.telegramBotUserId,
        botIntegrationId: input.botIntegrationId,
        tokenHash: this.hash(token),
        payload,
        expiresAt: new Date(Date.now() + FINANCE_PROPOSAL_TTL_MS),
      },
    });
    return { token, payload, account, category };
  }

  async confirm(input: {
    token: string;
    botIntegrationId: string;
    telegramBotUserId: string;
    profile: { id: string; defaultCurrency: string };
  }) {
    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.financePendingProposal.findUnique({
        where: { tokenHash: this.hash(input.token) },
      });
      if (
        !proposal ||
        proposal.botIntegrationId !== input.botIntegrationId ||
        proposal.telegramBotUserId !== input.telegramBotUserId ||
        proposal.profileId !== input.profile.id
      )
        throw new NotFoundException('Finance proposal not found');
      if (
        proposal.status === FinanceProposalStatus.CONFIRMED &&
        proposal.transactionId
      )
        return {
          transactionId: proposal.transactionId,
          transactionIds: proposal.transactionId.split(','),
          duplicate: true,
        };
      if (
        proposal.status !== FinanceProposalStatus.PENDING ||
        proposal.expiresAt <= new Date()
      )
        throw new BadRequestException(
          'Finance proposal has expired or was cancelled',
        );
      const claimed = await tx.financePendingProposal.updateMany({
        where: {
          id: proposal.id,
          status: FinanceProposalStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
        data: { status: FinanceProposalStatus.CONFIRMED },
      });
      if (!claimed.count) {
        const completed = await tx.financePendingProposal.findUnique({
          where: { id: proposal.id },
          select: { status: true, transactionId: true },
        });
        if (
          completed?.status === FinanceProposalStatus.CONFIRMED &&
          completed.transactionId
        )
          return {
            transactionId: completed.transactionId,
            transactionIds: completed.transactionId.split(','),
            duplicate: true,
          };
        throw new BadRequestException(
          'Finance proposal is no longer available',
        );
      }
      const payload = proposal.payload as StoredProposal;
      const operations =
        'operations' in payload ? payload.operations : [payload];
      const transactions: Array<{ id: string }> = [];
      const source = 'operations' in payload ? payload.source || 'AI' : 'CHAT';
      for (const operation of operations)
        transactions.push(
          await this.ledger.createTransactionInTransaction(
            tx,
            input.profile,
            {
              ...operation,
              categoryId: operation.categoryId || undefined,
              description: operation.description || undefined,
            },
            source,
          ),
        );
      const transactionId = transactions.map((item) => item.id).join(',');
      await tx.financePendingProposal.update({
        where: { id: proposal.id },
        data: { transactionId },
      });
      return {
        transactionId,
        transactionIds: transactions.map((item) => item.id),
        duplicate: false,
      };
    });
  }

  async createBatch(input: {
    profile: { id: string; defaultCurrency: string };
    botIntegrationId: string;
    telegramBotUserId: string;
    source?: 'AI' | 'RECEIPT';
    operations: Array<{
      type: 'INCOME' | 'EXPENSE';
      amount: string;
      currency: string;
      description: string;
      occurredAt: string;
    }>;
  }) {
    if (!input.operations.length || input.operations.length > 10)
      throw new BadRequestException(
        'A proposal must contain 1 to 10 operations',
      );
    const accounts = await this.prisma.financeAccount.findMany({
      where: { profileId: input.profile.id, archivedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    const operations: ProposalPayload[] = [];
    const preview: Array<{
      payload: ProposalPayload;
      accountName: string;
      categoryName: string | null;
    }> = [];
    for (const item of input.operations) {
      const account =
        accounts.find((candidate) => candidate.currency === item.currency) ||
        accounts[0];
      if (!account)
        throw new BadRequestException(
          'Create an account before adding transactions',
        );
      if (account.currency !== item.currency)
        throw new BadRequestException(
          `No ${item.currency} account is available for an AI proposal`,
        );
      const category = await this.resolveCategory(
        input.profile.id,
        item.type,
        item.description,
      );
      const payload = {
        ...item,
        accountId: account.id,
        categoryId: category?.id || null,
      };
      operations.push(payload);
      preview.push({
        payload,
        accountName: account.name,
        categoryName: category?.name || null,
      });
    }
    const token = randomBytes(18).toString('base64url');
    await this.prisma.financePendingProposal.create({
      data: {
        profileId: input.profile.id,
        telegramBotUserId: input.telegramBotUserId,
        botIntegrationId: input.botIntegrationId,
        tokenHash: this.hash(token),
        payload: { operations, source: input.source || 'AI' },
        expiresAt: new Date(Date.now() + FINANCE_PROPOSAL_TTL_MS),
      },
    });
    return { token, operations, preview };
  }

  async cancel(input: {
    token: string;
    botIntegrationId: string;
    telegramBotUserId: string;
  }) {
    const result = await this.prisma.financePendingProposal.updateMany({
      where: {
        tokenHash: this.hash(input.token),
        botIntegrationId: input.botIntegrationId,
        telegramBotUserId: input.telegramBotUserId,
        status: FinanceProposalStatus.PENDING,
      },
      data: { status: FinanceProposalStatus.CANCELLED },
    });
    return { cancelled: true, duplicate: result.count === 0 };
  }

  private async resolveCategory(
    profileId: string,
    type: 'INCOME' | 'EXPENSE',
    description: string | null,
  ) {
    const merchant = description
      ? this.ledger.normalizeMerchant(description)
      : '';
    if (merchant) {
      const mapping = await this.prisma.financeMerchantMapping.findUnique({
        where: {
          profileId_merchantNormalized: {
            profileId,
            merchantNormalized: merchant,
          },
        },
      });
      if (mapping) {
        const mapped = await this.prisma.financeCategory.findFirst({
          where: { id: mapping.categoryId, profileId, type, archivedAt: null },
        });
        if (mapped) return mapped;
      }
      const history = await this.prisma.financeTransaction.findFirst({
        where: {
          profileId,
          type,
          merchantNormalized: merchant,
          categoryId: { not: null },
          deletedAt: null,
        },
        include: { category: true },
        orderBy: { occurredAt: 'desc' },
      });
      if (history?.category && !history.category.archivedAt)
        return history.category;
    }
    const categories = await this.prisma.financeCategory.findMany({
      where: { profileId, type, archivedAt: null },
    });
    const defaultMatch = DEFAULT_FINANCE_CATEGORIES.find(
      (item) =>
        item.type === type &&
        item.keywords.some((keyword) => merchant.includes(keyword)),
    );
    return (
      categories.find((item) => item.name === defaultMatch?.name) ||
      categories.find(
        (item) => item.name === (type === 'INCOME' ? 'Other income' : 'Other'),
      ) ||
      null
    );
  }
  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}

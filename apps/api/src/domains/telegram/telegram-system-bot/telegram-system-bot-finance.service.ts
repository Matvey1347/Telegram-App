import { Injectable, NotFoundException } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import {
  TelegramSystemBotFinanceDraftKind,
  TelegramSystemBotFinanceDraftStatus,
  TransactionType,
} from '@prisma/client';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccountsService } from '../../finance/accounts/accounts.service';
import { TransactionsService } from '../../finance/transactions/transactions.service';
import { TransfersService } from '../../finance/transfers/transfers.service';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import {
  financeAccountChoice,
  financeCategoryChoice,
  financeTransferAccountChoice,
  parseFinanceTransactionInput,
  parseFinanceTransferInput,
  type TelegramSystemBotFinanceResult,
} from './telegram-system-bot-finance-flow';
import { systemBotEmoji } from './telegram-system-bot-presentation';

@Injectable()
export class TelegramSystemBotFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async accountsSummary(userId: string, workspaceId: string) {
    await this.requireMembership(userId, workspaceId);
    const service = await this.resolveForWorkspace(
      AccountsService,
      workspaceId,
    );
    const result = await service.findAll(userId, { page: 1, pageSize: 20 });
    return result.items.map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
      balance: Number(account.balance),
      isActive: account.isActive,
      emoji: systemBotEmoji(account.iconPresentation, '💳'),
    }));
  }

  async beginTransaction(input: {
    connectionId: string;
    userId: string;
    workspaceId: string;
    type: TransactionType;
    controlMessageId?: number;
  }): Promise<TelegramSystemBotFinanceResult> {
    await this.requireMembership(input.userId, input.workspaceId);
    const [accounts, categories] = await Promise.all([
      this.accounts(input.workspaceId),
      this.categories(input.workspaceId, input.type),
    ]);
    if (!accounts.length || !categories.length) return { kind: 'UNAVAILABLE' };
    await this.expirePending(input.connectionId);
    const draft = await this.prisma.telegramSystemBotFinanceDraft.create({
      data: {
        connectionId: input.connectionId,
        workspaceId: input.workspaceId,
        kind: TelegramSystemBotFinanceDraftKind.TRANSACTION,
        type: input.type,
        controlMessageId: input.controlMessageId,
        expiresAt: this.expiresAt(),
      },
    });
    return this.withControl(
      financeAccountChoice(draft.id, accounts),
      draft.controlMessageId,
    );
  }

  async beginTransfer(input: {
    connectionId: string;
    userId: string;
    workspaceId: string;
    controlMessageId?: number;
  }): Promise<TelegramSystemBotFinanceResult> {
    await this.requireMembership(input.userId, input.workspaceId);
    const accounts = await this.accounts(input.workspaceId);
    if (accounts.length < 2) return { kind: 'UNAVAILABLE' };
    await this.expirePending(input.connectionId);
    const draft = await this.prisma.telegramSystemBotFinanceDraft.create({
      data: {
        connectionId: input.connectionId,
        workspaceId: input.workspaceId,
        kind: TelegramSystemBotFinanceDraftKind.TRANSFER,
        controlMessageId: input.controlMessageId,
        expiresAt: this.expiresAt(),
      },
    });
    return this.withControl(
      financeTransferAccountChoice(draft.id, accounts, 'from'),
      draft.controlMessageId,
    );
  }

  async choose(input: {
    connectionId: string;
    userId: string;
    draftId: string;
    kind: 'account' | 'category' | 'from' | 'to';
    index: number;
  }): Promise<TelegramSystemBotFinanceResult> {
    const draft = await this.requirePendingDraft(
      input.connectionId,
      input.draftId,
    );
    await this.requireMembership(input.userId, draft.workspaceId);
    const accounts = await this.accounts(draft.workspaceId);

    if (draft.kind === TelegramSystemBotFinanceDraftKind.TRANSACTION) {
      if (!draft.type)
        throw new NotFoundException('Finance action is incomplete');
      const categories = await this.categories(draft.workspaceId, draft.type);
      if (input.kind === 'account') {
        const account = accounts[input.index];
        if (!account)
          throw new NotFoundException('Account is no longer available');
        await this.updatePending(draft.id, { accountId: account.id });
        return this.withControl(
          financeCategoryChoice(draft.id, categories),
          draft.controlMessageId,
        );
      }
      if (input.kind === 'category') {
        const category = categories[input.index];
        if (!category)
          throw new NotFoundException('Category is no longer available');
        await this.updatePending(draft.id, { categoryId: category.id });
        return this.withControl(
          {
            kind: 'INPUT',
            draftId: draft.id,
            text: `${draft.type === TransactionType.income ? 'Income' : 'Expense'}: send the amount and optional description.\nExample: 125.50 client payment`,
          },
          draft.controlMessageId,
        );
      }
      throw new NotFoundException('Finance action is no longer available');
    }

    if (input.kind === 'from') {
      const account = accounts[input.index];
      if (!account)
        throw new NotFoundException('Account is no longer available');
      await this.updatePending(draft.id, { fromAccountId: account.id });
      return this.withControl(
        financeTransferAccountChoice(draft.id, accounts, 'to', account.id),
        draft.controlMessageId,
      );
    }
    if (input.kind === 'to') {
      const available = accounts.filter(
        (account) => account.id !== draft.fromAccountId,
      );
      const account = available[input.index];
      if (!account)
        throw new NotFoundException('Account is no longer available');
      await this.updatePending(draft.id, { toAccountId: account.id });
      const from = accounts.find((item) => item.id === draft.fromAccountId);
      if (!from)
        throw new NotFoundException('Source account is no longer available');
      return this.withControl(
        {
          kind: 'INPUT',
          draftId: draft.id,
          text:
            from.currency === account.currency
              ? `Transfer ${from.name} → ${account.name}. Send the amount and optional description.\nExample: 125.50 reserve`
              : `Transfer ${from.name} (${from.currency}) → ${account.name} (${account.currency}). Send the outgoing and received amounts, then an optional description.\nExample: 100 USD 92 EUR exchange`,
        },
        draft.controlMessageId,
      );
    }
    throw new NotFoundException('Finance action is no longer available');
  }

  async submitInput(input: {
    connectionId: string;
    userId: string;
    workspaceId: string;
    text: string;
  }): Promise<TelegramSystemBotFinanceResult | null> {
    const draft = await this.prisma.telegramSystemBotFinanceDraft.findFirst({
      where: {
        connectionId: input.connectionId,
        workspaceId: input.workspaceId,
        status: TelegramSystemBotFinanceDraftStatus.PENDING,
        expiresAt: { gt: new Date() },
        OR: [
          {
            kind: TelegramSystemBotFinanceDraftKind.TRANSACTION,
            accountId: { not: null },
            categoryId: { not: null },
            amount: null,
          },
          {
            kind: TelegramSystemBotFinanceDraftKind.TRANSFER,
            fromAccountId: { not: null },
            toAccountId: { not: null },
            fromAmount: null,
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!draft) return null;
    await this.requireMembership(input.userId, draft.workspaceId);

    if (draft.kind === TelegramSystemBotFinanceDraftKind.TRANSACTION) {
      const parsed = parseFinanceTransactionInput(input.text);
      if (!parsed)
        return this.withControl(
          {
            kind: 'INPUT',
            draftId: draft.id,
            text: 'Enter a positive amount, for example: 125.50 client payment',
          },
          draft.controlMessageId,
        );
      const updated = await this.updatePending(draft.id, {
        amount: parsed.amount,
        description: parsed.description,
      });
      return this.withControl(
        await this.confirmation(updated),
        draft.controlMessageId,
      );
    }

    const accounts = await this.accounts(draft.workspaceId);
    const from = accounts.find((account) => account.id === draft.fromAccountId);
    const to = accounts.find((account) => account.id === draft.toAccountId);
    if (!from || !to)
      throw new NotFoundException('Transfer account is no longer available');
    const parsed = parseFinanceTransferInput(
      input.text,
      from.currency === to.currency,
    );
    if (!parsed) {
      return this.withControl(
        {
          kind: 'INPUT',
          draftId: draft.id,
          text:
            from.currency === to.currency
              ? 'Enter a positive amount, for example: 125.50 reserve'
              : `Enter outgoing and received amounts, for example: 100 ${from.currency} 92 ${to.currency} exchange`,
        },
        draft.controlMessageId,
      );
    }
    const updated = await this.updatePending(draft.id, {
      fromAmount: parsed.fromAmount,
      toAmount: parsed.toAmount,
      description: parsed.description,
    });
    return this.withControl(
      await this.confirmation(updated),
      draft.controlMessageId,
    );
  }

  async confirm(input: {
    connectionId: string;
    userId: string;
    draftId: string;
  }): Promise<TelegramSystemBotFinanceResult> {
    const draft = await this.prisma.telegramSystemBotFinanceDraft.findFirst({
      where: { id: input.draftId, connectionId: input.connectionId },
    });
    if (!draft)
      throw new NotFoundException('Finance action is no longer available');
    if (draft.transactionId)
      return this.withControl(
        {
          kind: 'COMPLETED',
          operation: 'transaction',
          id: draft.transactionId,
        },
        draft.controlMessageId,
      );
    if (draft.transferId)
      return this.withControl(
        { kind: 'COMPLETED', operation: 'transfer', id: draft.transferId },
        draft.controlMessageId,
      );
    if (
      draft.status !== TelegramSystemBotFinanceDraftStatus.PENDING ||
      draft.expiresAt <= new Date()
    ) {
      return this.withControl({ kind: 'DUPLICATE' }, draft.controlMessageId);
    }
    await this.requireMembership(input.userId, draft.workspaceId);
    const claim = await this.prisma.telegramSystemBotFinanceDraft.updateMany({
      where: {
        id: draft.id,
        connectionId: input.connectionId,
        status: TelegramSystemBotFinanceDraftStatus.PENDING,
      },
      data: { status: TelegramSystemBotFinanceDraftStatus.PROCESSING },
    });
    if (claim.count !== 1)
      return this.withControl({ kind: 'DUPLICATE' }, draft.controlMessageId);

    let operationId: string | null = null;
    try {
      if (draft.kind === TelegramSystemBotFinanceDraftKind.TRANSACTION) {
        if (
          !draft.type ||
          !draft.amount ||
          !draft.accountId ||
          !draft.categoryId
        )
          throw new NotFoundException('Transaction draft is incomplete');
        const service = await this.resolveForWorkspace(
          TransactionsService,
          draft.workspaceId,
        );
        const transaction = await service.create(input.userId, {
          type: draft.type,
          amount: Number(draft.amount),
          description: draft.description ?? undefined,
          accountId: draft.accountId,
          categoryId: draft.categoryId,
          date: new Date().toISOString(),
        });
        operationId = transaction.id;
        await this.completeDraft(draft.id, { transactionId: transaction.id });
        return this.withControl(
          {
            kind: 'COMPLETED',
            operation: 'transaction',
            id: transaction.id,
          },
          draft.controlMessageId,
        );
      }
      if (
        !draft.fromAccountId ||
        !draft.toAccountId ||
        !draft.fromAmount ||
        !draft.toAmount
      )
        throw new NotFoundException('Transfer draft is incomplete');
      const service = await this.resolveForWorkspace(
        TransfersService,
        draft.workspaceId,
      );
      const transfer = await service.create(input.userId, {
        fromAccountId: draft.fromAccountId,
        toAccountId: draft.toAccountId,
        fromAmount: Number(draft.fromAmount),
        toAmount: Number(draft.toAmount),
        description: draft.description ?? undefined,
        date: new Date().toISOString(),
      });
      operationId = transfer.id;
      await this.completeDraft(draft.id, { transferId: transfer.id });
      return this.withControl(
        { kind: 'COMPLETED', operation: 'transfer', id: transfer.id },
        draft.controlMessageId,
      );
    } catch (error) {
      await this.prisma.telegramSystemBotFinanceDraft.update({
        where: { id: draft.id },
        data: {
          status: TelegramSystemBotFinanceDraftStatus.FAILED,
          ...(draft.kind === TelegramSystemBotFinanceDraftKind.TRANSACTION
            ? { transactionId: operationId }
            : { transferId: operationId }),
          lastError: sanitizeOperationalError(error),
        },
      });
      throw error;
    }
  }

  async cancel(
    connectionId: string,
    draftId: string,
  ): Promise<TelegramSystemBotFinanceResult> {
    const draft = await this.prisma.telegramSystemBotFinanceDraft.findFirst({
      where: { id: draftId, connectionId },
      select: { controlMessageId: true },
    });
    await this.prisma.telegramSystemBotFinanceDraft.updateMany({
      where: {
        id: draftId,
        connectionId,
        status: TelegramSystemBotFinanceDraftStatus.PENDING,
      },
      data: { status: TelegramSystemBotFinanceDraftStatus.EXPIRED },
    });
    return this.withControl({ kind: 'CANCELLED' }, draft?.controlMessageId);
  }

  private async confirmation(draft: {
    id: string;
    workspaceId: string;
    kind: TelegramSystemBotFinanceDraftKind;
    type: TransactionType | null;
    amount: unknown;
    description: string | null;
    accountId: string | null;
    categoryId: string | null;
    fromAccountId: string | null;
    toAccountId: string | null;
    fromAmount: unknown;
    toAmount: unknown;
  }): Promise<TelegramSystemBotFinanceResult> {
    const accounts = await this.accounts(draft.workspaceId);
    if (draft.kind === TelegramSystemBotFinanceDraftKind.TRANSACTION) {
      const account = accounts.find((item) => item.id === draft.accountId);
      const category = draft.type
        ? (await this.categories(draft.workspaceId, draft.type)).find(
            (item) => item.id === draft.categoryId,
          )
        : null;
      return {
        kind: 'CONFIRM',
        text: [
          'Confirm transaction',
          `Type: ${draft.type === TransactionType.income ? 'Income' : 'Expense'}`,
          `Account: ${account?.name ?? 'Unavailable'}`,
          `Category: ${category?.name ?? 'Unavailable'}`,
          `Amount: ${Number(draft.amount)} ${account?.currency ?? ''}`,
          draft.description ? `Description: ${draft.description}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        callbackData: `finance:confirm:${draft.id}`,
      };
    }
    const from = accounts.find((item) => item.id === draft.fromAccountId);
    const to = accounts.find((item) => item.id === draft.toAccountId);
    return {
      kind: 'CONFIRM',
      text: [
        'Confirm transfer',
        `From: ${from?.name ?? 'Unavailable'} — ${Number(draft.fromAmount)} ${from?.currency ?? ''}`,
        `To: ${to?.name ?? 'Unavailable'} — ${Number(draft.toAmount)} ${to?.currency ?? ''}`,
        draft.description ? `Description: ${draft.description}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      callbackData: `finance:confirm:${draft.id}`,
    };
  }

  private async requirePendingDraft(connectionId: string, draftId: string) {
    const draft = await this.prisma.telegramSystemBotFinanceDraft.findFirst({
      where: { id: draftId, connectionId },
    });
    if (
      !draft ||
      draft.status !== TelegramSystemBotFinanceDraftStatus.PENDING ||
      draft.expiresAt <= new Date()
    )
      throw new NotFoundException('Finance action is no longer available');
    return draft;
  }

  private async updatePending(id: string, data: Record<string, unknown>) {
    return this.prisma.telegramSystemBotFinanceDraft.update({
      where: { id },
      data,
    });
  }

  private completeDraft(
    id: string,
    operation: { transactionId?: string; transferId?: string },
  ) {
    return this.prisma.telegramSystemBotFinanceDraft.update({
      where: { id },
      data: {
        ...operation,
        status: TelegramSystemBotFinanceDraftStatus.COMPLETED,
        completedAt: new Date(),
        lastError: null,
      },
    });
  }

  private expirePending(connectionId: string) {
    return this.prisma.telegramSystemBotFinanceDraft.updateMany({
      where: {
        connectionId,
        status: TelegramSystemBotFinanceDraftStatus.PENDING,
      },
      data: { status: TelegramSystemBotFinanceDraftStatus.EXPIRED },
    });
  }

  private withControl<T extends TelegramSystemBotFinanceResult>(
    result: T,
    controlMessageId: number | null | undefined,
  ): T {
    return { ...result, controlMessageId };
  }

  private accounts(workspaceId: string) {
    return this.prisma.account
      .findMany({
        where: { workspaceId, isActive: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 8,
        select: {
          id: true,
          name: true,
          currency: true,
          icon: {
            select: {
              id: true,
              type: true,
              name: true,
              emoji: true,
              imageUrl: true,
            },
          },
        },
      })
      .then((accounts) =>
        accounts.map((account) => ({
          id: account.id,
          name: account.name,
          currency: account.currency,
          emoji: systemBotEmoji(iconToResolvedEmoji(account.icon), '💳'),
        })),
      );
  }

  private categories(workspaceId: string, type: TransactionType) {
    return this.prisma.transactionCategory
      .findMany({
        where: { workspaceId, type },
        orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
        take: 8,
        select: {
          id: true,
          name: true,
          icon: {
            select: {
              id: true,
              type: true,
              name: true,
              emoji: true,
              imageUrl: true,
            },
          },
        },
      })
      .then((categories) =>
        categories.map((category) => ({
          id: category.id,
          name: category.name,
          emoji: systemBotEmoji(
            iconToResolvedEmoji(category.icon),
            type === TransactionType.income ? '📈' : '📉',
          ),
        })),
      );
  }

  private async requireMembership(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId, workspaceId },
      select: { id: true },
    });
    if (!membership)
      throw new NotFoundException('Workspace is no longer available');
  }

  private async resolveForWorkspace<T>(
    provider: new (...args: never[]) => T,
    workspaceId: string,
  ) {
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(
      { headers: { 'x-workspace-id': workspaceId } },
      contextId,
    );
    return this.moduleRef.resolve(provider, contextId, { strict: false });
  }

  private expiresAt() {
    return new Date(Date.now() + 10 * 60_000);
  }
}

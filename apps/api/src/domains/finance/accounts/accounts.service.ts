import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrencyConversionService } from '../../../common/currency-conversion.service';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { FinanceCategoriesService } from '../finance-categories/finance-categories.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { AccountQueryDto, CreateAccountDto, UpdateAccountDto } from './dto';
import {
  withWorkspaceMemberAvatar,
  type WorkspaceMemberAvatarSource,
} from '../../../common/workspace-member-presentation';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';

const dec = (value: unknown) => Number(value ?? 0);

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly conversionService: CurrencyConversionService,
    private readonly financeCategoriesService: FinanceCategoriesService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}

  private async withBalances(
    workspaceId: string,
    accounts: {
      id: string;
      name: string;
      currency: string;
      initialBalance: unknown;
      isActive: boolean;
      iconId?: string | null;
      icon?: {
        id: string;
        type: 'emoji' | 'image';
        name: string;
        emoji?: string | null;
        imageUrl?: string | null;
      } | null;
      createdAt: Date;
      updatedAt: Date;
    }[],
  ) {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { primaryCurrency: true, secondaryCurrency: true },
    });
    const [transactions, outgoingTransfers, incomingTransfers] =
      await Promise.all([
        this.prisma.transaction.groupBy({
          by: ['accountId', 'type'],
          where: {
            workspaceId,
            deletedAt: null,
            accountId: { in: accounts.map((a) => a.id) },
          },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.prisma.transfer.groupBy({
          by: ['fromAccountId'],
          where: {
            workspaceId,
            deletedAt: null,
            fromAccountId: { in: accounts.map((a) => a.id) },
          },
          _sum: { fromAmount: true },
        }),
        this.prisma.transfer.groupBy({
          by: ['toAccountId'],
          where: {
            workspaceId,
            deletedAt: null,
            toAccountId: { in: accounts.map((a) => a.id) },
          },
          _sum: { toAmount: true },
        }),
      ]);

    return Promise.all(
      accounts.map(async (account) => {
        const incomes = transactions
          .filter((t) => t.accountId === account.id && t.type === 'income')
          .reduce((acc, row) => acc + dec(row._sum.amount), 0);
        const expenses = transactions
          .filter((t) => t.accountId === account.id && t.type === 'expense')
          .reduce((acc, row) => acc + dec(row._sum.amount), 0);
        const incomeCount = transactions
          .filter((t) => t.accountId === account.id && t.type === 'income')
          .reduce((acc, row) => acc + row._count._all, 0);
        const expenseCount = transactions
          .filter((t) => t.accountId === account.id && t.type === 'expense')
          .reduce((acc, row) => acc + row._count._all, 0);
        const outgoing = outgoingTransfers
          .filter((t) => t.fromAccountId === account.id)
          .reduce((acc, row) => acc + dec(row._sum.fromAmount), 0);
        const incoming = incomingTransfers
          .filter((t) => t.toAccountId === account.id)
          .reduce((acc, row) => acc + dec(row._sum.toAmount), 0);

        const balance =
          dec(account.initialBalance) +
          incomes -
          expenses -
          outgoing +
          incoming;
        const convertedCurrency =
          account.currency !== workspace.primaryCurrency
            ? workspace.primaryCurrency
            : workspace.secondaryCurrency;
        const convertedBalance = await this.conversionService.convertCurrency(
          balance,
          account.currency,
          convertedCurrency,
          workspaceId,
        );

        return {
          ...account,
          assignedMember: withWorkspaceMemberAvatar(
            (
              account as typeof account & {
                assignedMember?: WorkspaceMemberAvatarSource | null;
              }
            ).assignedMember,
          ),
          iconPresentation: iconToResolvedEmoji(account.icon),
          initialBalance: dec(account.initialBalance),
          balance,
          calculatedBalance: balance,
          convertedBalance,
          convertedCurrency,
          transactionStats: {
            count: incomeCount + expenseCount,
            incomeCount,
            expenseCount,
            received: incomes,
            spent: expenses,
            transferredIn: incoming,
            transferredOut: outgoing,
            delta: incomes - expenses + incoming - outgoing,
          },
        };
      }),
    );
  }

  async findAll(userId: string, query: AccountQueryDto = {}) {
    const access = await this.authorization.require(userId, 'finance.view');
    const workspaceId = access.workspaceId;
    const ownOnly =
      (await this.authorization.can(userId, 'finance.editOwn')) &&
      !(await this.authorization.can(userId, 'finance.editAny'));
    const scope = query.scope ?? 'all';
    const assignedMemberId =
      ownOnly || scope === 'mine'
        ? access.memberId
        : query.assignedMemberId || undefined;
    const where: Prisma.AccountWhereInput = {
      workspaceId,
      deletedAt: null,
      isActive: scope !== 'archived',
      assignedMemberId,
      OR: [{ assignedMemberId: null }, { assignedMember: { isHidden: false } }],
    };
    const pagination = normalizePagination(query);
    const [accounts, totalItems] = await this.prisma.$transaction([
      this.prisma.account.findMany({
        where,
        include: {
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
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
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.account.count({ where }),
    ]);
    const items = await this.withBalances(workspaceId, accounts);
    return createPaginatedResponse(items, totalItems, pagination);
  }

  async findOne(userId: string, id: string) {
    const access = await this.authorization.require(userId, 'finance.view');
    const workspaceId = access.workspaceId;
    const account = await this.prisma.account.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
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
    });
    if (!account) throw new NotFoundException('Account not found');
    if (await this.authorization.can(userId, 'finance.editOwn')) {
      await this.authorization.requireOwnOrAny(
        userId,
        account,
        'finance.editOwn',
        'finance.editAny',
      );
    }
    return (await this.withBalances(workspaceId, [account]))[0];
  }

  async create(userId: string, dto: CreateAccountDto) {
    await this.authorization.require(userId, 'finance.create');
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    if (dto.iconId !== undefined && dto.iconId !== null) {
      const icon = await this.prisma.icon.findFirst({
        where: { id: dto.iconId, workspaceId },
      });
      if (!icon) throw new NotFoundException('Icon not found');
    }
    await this.financeCategoriesService.ensureSystemCategories(workspaceId);
    const currency = dto.currency.toUpperCase();
    const [workspace, investmentCategory] = await Promise.all([
      this.prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { primaryCurrency: true },
      }),
      this.prisma.transactionCategory.findUniqueOrThrow({
        where: {
          workspaceId_type_key: {
            workspaceId,
            type: 'income',
            key: 'investment',
          },
        },
        select: { id: true, name: true },
      }),
    ]);
    const exchangeRateToPrimary =
      dto.initialBalance <= 0 || currency === workspace.primaryCurrency
        ? 1
        : await this.conversionService.getRate(
            currency,
            workspace.primaryCurrency,
            workspaceId,
          );
    if (dto.initialBalance > 0 && exchangeRateToPrimary == null) {
      throw new NotFoundException(
        `No exchange rate from ${currency} to ${workspace.primaryCurrency}`,
      );
    }
    const resolvedExchangeRateToPrimary = exchangeRateToPrimary ?? 1;
    const account = await this.prisma.$transaction(async (tx) => {
      // An opening balance is money contributed by a member. Keeping it only
      // on Account made transfers possible without an auditable source.
      const created = await tx.account.create({
        data: {
          workspaceId,
          name: dto.name,
          currency,
          initialBalance: 0,
          isActive: dto.isActive ?? true,
          iconId: dto.iconId ?? undefined,
          assignedMemberId,
          createdByUserId: userId,
        },
        include: {
          icon: {
            select: {
              id: true,
              type: true,
              name: true,
              emoji: true,
              imageUrl: true,
            },
          },
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
        },
      });
      if (dto.initialBalance > 0 && assignedMemberId) {
        const transaction = await tx.transaction.create({
          data: {
            workspaceId,
            accountId: created.id,
            type: 'income',
            amount: dto.initialBalance,
            currency,
            amountInPrimaryCurrency:
              dto.initialBalance * resolvedExchangeRateToPrimary,
            exchangeRateToPrimary: resolvedExchangeRateToPrimary,
            category: investmentCategory.name,
            categoryId: investmentCategory.id,
            memberId: assignedMemberId,
            description: 'Opening investment',
            date: new Date(),
            createdByUserId: userId,
            assignedMemberId,
          },
        });
        await tx.investment.create({
          data: {
            workspaceId,
            workspaceMemberId: assignedMemberId,
            accountId: created.id,
            transactionId: transaction.id,
            amount: dto.initialBalance,
            currency,
            amountInPrimaryCurrency:
              dto.initialBalance * resolvedExchangeRateToPrimary,
            exchangeRateToPrimary: resolvedExchangeRateToPrimary,
            date: transaction.date,
            notes: 'Opening investment',
            createdByUserId: userId,
            assignedMemberId,
          },
        });
      }
      return created;
    });
    return { ...account, iconPresentation: iconToResolvedEmoji(account.icon) };
  }

  async update(userId: string, id: string, dto: UpdateAccountDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const account = await this.prisma.account.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!account) throw new NotFoundException('Account not found');
    await this.authorization.requireOwnOrAny(
      userId,
      account,
      'finance.editOwn',
      'finance.editAny',
    );
    const assignedMemberId =
      dto.assignedMemberId === undefined
        ? undefined
        : (
            await this.workspaceService.resolveAssignedMemberId(
              userId,
              dto.assignedMemberId,
            )
          ).assignedMemberId;

    if (dto.iconId !== undefined && dto.iconId !== null) {
      const icon = await this.prisma.icon.findFirst({
        where: { id: dto.iconId, workspaceId },
      });
      if (!icon) throw new NotFoundException('Icon not found');
    }

    const { initialBalance: _initialBalance, ...accountChanges } = dto;
    const initialBalance = dto.initialBalance ?? 0;
    const finalCurrency = dto.currency?.toUpperCase() ?? account.currency;
    const finalAssignedMemberId =
      assignedMemberId === undefined ? account.assignedMemberId : assignedMemberId;
    if (initialBalance > 0 && !finalAssignedMemberId) {
      throw new BadRequestException(
        'Assign a member before adding an opening investment',
      );
    }
    const [workspace, investmentCategory] = initialBalance > 0
      ? await Promise.all([
          this.prisma.workspace.findUniqueOrThrow({
            where: { id: workspaceId },
            select: { primaryCurrency: true },
          }),
          this.financeCategoriesService
            .ensureSystemCategories(workspaceId)
            .then(() =>
              this.prisma.transactionCategory.findUniqueOrThrow({
                where: {
                  workspaceId_type_key: {
                    workspaceId,
                    type: 'income',
                    key: 'investment',
                  },
                },
                select: { id: true, name: true },
              }),
            ),
        ])
      : [null, null];
    const exchangeRateToPrimary =
      initialBalance <= 0 || finalCurrency === workspace?.primaryCurrency
        ? 1
        : await this.conversionService.getRate(
            finalCurrency,
            workspace!.primaryCurrency,
            workspaceId,
          );
    if (initialBalance > 0 && exchangeRateToPrimary == null) {
      throw new NotFoundException(
        `No exchange rate from ${finalCurrency} to ${workspace!.primaryCurrency}`,
      );
    }
    const resolvedExchangeRateToPrimary = exchangeRateToPrimary ?? 1;
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.account.update({
        where: { id },
        data: {
          ...accountChanges,
          currency: dto.currency?.toUpperCase(),
          iconId: dto.iconId === undefined ? undefined : dto.iconId,
          assignedMemberId,
        },
        include: {
          icon: {
            select: {
              id: true,
              type: true,
              name: true,
              emoji: true,
              imageUrl: true,
            },
          },
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
        },
      });
      if (initialBalance > 0 && investmentCategory && finalAssignedMemberId) {
        const transaction = await tx.transaction.create({
          data: {
            workspaceId,
            accountId: id,
            type: 'income',
            amount: initialBalance,
            currency: finalCurrency,
            amountInPrimaryCurrency:
              initialBalance * resolvedExchangeRateToPrimary,
            exchangeRateToPrimary: resolvedExchangeRateToPrimary,
            category: investmentCategory.name,
            categoryId: investmentCategory.id,
            memberId: finalAssignedMemberId,
            description: 'Opening investment',
            date: new Date(),
            createdByUserId: userId,
            assignedMemberId: finalAssignedMemberId,
          },
        });
        await tx.investment.create({
          data: {
            workspaceId,
            workspaceMemberId: finalAssignedMemberId,
            accountId: id,
            transactionId: transaction.id,
            amount: initialBalance,
            currency: finalCurrency,
            amountInPrimaryCurrency:
              initialBalance * resolvedExchangeRateToPrimary,
            exchangeRateToPrimary: resolvedExchangeRateToPrimary,
            date: transaction.date,
            notes: 'Opening investment',
            createdByUserId: userId,
            assignedMemberId: finalAssignedMemberId,
          },
        });
      }
      return next;
    });
    if (dto.currency && dto.currency.toUpperCase() !== account.currency) {
    }
    return { ...updated, iconPresentation: iconToResolvedEmoji(updated.icon) };
  }

  async remove(userId: string, id: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const account = await this.prisma.account.findFirst({
      where: { id, workspaceId },
    });
    if (!account) throw new NotFoundException('Account not found');
    await this.authorization.requireOwnOrAny(
      userId,
      account,
      'finance.deleteOwn',
      'finance.deleteAny',
    );

    return this.prisma.account.update({
      where: { id },
      // Archiving is reversible and preserves all financial history.
      data: { isActive: false, deletedAt: null },
    });
  }
}

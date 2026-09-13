import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { WorkspaceService } from '../../../common/workspace.service';
import { CurrencyConversionService } from '../../../common/currency-conversion.service';
import {
  CreateTransactionDto,
  TransactionQueryDto,
  UpdateTransactionDto,
} from './dto';
import { FinanceCategoriesService } from '../finance-categories/finance-categories.service';
import {
  isAdvertisingExpenseCategory,
  isBuyChannelsCategory,
  isChannelAdvertisingRevenueCategory,
  withTransactionIconPresentation,
} from './transaction-presentation';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { financeAuthorizationTestFallback } from '../finance-authorization-test-fallback';
import { TransactionCategoryMemberPolicyService } from './transaction-category-member-policy.service';
import {
  resolveTransactionChannelLink,
  TransactionPurchaseChannelLinks,
} from './transaction-channel-link';
@Injectable()
export class TransactionsService {
  private readonly purchaseChannels: TransactionPurchaseChannelLinks;

  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private currencyConversionService: CurrencyConversionService,
    private financeCategoriesService: FinanceCategoriesService,
    private authorization: WorkspaceAuthorizationService = financeAuthorizationTestFallback(
      workspaceService,
    ),
    private transactionCategoryMemberPolicy: TransactionCategoryMemberPolicyService = new TransactionCategoryMemberPolicyService(
      prisma,
    ),
  ) {
    this.purchaseChannels = new TransactionPurchaseChannelLinks(prisma);
  }

  private async resolveRateToPrimary(
    workspaceId: string,
    fromCurrency: string,
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { primaryCurrency: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    const rate = await this.currencyConversionService.getRate(
      fromCurrency,
      workspace.primaryCurrency,
      workspaceId,
    );
    if (rate) return rate;

    throw new BadRequestException(
      `No exchange rate from ${fromCurrency} to ${workspace.primaryCurrency}`,
    );
  }

  async findAll(userId: string, query: TransactionQueryDto = {}) {
    const { workspaceId, memberId } = await this.authorization.require(
      userId,
      'finance.view',
    );
    await this.financeCategoriesService.ensureSystemCategories(workspaceId);
    const where: Prisma.TransactionWhereInput = {
      workspaceId,
      deletedAt: null,
    };
    if (query.dateFrom || query.dateTo) {
      where.date = {};
      if (query.dateFrom) where.date.gte = new Date(query.dateFrom);
      if (query.dateTo) {
        const end = new Date(query.dateTo);
        end.setHours(23, 59, 59, 999);
        where.date.lte = end;
      }
    }
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.type && query.type !== 'all') where.type = query.type;
    if (query.accountId) where.accountId = query.accountId;
    if (query.assignedMemberId) where.assignedMemberId = query.assignedMemberId;
    if (
      (await this.authorization.can(userId, 'finance.editOwn')) &&
      !(await this.authorization.can(userId, 'finance.editAny'))
    )
      where.assignedMemberId = memberId;
    if (query.search?.trim()) {
      where.OR = [
        { description: { contains: query.search.trim(), mode: 'insensitive' } },
        { category: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }

    const pagination = normalizePagination(query);
    const orderDirection = query.sort === 'date_asc' ? 'asc' : 'desc';
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        orderBy: [{ date: orderDirection }, { id: orderDirection }],
        skip: pagination.skip,
        take: pagination.take,
        include: {
          account: {
            include: {
              assignedMember: WorkspaceService.assignedMemberInclude,
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
          },
          categoryRef: {
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
            },
          },
          telegramChannel: {
            select: {
              id: true,
              title: true,
              username: true,
              photoUrl: true,
            },
          },
          member: WorkspaceService.assignedMemberInclude,
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
          adCampaign: true,
          investment: true,
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
      }),
      this.prisma.transaction.count({ where }),
    ]);
    const enrichedItems = await this.purchaseChannels.attach(
      workspaceId,
      items,
    );
    return createPaginatedResponse(
      enrichedItems.map(withTransactionIconPresentation),
      totalItems,
      pagination,
    );
  }

  async findOne(userId: string, id: string) {
    const { workspaceId } = await this.authorization.require(
      userId,
      'finance.view',
    );
    const row = await this.prisma.transaction.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: {
        account: {
          include: {
            assignedMember: WorkspaceService.assignedMemberInclude,
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
        },
        categoryRef: {
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
          },
        },
        telegramChannel: {
          select: {
            id: true,
            title: true,
            username: true,
            photoUrl: true,
          },
        },
        member: WorkspaceService.assignedMemberInclude,
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
    if (!row) throw new NotFoundException('Transaction not found');
    if (await this.authorization.can(userId, 'finance.editOwn'))
      await this.authorization.requireOwnOrAny(
        userId,
        row,
        'finance.editOwn',
        'finance.editAny',
      );
    const [enriched] = await this.purchaseChannels.attach(workspaceId, [row]);
    return withTransactionIconPresentation(enriched);
  }

  async create(userId: string, dto: CreateTransactionDto) {
    await this.authorization.require(userId, 'finance.create');
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    await this.financeCategoriesService.ensureSystemCategories(workspaceId);

    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, workspaceId },
    });
    if (!account) throw new NotFoundException('Account not found');

    const category = await this.transactionCategoryMemberPolicy.validate({
      workspaceId,
      type: dto.type,
      categoryId: dto.categoryId,
      memberId: dto.memberId,
    });
    if (dto.iconId !== undefined && dto.iconId !== null) {
      const icon = await this.prisma.icon.findFirst({
        where: { id: dto.iconId, workspaceId },
      });
      if (!icon) throw new NotFoundException('Icon not found');
    }
    const purchaseChannel = await this.purchaseChannels.resolve({
      workspaceId,
      category,
      telegramChannelId: isBuyChannelsCategory(category)
        ? dto.telegramChannelId
        : undefined,
    });
    const transactionChannel = await resolveTransactionChannelLink(
      this.prisma,
      {
        workspaceId,
        category,
        telegramChannelId:
          isChannelAdvertisingRevenueCategory(category) ||
          isAdvertisingExpenseCategory(category)
            ? dto.telegramChannelId
            : undefined,
      },
    );

    const exchangeRateToPrimary =
      dto.exchangeRateToPrimary ??
      (await this.resolveRateToPrimary(workspaceId, account.currency));
    const created = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          workspaceId,
          accountId: dto.accountId,
          telegramChannelId: transactionChannel?.id ?? null,
          type: dto.type,
          amount: dto.amount,
          exchangeRateToPrimary,
          amountInPrimaryCurrency: dto.amount * exchangeRateToPrimary,
          date: new Date(dto.date),
          description: dto.description,
          categoryId: category.id,
          category: category.name,
          memberId: dto.memberId,
          currency: account.currency,
          iconId: dto.iconId ?? undefined,
          assignedMemberId,
          createdByUserId: userId,
        },
        include: {
          account: {
            include: {
              assignedMember: WorkspaceService.assignedMemberInclude,
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
          },
          categoryRef: {
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
            },
          },
          telegramChannel: {
            select: {
              id: true,
              title: true,
              username: true,
              photoUrl: true,
            },
          },
          member: WorkspaceService.assignedMemberInclude,
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
      if (purchaseChannel?.id) {
        await this.purchaseChannels.sync(
          tx,
          workspaceId,
          transaction.id,
          purchaseChannel.id,
        );
      }
      return transaction;
    });
    const [enriched] = await this.purchaseChannels.attach(workspaceId, [
      created,
    ]);
    return withTransactionIconPresentation(enriched);
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.financeCategoriesService.ensureSystemCategories(workspaceId);

    const existing = await this.prisma.transaction.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: {
        memberCompensationSettlement: { select: { id: true } },
      },
    });
    if (!existing) throw new NotFoundException('Transaction not found');
    if (existing.memberCompensationSettlement) {
      throw new BadRequestException(
        'Salary transactions are managed from the member finance history',
      );
    }
    await this.authorization.requireOwnOrAny(
      userId,
      existing,
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

    const type = dto.type ?? existing.type;
    const categoryId = dto.categoryId ?? existing.categoryId;
    const memberId =
      dto.memberId === undefined
        ? (existing.memberId ?? undefined)
        : (dto.memberId ?? undefined);

    if (!categoryId) {
      throw new BadRequestException('categoryId is required');
    }

    const category = await this.transactionCategoryMemberPolicy.validate({
      workspaceId,
      type,
      categoryId,
      memberId,
    });

    const amount = dto.amount ?? Number(existing.amount);
    const targetAccountId = dto.accountId ?? existing.accountId;
    const account = await this.prisma.account.findFirst({
      where: { id: targetAccountId, workspaceId },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (dto.iconId !== undefined && dto.iconId !== null) {
      const icon = await this.prisma.icon.findFirst({
        where: { id: dto.iconId, workspaceId },
      });
      if (!icon) throw new NotFoundException('Icon not found');
    }
    const purchaseChannel = await this.purchaseChannels.resolve({
      workspaceId,
      category,
      telegramChannelId:
        isBuyChannelsCategory(category) && dto.telegramChannelId === undefined
          ? ((await this.purchaseChannels.findLinked(workspaceId, existing.id))
              ?.id ?? null)
          : isBuyChannelsCategory(category)
            ? dto.telegramChannelId
            : undefined,
      transactionId: existing.id,
    });
    const hasDirectChannel =
      isChannelAdvertisingRevenueCategory(category) ||
      isAdvertisingExpenseCategory(category);
    const transactionChannel = await resolveTransactionChannelLink(
      this.prisma,
      {
        workspaceId,
        category,
        telegramChannelId:
          hasDirectChannel && dto.telegramChannelId === undefined
            ? existing.telegramChannelId
            : hasDirectChannel
              ? dto.telegramChannelId
              : undefined,
      },
    );

    const rate =
      dto.exchangeRateToPrimary ??
      (await this.resolveRateToPrimary(workspaceId, account.currency));
    const transactionDto = { ...dto };
    delete transactionDto.telegramChannelId;
    await this.purchaseChannels.ensureAvailable();
    const updated = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.update({
        where: { id },
        data: {
          ...transactionDto,
          categoryId: category.id,
          category: category.name,
          telegramChannelId: transactionChannel?.id ?? null,
          memberId,
          date: dto.date ? new Date(dto.date) : undefined,
          amountInPrimaryCurrency: amount * rate,
          iconId: dto.iconId === undefined ? undefined : dto.iconId,
          assignedMemberId,
        },
        include: {
          account: {
            include: {
              assignedMember: WorkspaceService.assignedMemberInclude,
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
          },
          categoryRef: {
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
            },
          },
          telegramChannel: {
            select: {
              id: true,
              title: true,
              username: true,
              photoUrl: true,
            },
          },
          member: WorkspaceService.assignedMemberInclude,
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
      await this.purchaseChannels.sync(
        tx,
        workspaceId,
        transaction.id,
        purchaseChannel?.id ?? null,
      );
      return transaction;
    });
    const [enriched] = await this.purchaseChannels.attach(workspaceId, [
      updated,
    ]);
    return withTransactionIconPresentation(enriched);
  }

  async remove(userId: string, id: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const existing = await this.prisma.transaction.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: {
        memberCompensationSettlement: { select: { id: true } },
      },
    });
    if (!existing) throw new NotFoundException('Transaction not found');
    if (existing.memberCompensationSettlement) {
      throw new BadRequestException(
        'Salary transactions are managed from the member finance history',
      );
    }
    await this.authorization.requireOwnOrAny(
      userId,
      existing,
      'finance.deleteOwn',
      'finance.deleteAny',
    );
    return this.prisma.transaction.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}

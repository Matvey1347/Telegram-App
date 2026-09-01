import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TelegramAdSalePaymentStatus,
  TelegramCrmContactStage,
  TelegramCrmConversationState,
} from '@prisma/client';
import type {
  CrmContactDetail,
  CrmContactsListResult,
  CrmUnreadSummary,
} from '@telegram-system/shared';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import {
  type ActiveDealTotals,
  CRM_OPEN_TASK_STATUSES,
  type ContactListRow,
  crmContactDetailSelect,
  crmContactListSelect,
  mapCrmContactDetail,
  mapCrmContactListItem,
  type PaymentSummaryRow,
} from './telegram-crm-contact-read-model';
import { CrmContactsQueryDto } from './telegram-crm.dto';
import { loadCrmReadNoReplyPage } from './telegram-crm-follow-up-read';

@Injectable()
export class TelegramCrmContactReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}

  async list(
    userId: string,
    query: CrmContactsQueryDto,
  ): Promise<CrmContactsListResult> {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const ownership = await this.authorization.scope(
      userId,
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    const pagination = normalizePagination(query);
    const readNoReplyPage =
      query.followUpView === 'READ_NO_REPLY'
        ? await loadCrmReadNoReplyPage(
            this.prisma,
            access.workspaceId,
            ownership,
            query,
            pagination,
            this.dueFilter(query),
          )
        : null;
    const baseWhere = this.contactWhere(
      access.workspaceId,
      ownership,
      query,
    );
    let rows: ContactListRow[];
    let totalItems: number;
    if (readNoReplyPage) {
      rows = readNoReplyPage.ids.length
        ? await this.prisma.telegramAdvertiser.findMany({
            where: { ...baseWhere, id: { in: readNoReplyPage.ids } },
            select: crmContactListSelect,
          })
        : [];
      const order = new Map(
        readNoReplyPage.ids.map((id, index) => [id, index]),
      );
      rows.sort(
        (left, right) =>
          (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      );
      totalItems = readNoReplyPage.totalItems;
    } else {
      [rows, totalItems] = await this.prisma.$transaction([
        this.prisma.telegramAdvertiser.findMany({
          where: baseWhere,
          select: crmContactListSelect,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          skip: pagination.skip,
          take: pagination.take,
        }),
        this.prisma.telegramAdvertiser.count({ where: baseWhere }),
      ]);
    }
    const [unreadByContact, dealTotals] = await Promise.all([
      this.unreadByContact(
        access.workspaceId,
        rows.map((row) => row.id),
      ),
      this.activeDealTotals(
        access.workspaceId,
        rows.flatMap((row) => (row.sales[0] ? [row.sales[0].id] : [])),
      ),
    ]);
    return createPaginatedResponse(
      rows.map((row) =>
        mapCrmContactListItem(row, unreadByContact, dealTotals),
      ),
      totalItems,
      pagination,
    );
  }

  async get(userId: string, contactId: string): Promise<CrmContactDetail> {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const ownership = await this.authorization.scope(
      userId,
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    const row = await this.prisma.telegramAdvertiser.findFirst({
      where: {
        id: contactId,
        workspaceId: access.workspaceId,
        ...('assignedMemberId' in ownership
          ? { ownerMemberId: ownership.assignedMemberId }
          : {}),
      },
      select: crmContactDetailSelect,
    });
    if (!row) throw new NotFoundException('CRM Contact not found');
    const [paymentSummary, dealCount, unread] = await Promise.all([
      this.paymentSummary(access.workspaceId, contactId),
      this.prisma.telegramAdSale.count({
        where: { workspaceId: access.workspaceId, advertiserId: contactId },
      }),
      this.prisma.telegramCrmConversation.aggregate({
        where: {
          workspaceId: access.workspaceId,
          contactId,
          state: TelegramCrmConversationState.ACTIVE,
        },
        _sum: { unreadCount: true },
      }),
    ]);
    return mapCrmContactDetail(
      row,
      paymentSummary,
      dealCount,
      unread._sum.unreadCount ?? 0,
    );
  }

  async unread(userId: string): Promise<CrmUnreadSummary> {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const ownership = await this.authorization.scope(
      userId,
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    const contacts = await this.prisma.telegramCrmConversation.aggregate({
      where: {
        workspaceId: access.workspaceId,
        state: TelegramCrmConversationState.ACTIVE,
        contactId: { not: null },
        ...('assignedMemberId' in ownership
          ? { contact: { ownerMemberId: ownership.assignedMemberId } }
          : {}),
      },
      _sum: { unreadCount: true },
    });
    const inbox =
      'assignedMemberId' in ownership
        ? 0
        : ((
            await this.prisma.telegramCrmConversation.aggregate({
              where: {
                workspaceId: access.workspaceId,
                state: TelegramCrmConversationState.ACTIVE,
                contactId: null,
              },
              _sum: { unreadCount: true },
            })
          )._sum.unreadCount ?? 0);
    const contactUnread = contacts._sum.unreadCount ?? 0;
    return { total: contactUnread + inbox, contacts: contactUnread, inbox };
  }

  private contactWhere(
    workspaceId: string,
    ownership: { assignedMemberId: string } | Record<string, never>,
    query: CrmContactsQueryDto,
  ): Prisma.TelegramAdvertiserWhereInput {
    const search = query.search?.trim();
    const due = this.dueFilter(query);
    const followUp = this.followUpFilter(query, due);
    return {
      workspaceId,
      ...('assignedMemberId' in ownership
        ? { ownerMemberId: ownership.assignedMemberId }
        : query.ownerMemberId
          ? { ownerMemberId: query.ownerMemberId }
          : {}),
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.archived === true
        ? { stage: TelegramCrmContactStage.ARCHIVED }
        : query.archived === false
          ? { stage: { not: TelegramCrmContactStage.ARCHIVED } }
          : {}),
      ...(due && query.followUpView !== 'TODAY'
        ? {
            tasks: {
              some: {
                status: { in: [...CRM_OPEN_TASK_STATUSES] },
                dueAt: due,
              },
            },
          }
        : {}),
      ...(followUp ? { AND: [followUp] } : {}),
      ...(search
        ? {
            OR: [
              { displayName: { contains: search, mode: 'insensitive' } },
              { companyName: { contains: search, mode: 'insensitive' } },
              {
                telegramUsername: {
                  contains: search.replace(/^@+/, ''),
                  mode: 'insensitive',
                },
              },
              { phone: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private dueFilter(query: CrmContactsQueryDto): Prisma.DateTimeFilter | null {
    const from = query.dueFrom ? new Date(query.dueFrom) : null;
    const to = query.dueTo ? new Date(query.dueTo) : null;
    if (from && to && from > to) {
      throw new BadRequestException('dueFrom must not be later than dueTo');
    }
    if (!from && !to) return null;
    return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }

  private followUpFilter(
    query: CrmContactsQueryDto,
    due: Prisma.DateTimeFilter | null,
  ): Prisma.TelegramAdvertiserWhereInput | null {
    if (!query.followUpView) return null;
    if (query.followUpView === 'TODAY') {
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      return {
        tasks: {
          some: {
            status: { in: [...CRM_OPEN_TASK_STATUSES] },
            dueAt: due ?? { gte: start, lt: end },
          },
        },
      };
    }
    if (query.followUpView === 'WAITING_FOR_REPLY') {
      return { stage: TelegramCrmContactStage.FOLLOW_UP };
    }
    const fields = this.prisma.telegramAdvertiser.fields;
    const wroteNoReply: Prisma.TelegramAdvertiserWhereInput = {
      lastOutboundAt: { not: null },
      OR: [
        { lastInboundAt: null },
        { lastOutboundAt: { gt: fields.lastInboundAt } },
      ],
    };
    if (query.followUpView === 'WROTE_NO_REPLY') return wroteNoReply;
    return wroteNoReply;
  }

  private async unreadByContact(workspaceId: string, contactIds: string[]) {
    if (!contactIds.length) return new Map<string, number>();
    const rows = await this.prisma.telegramCrmConversation.groupBy({
      by: ['contactId'],
      where: {
        workspaceId,
        contactId: { in: contactIds },
        state: TelegramCrmConversationState.ACTIVE,
      },
      _sum: { unreadCount: true },
    });
    return new Map(
      rows.flatMap((row) =>
        row.contactId ? [[row.contactId, row._sum.unreadCount ?? 0]] : [],
      ),
    );
  }

  private async activeDealTotals(workspaceId: string, dealIds: string[]) {
    if (!dealIds.length) return new Map<string, ActiveDealTotals>();
    const [placements, payments] = await Promise.all([
      this.prisma.telegramAdSalePlacement.groupBy({
        by: ['telegramAdSaleId'],
        where: { workspaceId, telegramAdSaleId: { in: dealIds } },
        _sum: { agreedPrice: true },
      }),
      this.prisma.telegramAdSalePayment.groupBy({
        by: ['telegramAdSaleId'],
        where: {
          workspaceId,
          telegramAdSaleId: { in: dealIds },
          status: TelegramAdSalePaymentStatus.ACTIVE,
        },
        _sum: { amount: true },
      }),
    ]);
    const agreedByDeal = new Map(
      placements.map((row) => [
        row.telegramAdSaleId,
        row._sum.agreedPrice ?? new Prisma.Decimal(0),
      ]),
    );
    const paidByDeal = new Map(
      payments.map((row) => [
        row.telegramAdSaleId,
        row._sum.amount ?? new Prisma.Decimal(0),
      ]),
    );
    return new Map(
      dealIds.map((dealId) => {
        const agreed = agreedByDeal.get(dealId) ?? new Prisma.Decimal(0);
        const paid = paidByDeal.get(dealId) ?? new Prisma.Decimal(0);
        return [
          dealId,
          {
            agreedAmount: agreed.toString(),
            paidAmount: paid.toString(),
            paymentStatus: this.paymentStatus(paid, agreed),
          },
        ];
      }),
    );
  }

  private paymentSummary(workspaceId: string, contactId: string) {
    return this.prisma.$queryRaw<PaymentSummaryRow[]>(Prisma.sql`
      SELECT
        sale."settlementCurrency" AS currency,
        SUM(COALESCE(placement_totals.agreed, 0)) AS "agreedAmount",
        SUM(COALESCE(payment_totals.paid, 0)) AS "paidAmount",
        SUM(GREATEST(
          COALESCE(placement_totals.agreed, 0) - COALESCE(payment_totals.paid, 0),
          0
        )) AS "outstandingAmount"
      FROM "TelegramAdSale" sale
      LEFT JOIN LATERAL (
        SELECT SUM(placement."agreedPrice") AS agreed
        FROM "TelegramAdSalePlacement" placement
        WHERE placement."telegramAdSaleId" = sale.id
      ) placement_totals ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(payment.amount) AS paid
        FROM "TelegramAdSalePayment" payment
        WHERE payment."telegramAdSaleId" = sale.id
          AND payment.status::text = ${TelegramAdSalePaymentStatus.ACTIVE}
      ) payment_totals ON TRUE
      WHERE sale."workspaceId" = ${workspaceId}
        AND sale."advertiserId" = ${contactId}
      GROUP BY sale."settlementCurrency"
      ORDER BY sale."settlementCurrency" ASC
    `);
  }

  private paymentStatus(
    paid: Prisma.Decimal,
    agreed: Prisma.Decimal,
  ): ActiveDealTotals['paymentStatus'] {
    if (paid.eq(0)) return 'UNPAID';
    if (paid.lt(agreed)) return 'PARTIALLY_PAID';
    if (paid.eq(agreed)) return 'PAID';
    return 'OVERPAID';
  }
}

import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CrmPurchasesPage } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmLegacyAuthorizationService } from './telegram-crm-legacy-authorization.service';
import {
  amountsFor,
  purchaseAmounts,
  purchaseSummary,
} from './telegram-crm-purchase-context-query';
import {
  decodeSalesContextCursor,
  encodeSalesContextCursor,
  salesContextLimit,
} from './telegram-crm-sales-context-cursor';

const purchaseSelect = {
  id: true,
  title: true,
  status: true,
  crmDealStage: true,
  createdAt: true,
  settlementCurrency: true,
  placements: {
    orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    take: 101,
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      agreedPrice: true,
      currency: true,
      telegramChannel: { select: { id: true, title: true } },
      product: { select: { name: true, workspaceId: true } },
      network: { select: { name: true, workspaceId: true } },
    },
  },
} satisfies Prisma.TelegramAdSaleSelect;

@Injectable()
export class TelegramCrmPurchaseContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly crmAuthorization: TelegramCrmLegacyAuthorizationService,
  ) {}

  /** Five compact receipts, without lifetime aggregation or placement fan-out. */
  async forCopilot(userId: string, contactId: string) {
    const workspaceId = await this.crmAuthorization.requireReadContact(
      userId,
      contactId,
    );
    const access = await this.authorization.require(
      userId,
      'adSales.sales.view',
    );
    if (access.workspaceId !== workspaceId)
      throw new ForbiddenException('CRM and sales workspace contexts differ');
    const ownOnly =
      (await this.authorization.can(userId, 'adSales.sales.editOwn')) &&
      !(await this.authorization.can(userId, 'adSales.sales.editAny'));
    return this.prisma.telegramAdSale.findMany({
      where: {
        workspaceId,
        advertiserId: contactId,
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        OR: [
          { status: 'COMPLETED' },
          {
            payments: {
              some: {
                workspaceId,
                status: { not: 'VOIDED' },
                amount: { gt: 0 },
              },
            },
          },
        ],
        ...(ownOnly ? { assignedMemberId: access.memberId } : {}),
      },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        settlementCurrency: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5,
    });
  }

  async list(
    userId: string,
    contactId: string,
    query: { cursor?: string; limit?: number },
  ): Promise<CrmPurchasesPage> {
    const workspaceId = await this.crmAuthorization.requireReadContact(
      userId,
      contactId,
    );
    const access = await this.authorization.require(
      userId,
      'adSales.sales.view',
    );
    // Match the existing Deals visibility rule, independently of CRM ownership.
    if (access.workspaceId !== workspaceId)
      throw new ForbiddenException('CRM and sales workspace contexts differ');
    const ownOnly =
      (await this.authorization.can(userId, 'adSales.sales.editOwn')) &&
      !(await this.authorization.can(userId, 'adSales.sales.editAny'));
    const scope = {
      workspaceId,
      contactId,
      ...(ownOnly ? { assignedMemberId: access.memberId } : {}),
    };
    const limit = salesContextLimit(query.limit);
    const cursor = decodeSalesContextCursor(query.cursor, 'purchases');
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.telegramAdSale.findMany({
          where: {
            workspaceId,
            advertiserId: contactId,
            ...(ownOnly ? { assignedMemberId: access.memberId } : {}),
            ...(cursor
              ? {
                  OR: [
                    { createdAt: { lt: new Date(cursor.createdAt!) } },
                    {
                      createdAt: new Date(cursor.createdAt!),
                      id: { lt: cursor.id },
                    },
                  ],
                }
              : {}),
          },
          select: {
            ...purchaseSelect,
            placements: {
              ...purchaseSelect.placements,
              where: { workspaceId, telegramChannel: { workspaceId } },
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
        });
        const page = rows.slice(0, limit);
        const [amounts, summary] = await Promise.all([
          purchaseAmounts(
            tx,
            scope,
            page.map((row) => row.id),
          ),
          cursor ? Promise.resolve(null) : purchaseSummary(tx, scope),
        ]);
        const last = page.at(-1);
        return {
          summary,
          items: page.map((row) => ({
            id: row.id,
            title: row.title,
            status: row.status,
            dealStage: row.crmDealStage,
            createdAt: row.createdAt.toISOString(),
            settlementCurrency: row.settlementCurrency,
            agreedByCurrency: amountsFor(amounts, 'agreed', row.id),
            receivedByCurrency: amountsFor(amounts, 'received', row.id),
            placements: row.placements.slice(0, 100).map((placement) => ({
              id: placement.id,
              channel: placement.telegramChannel,
              productName:
                placement.product?.workspaceId === workspaceId
                  ? placement.product.name
                  : null,
              networkName:
                placement.network?.workspaceId === workspaceId
                  ? placement.network.name
                  : null,
              status: placement.status,
              agreedPrice: placement.agreedPrice.toFixed(),
              currency: placement.currency,
              scheduledAt: placement.scheduledAt.toISOString(),
            })),
            hasMorePlacements: row.placements.length > 100,
            historicalDataIncomplete:
              !row.placements.length ||
              row.placements.some(
                (placement) =>
                  placement.product?.workspaceId !== workspaceId ||
                  placement.network?.workspaceId !== workspaceId,
              ),
          })),
          hasMore: rows.length > limit,
          nextCursor:
            rows.length > limit && last
              ? encodeSalesContextCursor({
                  kind: 'purchases',
                  id: last.id,
                  createdAt: last.createdAt.toISOString(),
                })
              : null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}

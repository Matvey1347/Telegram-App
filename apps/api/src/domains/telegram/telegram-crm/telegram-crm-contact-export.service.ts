import { Injectable } from '@nestjs/common';
import type { CrmContactExport, CrmContactSegment } from '@telegram-system/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';

/** Builds a deliberately compact export for portable client deduplication. */
@Injectable()
export class TelegramCrmContactExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}

  async export(
    userId: string,
    segment: CrmContactSegment = 'ALL',
  ): Promise<CrmContactExport[]> {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const ownership = await this.authorization.scope(
      userId,
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    const where: Prisma.TelegramAdvertiserWhereInput = {
      workspaceId: access.workspaceId,
      archivedAt: null,
      ...('assignedMemberId' in ownership
        ? { ownerMemberId: ownership.assignedMemberId }
        : {}),
      ...(segment === 'TAGGED' ? { tags: { some: {} } } : {}),
      ...(segment === 'UNTAGGED' ? { tags: { none: {} } } : {}),
    };
    const contacts = await this.prisma.telegramAdvertiser.findMany({
      where,
      orderBy: [{ telegramUsername: 'asc' }, { displayName: 'asc' }],
      select: {
        id: true,
        displayName: true,
        telegramUsername: true,
        tags: { select: { tag: { select: { name: true } } } },
        sales: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            status: true,
            crmDealStage: true,
            origin: true,
            settlementCurrency: true,
            expectedCloseAt: true,
            createdAt: true,
          },
        },
        crossPromotionPlans: {
          orderBy: { scheduledAt: 'desc' },
          select: {
            id: true,
            title: true,
            kind: true,
            status: true,
            scheduledAt: true,
            trackingEndsAt: true,
            createdAt: true,
          },
        },
      },
    });
    return contacts.map((contact) => {
      const deals = contact.sales.map((sale) => ({
        id: sale.id,
        title: sale.title,
        status: sale.status,
        stage: sale.crmDealStage,
        origin: sale.origin,
        currency: sale.settlementCurrency,
        expectedCloseAt: sale.expectedCloseAt?.toISOString() ?? null,
        createdAt: sale.createdAt.toISOString(),
      }));
      return {
        id: contact.id,
        displayName: contact.displayName,
        telegramUsername: contact.telegramUsername,
        tags: contact.tags.map(({ tag }) => tag.name),
        // Keep consumers of the original compact export working while new
        // exports expose the full deal records below.
        purchases: deals.map(({ title, status, currency, createdAt }) => ({
          title,
          status,
          currency,
          createdAt,
        })),
        deals,
        crossPromotions: contact.crossPromotionPlans.map((plan) => ({
          id: plan.id,
          title: plan.title,
          kind: plan.kind,
          status: plan.status,
          scheduledAt: plan.scheduledAt.toISOString(),
          trackingEndsAt: plan.trackingEndsAt?.toISOString() ?? null,
          createdAt: plan.createdAt.toISOString(),
        })),
      };
    });
  }
}

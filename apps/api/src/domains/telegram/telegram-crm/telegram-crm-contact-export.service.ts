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
            title: true,
            status: true,
            settlementCurrency: true,
            createdAt: true,
          },
        },
      },
    });
    return contacts.map((contact) => ({
      id: contact.id,
      displayName: contact.displayName,
      telegramUsername: contact.telegramUsername,
      tags: contact.tags.map(({ tag }) => tag.name),
      purchases: contact.sales.map((sale) => ({
        title: sale.title,
        status: sale.status,
        currency: sale.settlementCurrency,
        createdAt: sale.createdAt.toISOString(),
      })),
    }));
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma, TelegramCrmContactStage } from '@prisma/client';
import type { CrmContactsListResult } from '@telegram-system/shared';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { CrmContactsQueryDto } from './telegram-crm.dto';
import { crmContactSelect, mapCrmContact } from './telegram-crm-contact.mapper';

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
    const search = query.search?.trim();
    const where: Prisma.TelegramAdvertiserWhereInput = {
      workspaceId: access.workspaceId,
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
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.telegramAdvertiser.findMany({
        where,
        select: crmContactSelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.telegramAdvertiser.count({ where }),
    ]);
    return createPaginatedResponse(
      rows.map(mapCrmContact),
      totalItems,
      pagination,
    );
  }
}

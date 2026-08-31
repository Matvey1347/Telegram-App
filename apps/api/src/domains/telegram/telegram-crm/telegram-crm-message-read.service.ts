import { Injectable, NotFoundException } from '@nestjs/common';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { CrmMessagesQueryDto } from './telegram-crm.dto';
import { crmMessageSelect, mapCrmMessage } from './telegram-crm-message.mapper';

@Injectable()
export class TelegramCrmMessageReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}

  async list(
    userId: string,
    conversationId: string,
    query: CrmMessagesQueryDto,
  ) {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const ownership = await this.authorization.scope(
      userId,
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    const conversation = await this.prisma.telegramCrmConversation.findFirst({
      where: {
        id: conversationId,
        workspaceId: access.workspaceId,
        ...('assignedMemberId' in ownership
          ? { contact: { ownerMemberId: ownership.assignedMemberId } }
          : {}),
      },
      select: { id: true },
    });
    if (!conversation)
      throw new NotFoundException('CRM Conversation not found');
    const pagination = normalizePagination(query);
    const where = { conversationId, workspaceId: access.workspaceId };
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.telegramCrmMessage.findMany({
        where,
        select: crmMessageSelect,
        orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.telegramCrmMessage.count({ where }),
    ]);
    return createPaginatedResponse(
      rows.map(mapCrmMessage),
      totalItems,
      pagination,
    );
  }
}

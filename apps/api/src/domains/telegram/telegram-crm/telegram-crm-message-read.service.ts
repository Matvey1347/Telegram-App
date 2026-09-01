import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CrmMessageListItem,
  CrmMessagesCursorPage,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { CrmMessagesQueryDto } from './telegram-crm.dto';
import { crmMessageSelect, mapCrmMessage } from './telegram-crm-message.mapper';
import {
  crmAccountSummarySelect,
  crmMemberSummarySelect,
  mapCrmAccountSummary,
  mapCrmMemberSummary,
} from './telegram-crm-read-model.mapper';

const DEFAULT_MESSAGE_PAGE_SIZE = 50;

const crmMessageListSelect = {
  ...crmMessageSelect,
  sentByMember: { select: crmMemberSummarySelect },
} satisfies Prisma.TelegramCrmMessageSelect;

type MessageListRow = Prisma.TelegramCrmMessageGetPayload<{
  select: typeof crmMessageListSelect;
}>;
type MessageCursor = { sentAt: Date; id: string };

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
  ): Promise<CrmMessagesCursorPage> {
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
      select: {
        id: true,
        mtprotoAccount: { select: crmAccountSummarySelect },
      },
    });
    if (!conversation) {
      throw new NotFoundException('CRM Conversation not found');
    }

    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const limit = query.limit ?? query.pageSize ?? DEFAULT_MESSAGE_PAGE_SIZE;
    const rows = await this.prisma.telegramCrmMessage.findMany({
      where: {
        conversationId,
        workspaceId: access.workspaceId,
        ...(cursor
          ? {
              OR: [
                { sentAt: { lt: cursor.sentAt } },
                { sentAt: cursor.sentAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      select: crmMessageListSelect,
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    return {
      items: pageRows.map((row) =>
        this.mapListItem(row, conversation.mtprotoAccount),
      ),
      hasMore,
      nextCursor:
        hasMore && pageRows.length
          ? this.encodeCursor(pageRows[pageRows.length - 1])
          : null,
    };
  }

  private mapListItem(
    row: MessageListRow,
    account: Parameters<typeof mapCrmAccountSummary>[0],
  ): CrmMessageListItem {
    return {
      ...mapCrmMessage(row),
      account: mapCrmAccountSummary(account),
      sentByMember: mapCrmMemberSummary(row.sentByMember),
    };
  }

  private encodeCursor(value: MessageCursor) {
    return Buffer.from(
      JSON.stringify({
        version: 1,
        sentAt: value.sentAt.toISOString(),
        id: value.id,
      }),
      'utf8',
    ).toString('base64url');
  }

  private decodeCursor(value: string): MessageCursor {
    try {
      const parsed = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      ) as { version?: unknown; sentAt?: unknown; id?: unknown };
      if (
        parsed.version !== 1 ||
        typeof parsed.sentAt !== 'string' ||
        typeof parsed.id !== 'string' ||
        !parsed.id
      ) {
        throw new Error('invalid payload');
      }
      const sentAt = new Date(parsed.sentAt);
      if (Number.isNaN(sentAt.getTime())) throw new Error('invalid date');
      return { sentAt, id: parsed.id };
    } catch {
      throw new BadRequestException('Invalid CRM Message cursor');
    }
  }
}

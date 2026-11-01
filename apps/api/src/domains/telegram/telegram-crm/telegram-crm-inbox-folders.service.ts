import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CrmInboxFoldersResult,
  ResolvedEmoji,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { crmFolderSelect } from './telegram-crm-folder-sync';

@Injectable()
export class TelegramCrmInboxFoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}

  async list(userId: string): Promise<CrmInboxFoldersResult> {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const ownership = await this.authorization.scope(
      userId,
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    const memberId =
      'assignedMemberId' in ownership ? ownership.assignedMemberId : null;
    const [folders, counts, total] = await Promise.all([
      this.prisma.telegramCrmFolder.findMany({
        where: {
          workspaceId: access.workspaceId,
          isActive: true,
          ...(memberId
            ? {
                OR: [
                  { account: { assignedMemberId: memberId } },
                  {
                    memberships: {
                      some: {
                        workspaceId: access.workspaceId,
                        conversation: {
                          workspaceId: access.workspaceId,
                          state: 'ACTIVE',
                          contact: { ownerMemberId: memberId },
                        },
                      },
                    },
                  },
                ],
              }
            : {}),
        },
        select: crmFolderSelect,
        orderBy: [
          { mtprotoAccountId: 'asc' },
          { telegramFolderId: 'asc' },
          { id: 'asc' },
        ],
      }),
      this.prisma.$queryRaw<
        Array<{ folderId: string; unreadCount: bigint }>
      >(Prisma.sql`
        SELECT membership."folderId", SUM(conversation."unreadCount")::bigint AS "unreadCount"
        FROM "TelegramCrmConversationFolder" membership
        JOIN "TelegramCrmConversation" conversation ON conversation."id" = membership."conversationId" AND conversation."workspaceId" = membership."workspaceId" AND conversation."mtprotoAccountId" = membership."mtprotoAccountId"
        JOIN "TelegramCrmFolder" folder ON folder."id" = membership."folderId" AND folder."workspaceId" = membership."workspaceId" AND folder."mtprotoAccountId" = membership."mtprotoAccountId"
        ${memberId ? Prisma.sql`JOIN "TelegramAdvertiser" contact ON contact."id" = conversation."contactId" AND contact."workspaceId" = conversation."workspaceId"` : Prisma.empty}
        WHERE conversation."workspaceId" = ${access.workspaceId} AND conversation."state" = 'ACTIVE' AND conversation."unreadCount" > 0 AND folder."isActive" = true
          ${memberId ? Prisma.sql`AND contact."ownerMemberId" = ${memberId}` : Prisma.empty}
        GROUP BY membership."folderId"
      `),
      this.prisma.telegramCrmConversation.aggregate({
        where: {
          workspaceId: access.workspaceId,
          state: 'ACTIVE',
          ...(memberId ? { contact: { ownerMemberId: memberId } } : {}),
        },
        _sum: { unreadCount: true },
      }),
    ]);
    const byFolder = new Map(
      counts.map((row) => [row.folderId, Number(row.unreadCount)]),
    );
    return {
      items: folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        color: folder.color,
        emojiPresentation: folder.emojiPresentation as ResolvedEmoji | null,
        unreadCount: byFolder.get(folder.id) ?? 0,
        excludeRead: folder.excludeRead,
      })),
      totalUnread: total._sum.unreadCount ?? 0,
    };
  }
}

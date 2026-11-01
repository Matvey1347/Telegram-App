import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CrmRealtimeEvent } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';

@Injectable()
export class TelegramCrmStreamAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}
  async visible(
    userId: string,
    workspaceId: string,
    events: CrmRealtimeEvent[],
  ) {
    await this.authorization.refresh(userId);
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    if (access.workspaceId !== workspaceId)
      throw new ForbiddenException('CRM_STREAM_WORKSPACE_REVOKED');
    const scope = await this.authorization.scope(
      userId,
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    const conversationIds = [
      ...new Set(
        events.flatMap((event) =>
          'conversationId' in event ? [event.conversationId] : [],
        ),
      ),
    ];
    const contactIds = [
      ...new Set(
        events.flatMap((event) =>
          event.type === 'contact.updated' ? [event.contactId] : [],
        ),
      ),
    ];
    const [conversations, contacts] = await Promise.all([
      conversationIds.length
        ? this.prisma.telegramCrmConversation.findMany({
            where: { workspaceId, id: { in: conversationIds } },
            select: { id: true, contact: { select: { ownerMemberId: true } } },
          })
        : [],
      contactIds.length
        ? this.prisma.telegramAdvertiser.findMany({
            where: { workspaceId, id: { in: contactIds } },
            select: { id: true, ownerMemberId: true },
          })
        : [],
    ]);
    const byConversation = new Map<string, string | null>(
      conversations.map(
        (row: {
          id: string;
          contact: { ownerMemberId: string | null } | null;
        }) => [row.id, row.contact?.ownerMemberId ?? null] as const,
      ),
    );
    const byContact = new Map<string, string | null>(
      contacts.map(
        (row: { id: string; ownerMemberId: string | null }) =>
          [row.id, row.ownerMemberId] as const,
      ),
    );
    const permitted = (owner: string | null) =>
      !('assignedMemberId' in scope) || owner === scope.assignedMemberId;
    return events.filter((event) => {
      if (event.workspaceId !== workspaceId) return false;
      if ('conversationId' in event)
        return (
          byConversation.has(event.conversationId) &&
          permitted(byConversation.get(event.conversationId) ?? null)
        );
      if (event.type === 'contact.updated')
        return (
          byContact.has(event.contactId) &&
          permitted(byContact.get(event.contactId) ?? null)
        );
      if (event.type === 'inbox.updated') return !('assignedMemberId' in scope);
      return permitted(event.ownerMemberId);
    });
  }
}

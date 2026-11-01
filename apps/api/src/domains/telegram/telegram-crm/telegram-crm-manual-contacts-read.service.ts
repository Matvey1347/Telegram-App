import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  deriveCrmSalesAttention,
  type CrmManualContactsFilter,
  type CrmManualContactsPage,
  type CrmManualInstagramWorkflow,
  type CrmManualActivity,
  CRM_MANUAL_INSTAGRAM_ACTIONS,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmLegacyAuthorizationService } from './telegram-crm-legacy-authorization.service';
import {
  instagramMethodSelect,
  mapInstagramMethod,
} from './telegram-crm-instagram-identity.service';
import {
  crmMemberSummarySelect,
  mapCrmMemberSummary,
} from './telegram-crm-read-model.mapper';
import { loadNextCrmFollowUp } from '../telegram-ad-sales/telegram-ad-sales-crm-task-schedule';

const select = {
  id: true,
  workspaceId: true,
  displayName: true,
  companyName: true,
  source: true,
  ownerMemberId: true,
  archivedAt: true,
  manualSalesStatus: true,
  manualInstagramContactAt: true,
  manualInstagramReplyAt: true,
  nextContactAt: true,
  ownerMember: { select: crmMemberSummarySelect },
  contacts: {
    where: { type: 'INSTAGRAM' as const },
    orderBy: [{ isPrimary: 'desc' as const }, { id: 'asc' as const }],
    take: 20,
    select: instagramMethodSelect,
  },
} satisfies Prisma.TelegramAdvertiserSelect;
type Row = Prisma.TelegramAdvertiserGetPayload<{ select: typeof select }>;
function cursor(id: string) {
  return Buffer.from(id).toString('base64url');
}
function after(value?: string) {
  if (!value) return undefined;
  const id = Buffer.from(value, 'base64url').toString();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || cursor(id) !== value)
    throw new BadRequestException('CRM_CURSOR_INVALID');
  return id;
}
function attention(row: Row) {
  return deriveCrmSalesAttention({
    state: 'ACTIVE',
    manualStatus: row.manualSalesStatus,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    nextContactAt: row.nextContactAt?.toISOString() ?? null,
    lastInboundAt: row.manualInstagramReplyAt?.toISOString() ?? null,
    lastOutboundAt: row.manualInstagramContactAt?.toISOString() ?? null,
  });
}
@Injectable()
export class TelegramCrmManualContactsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: TelegramCrmLegacyAuthorizationService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}
  async list(
    userId: string,
    query: CrmManualContactsFilter,
  ): Promise<CrmManualContactsPage> {
    const scope = await this.crm.readScope(userId),
      limit = Math.min(50, Math.max(1, query.limit ?? 20)),
      id = after(query.cursor);
    const AND: Prisma.TelegramAdvertiserWhereInput[] = [];
    const status = query.status;
    if (status === 'STALE')
      AND.push({
        contacts: { some: { type: 'INSTAGRAM', identityState: 'STALE' } },
      });
    else if (
      status &&
      ['INTERESTED', 'CLOSED', 'DO_NOT_CONTACT'].includes(status)
    )
      AND.push({
        manualSalesStatus: status as 'INTERESTED' | 'CLOSED' | 'DO_NOT_CONTACT',
      });
    else if (status && status !== 'ALL') {
      AND.push({ archivedAt: null, manualSalesStatus: null });
      if (status === 'FOLLOW_UP_DUE')
        AND.push({ nextContactAt: { lte: new Date() } });
      else {
        AND.push({
          OR: [{ nextContactAt: null }, { nextContactAt: { gt: new Date() } }],
        });
        if (status === 'WAITING_FOR_CLIENT')
          AND.push({
            manualInstagramContactAt: { not: null },
            OR: [
              { manualInstagramReplyAt: null },
              {
                manualInstagramContactAt: {
                  gte: this.prisma.telegramAdvertiser.fields
                    .manualInstagramReplyAt,
                },
              },
            ],
          });
        if (status === 'NEEDS_REPLY')
          AND.push({
            manualInstagramReplyAt: { not: null },
            OR: [
              { manualInstagramContactAt: null },
              {
                manualInstagramReplyAt: {
                  gt: this.prisma.telegramAdvertiser.fields
                    .manualInstagramContactAt,
                },
              },
            ],
          });
      }
    }
    if (query.search?.trim())
      AND.push({
        OR: [
          {
            displayName: { contains: query.search.trim(), mode: 'insensitive' },
          },
          {
            contacts: {
              some: {
                type: 'INSTAGRAM',
                normalizedValue: {
                  contains: query.search.trim().replace(/^@/, '').toLowerCase(),
                },
              },
            },
          },
        ],
      });
    const rows = await this.prisma.telegramAdvertiser.findMany({
      where: {
        workspaceId: scope.workspaceId,
        ...(scope.ownerMemberId ? { ownerMemberId: scope.ownerMemberId } : {}),
        contacts: { some: { type: 'INSTAGRAM' } },
        ...(id ? { id: { lt: id } } : {}),
        AND,
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      select,
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        displayName: row.displayName,
        companyName: row.companyName,
        source: row.source,
        ownerMemberId: row.ownerMemberId,
        archivedAt: row.archivedAt?.toISOString() ?? null,
        methods: row.contacts.map(mapInstagramMethod),
        lastContactedAt: row.manualInstagramContactAt?.toISOString() ?? null,
        lastRepliedAt: row.manualInstagramReplyAt?.toISOString() ?? null,
        nextContactAt: row.nextContactAt?.toISOString() ?? null,
        manualStatus: row.manualSalesStatus,
        attentionStatus: attention(row),
        ownerMember: mapCrmMemberSummary(row.ownerMember),
      })),
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit ? cursor(page[page.length - 1].id) : null,
    };
  }
  async workflow(
    userId: string,
    contactId: string,
    query: { cursor?: string; limit?: number } = {},
  ): Promise<CrmManualInstagramWorkflow> {
    const workspaceId = await this.crm.requireReadContact(userId, contactId);
    const row = await this.prisma.telegramAdvertiser.findFirst({
      where: { id: contactId, workspaceId },
      select,
    });
    if (!row) throw new NotFoundException('CRM Contact not found');
    const id = after(query.cursor),
      limit = Math.min(20, Math.max(1, query.limit ?? 20));
    const [next, activities, editAny, editOwn, access] = await Promise.all([
      loadNextCrmFollowUp(this.prisma, workspaceId, contactId),
      this.prisma.telegramAdvertiserActivity.findMany({
        where: {
          workspaceId,
          advertiserId: contactId,
          ...(id ? { id: { lt: id } } : {}),
          metadata: { path: ['kind'], equals: 'MANUAL_ACTIVITY' },
        },
        orderBy: { id: 'desc' },
        take: limit + 1,
        select: {
          id: true,
          actorUserId: true,
          actorMemberId: true,
          occurredAt: true,
          description: true,
          metadata: true,
        },
      }),
      this.authorization.can(userId, 'adSales.crm.editAny'),
      this.authorization.can(userId, 'adSales.crm.editOwn'),
      this.authorization.require(userId, 'adSales.crm.view'),
    ]);
    const methods = row.contacts.map(mapInstagramMethod),
      reason = row.archivedAt
        ? 'INACTIVE'
        : ['CLOSED', 'DO_NOT_CONTACT'].includes(row.manualSalesStatus ?? '')
          ? row.manualSalesStatus
          : !methods.some((m) => m.state === 'ACTIVE' && m.ownershipConfirmed)
            ? 'INSTAGRAM_IDENTITY_REVIEW_REQUIRED'
            : null;
    const nextContactAt =
      (next
        ? (next.snoozedUntil ?? next.remindAt ?? next.dueAt)
        : row.nextContactAt
      )?.toISOString() ?? null;
    return {
      contactId,
      channel: 'INSTAGRAM',
      canEdit: editAny || (editOwn && row.ownerMemberId === access.memberId),
      methods,
      manualStatus: row.manualSalesStatus,
      attentionStatus: attention({
        ...row,
        nextContactAt: nextContactAt ? new Date(nextContactAt) : null,
      }),
      lastContactedAt: row.manualInstagramContactAt?.toISOString() ?? null,
      lastRepliedAt: row.manualInstagramReplyAt?.toISOString() ?? null,
      nextContactAt,
      nextFollowUp: next
        ? {
            id: next.id,
            title: next.title,
            dueAt: next.dueAt.toISOString(),
            remindAt: next.remindAt?.toISOString() ?? null,
            snoozedUntil: next.snoozedUntil?.toISOString() ?? null,
            effectiveAt: (
              next.snoozedUntil ??
              next.remindAt ??
              next.dueAt
            ).toISOString(),
            assignedMemberId: next.assignedMemberId,
            status: next.status as 'OPEN' | 'IN_PROGRESS',
          }
        : null,
      commercialOutreachAllowed: !reason,
      outreachBlockedReason: reason,
      activities: activities.slice(0, limit).flatMap((a) => {
        const m = a.metadata as Record<string, unknown>;
        return m.channel === 'INSTAGRAM' &&
          CRM_MANUAL_INSTAGRAM_ACTIONS.includes(
            m.action as CrmManualActivity['action'],
          )
          ? [
              {
                id: a.id,
                kind: 'MANUAL_ACTIVITY' as const,
                channel: 'INSTAGRAM' as const,
                action: m.action as CrmManualActivity['action'],
                occurredAt: a.occurredAt.toISOString(),
                actorUserId: a.actorUserId,
                actorMemberId: a.actorMemberId,
                note: a.description,
                candidateId:
                  typeof m.candidateId === 'string' ? m.candidateId : null,
                draftId: typeof m.draftId === 'string' ? m.draftId : null,
                reportedManually: true as const,
              },
            ]
          : [];
      }),
      hasMore: activities.length > limit,
      nextCursor:
        activities.length > limit ? cursor(activities[limit - 1].id) : null,
    };
  }
}

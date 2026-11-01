import { instagramIdentity } from './telegram-crm-instagram-identity.service';
import { manualEditScope } from './telegram-crm-manual-operation';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CrmManualActivityInput,
  LeadContact,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmLegacyAuthorizationService } from './telegram-crm-legacy-authorization.service';
import { TelegramLeadPreparationReadService } from './lead-discovery/lead-preparation-read.service';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';
import {
  manualFactDate,
  manualFingerprint,
  requireNewManualOperation,
} from './telegram-crm-manual-operation';
const commercial = ['CONTACTED', 'WAITING_FOR_REPLY', 'OFFER_SENT'];
@Injectable()
export class TelegramCrmManualActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: TelegramCrmLegacyAuthorizationService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly preparations: TelegramLeadPreparationReadService,
    private readonly events: TelegramCrmEventHub,
  ) {}
  async record(
    userId: string,
    contactId: string,
    input: CrmManualActivityInput,
  ) {
    const scope = await manualEditScope(this.crm, userId),
      access = await this.authorization.require(userId, 'adSales.crm.view');
    const payload = {
      action: input.action,
      occurredAt: input.occurredAt ?? null,
      note: input.note?.trim() || null,
      candidateId: input.candidateId ?? null,
      draftId: input.draftId ?? null,
      draftRevision: input.draftRevision ?? null,
    };
    if ((payload.note?.length ?? 0) > 300)
      throw new BadRequestException('MANUAL_ACTIVITY_NOTE_TOO_LONG');
    const fingerprint = manualFingerprint(userId, contactId, payload);
    const changed = await this.prisma.$transaction(async (tx) => {
      // Workspace operation lock prevents cross-contact reuse racing the unique receipt.
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope.workspaceId + ':' + input.operationId}, 0))`,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "TelegramAdvertiser" WHERE "workspaceId"=${scope.workspaceId} AND "id"=${contactId} FOR UPDATE`,
      );
      const contact = await tx.telegramAdvertiser.findFirst({
        where: {
          id: contactId,
          workspaceId: scope.workspaceId,
          ...(scope.ownerMemberId
            ? { ownerMemberId: scope.ownerMemberId }
            : {}),
        },
        select: {
          id: true,
          ownerMemberId: true,
          archivedAt: true,
          manualSalesStatus: true,
          lastContactAt: true,
          manualInstagramContactAt: true,
          manualInstagramReplyAt: true,
        },
      });
      if (!contact) throw new NotFoundException('CRM Contact not found');
      const receipt = await tx.telegramAdvertiserActivity.findUnique({
        where: {
          workspaceId_operationId: {
            workspaceId: scope.workspaceId,
            operationId: input.operationId,
          },
        },
        select: { requestFingerprint: true },
      });
      if (receipt) {
        if (receipt.requestFingerprint !== fingerprint)
          throw new ConflictException('MANUAL_OPERATION_CONFLICT');
        return null;
      }
      requireNewManualOperation(input.operationId);
      const at = manualFactDate(input.occurredAt);
      const statusAction = [
        'INTERESTED',
        'CLOSED',
        'DO_NOT_CONTACT',
        'RESET_STATUS',
      ].includes(input.action);
      if (
        contact.manualSalesStatus === 'DO_NOT_CONTACT' &&
        input.action !== 'DO_NOT_CONTACT' &&
        input.action !== 'RESET_STATUS' &&
        input.action !== 'REPLIED'
      )
        throw new ConflictException('DO_NOT_CONTACT');
      if (
        commercial.includes(input.action) &&
        (contact.archivedAt || contact.manualSalesStatus === 'CLOSED')
      )
        throw new ConflictException('CLIENT_NOT_ELIGIBLE_FOR_OUTREACH');
      let instagramUsernames: string[] = [];
      if (commercial.includes(input.action)) {
        const methods = await tx.telegramAdvertiserContact.findMany({
          where: {
            workspaceId: scope.workspaceId,
            advertiserId: contactId,
            type: 'INSTAGRAM',
            identityState: 'ACTIVE',
            ownershipConfirmedAt: { not: null },
          },
          select: { normalizedValue: true },
          take: 20,
        });
        if (!methods.length)
          throw new ConflictException('INSTAGRAM_IDENTITY_REVIEW_REQUIRED');
        instagramUsernames = methods.map((method) => method.normalizedValue);
      }
      if (
        input.candidateId ||
        input.draftId ||
        input.draftRevision !== undefined
      ) {
        if (
          input.action !== 'OFFER_SENT' ||
          !input.candidateId ||
          !input.draftId ||
          !input.draftRevision
        )
          throw new BadRequestException('MANUAL_DRAFT_REFERENCES_INCOMPLETE');
        const candidate = await tx.telegramLeadCandidate.findFirst({
          where: {
            id: input.candidateId,
            workspaceId: scope.workspaceId,
            contactId,
          },
          select: { id: true, contacts: true },
        });
        if (!candidate)
          throw new ConflictException('MANUAL_DRAFT_CLIENT_MISMATCH');
        const view = await this.preparations.view(userId, candidate.id);
        const draft = view.drafts.find((d) => d.id === input.draftId);
        if (
          !draft?.canCopy ||
          draft.authorUserId !== userId ||
          draft.revision !== input.draftRevision ||
          draft.status !== 'APPROVED'
        )
          throw new ConflictException('MANUAL_DRAFT_FRESH_APPROVAL_REQUIRED');
        const identities = candidate.contacts as unknown as LeadContact[];
        if (
          !identities.some(
            (c) =>
              c.type === 'INSTAGRAM' &&
              c.confirmed &&
              ['ADVERTISER', 'SALES_CONTACT'].includes(c.role) &&
              instagramUsernames.includes(instagramIdentity(c.value).username),
          )
        )
          throw new ConflictException(
            'MANUAL_DRAFT_INSTAGRAM_IDENTITY_MISMATCH',
          );
      }
      const nextStatus =
        input.action === 'RESET_STATUS'
          ? null
          : (input.action as 'INTERESTED' | 'CLOSED' | 'DO_NOT_CONTACT');
      // A repeated status without a fact is an unchanged-state no-op, including no receipt.
      if (
        statusAction &&
        contact.manualSalesStatus === nextStatus &&
        !payload.note
      )
        return null;
      const data: Prisma.TelegramAdvertiserUpdateInput = {};
      if (statusAction) data.manualSalesStatus = nextStatus;
      if (
        commercial.includes(input.action) &&
        (!contact.manualInstagramContactAt ||
          at > contact.manualInstagramContactAt)
      )
        data.manualInstagramContactAt = at;
      if (
        input.action === 'REPLIED' &&
        (!contact.manualInstagramReplyAt || at > contact.manualInstagramReplyAt)
      )
        data.manualInstagramReplyAt = at;
      if (
        (commercial.includes(input.action) || input.action === 'REPLIED') &&
        (!contact.lastContactAt || at > contact.lastContactAt)
      )
        data.lastContactAt = at;
      if (Object.keys(data).length)
        await tx.telegramAdvertiser.update({
          where: { id: contactId, workspaceId: scope.workspaceId },
          data,
        });
      await tx.telegramAdvertiserActivity.create({
        data: {
          workspaceId: scope.workspaceId,
          advertiserId: contactId,
          actorUserId: userId,
          actorMemberId: access.memberId,
          operationId: input.operationId,
          requestFingerprint: fingerprint,
          type:
            input.action === 'REPLIED'
              ? 'CLIENT_REPLIED'
              : input.action === 'OFFER_SENT'
                ? 'OFFER_SENT'
                : statusAction
                  ? 'STATUS_CHANGED'
                  : 'MANUAL_CONTACT',
          title: `Instagram: ${input.action} (reported manually)`,
          description: payload.note,
          occurredAt: at,
          metadata: {
            kind: 'MANUAL_ACTIVITY',
            channel: 'INSTAGRAM',
            ...payload,
            reportedManually: true,
          },
        },
      });
      return contact;
    });
    if (changed)
      this.events.emit({
        type: 'contact.updated',
        workspaceId: scope.workspaceId,
        contactId,
        ownerMemberId: changed.ownerMemberId,
        occurredAt: new Date().toISOString(),
      });
  }
}

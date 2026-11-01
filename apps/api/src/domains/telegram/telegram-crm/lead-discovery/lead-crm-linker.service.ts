import { instagramIdentity } from '../telegram-crm-instagram-identity.service';
import {
  confirmedLeadMethods,
  confirmedLeadClientWhere,
  hasCurrentLeadContact,
} from './lead-confirmed-identities';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, type TelegramLeadCandidate } from '@prisma/client';
import type {
  LeadContact,
  LeadCandidateReviewInput,
} from '@telegram-system/shared';
import { WorkspaceAuthorizationService } from '../../../workspace/workspace-authorization/workspace-authorization.service';
@Injectable()
export class TelegramLeadCrmLinker {
  constructor(private readonly authorization: WorkspaceAuthorizationService) {}
  async link(
    tx: Prisma.TransactionClient,
    userId: string,
    workspaceId: string,
    row: TelegramLeadCandidate,
    contacts: LeadContact[],
    input: LeadCandidateReviewInput,
  ) {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    if (access.workspaceId !== workspaceId)
      throw new ForbiddenException('LEAD_WORKSPACE_MISMATCH');
    const ownership = await this.authorization.scope(
        userId,
        'adSales.crm.editOwn',
        'adSales.crm.editAny',
      ),
      visibility = await this.authorization.scope(
        userId,
        'adSales.crm.viewOwn',
        'adSales.crm.viewAny',
      );
    const ownerId =
      'assignedMemberId' in ownership
        ? ownership.assignedMemberId
        : 'assignedMemberId' in visibility
          ? visibility.assignedMemberId
          : undefined;
    if (
      row.reviewStatus !== 'APPROVED' ||
      row.riskStatus === 'REJECTED' ||
      input.riskStatus === 'REJECTED'
    )
      throw new ConflictException('LEAD_APPROVAL_REQUIRED_BEFORE_CRM');
    const strong = contacts.filter(
      (contact) =>
        contact.confirmed &&
        ['ADVERTISER', 'SALES_CONTACT'].includes(contact.role) &&
        ['TELEGRAM', 'PUBLIC_BUSINESS_CONTACT', 'INSTAGRAM'].includes(
          contact.type,
        ),
    );
    if (!strong.length)
      throw new ConflictException('LEAD_CONFIRMED_IDENTITY_REQUIRED');
    const evidence = await tx.telegramLeadObservation.findMany({
      where: {
        workspaceId,
        candidateId: row.id,
        reviewStatus: { not: 'REJECTED' },
        originalStatus: 'OBSERVED',
        expiresAt: { gt: new Date() },
      },
      select: { text: true },
      orderBy: { observedAt: 'desc' },
      take: 20,
    });
    if (
      strong.some(
        (contact) =>
          !evidence.some((material) =>
            hasCurrentLeadContact(contact, material.text),
          ),
      )
    )
      throw new ConflictException('LEAD_CURRENT_LITERAL_EVIDENCE_REQUIRED');
    const methods = confirmedLeadMethods(strong);
    const username = methods.find(
        (method) => method.type === 'TELEGRAM_USERNAME',
      )?.value,
      email = methods.find((method) => method.type === 'EMAIL')?.value,
      phone = methods.find((method) => method.type === 'PHONE')?.value;
    const exact = confirmedLeadClientWhere(workspaceId, strong);
    const matches = await tx.telegramAdvertiser.findMany({
      where: { workspaceId, OR: exact },
      select: {
        id: true,
        ownerMemberId: true,
        manualSalesStatus: true,
        archivedAt: true,
      },
      take: 3,
    });
    let client =
      input.action === 'LINK'
        ? matches.find((client) => client.id === input.contactId)
        : matches.length === 1
          ? matches[0]
          : undefined;
    if ((input.action === 'LINK' && !client) || matches.length > 1)
      throw new ConflictException('LEAD_EXACT_CLIENT_MATCH_REQUIRED');
    if (
      client &&
      (client.archivedAt ||
        client.manualSalesStatus === 'DO_NOT_CONTACT' ||
        client.manualSalesStatus === 'CLOSED' ||
        (ownerId && client.ownerMemberId !== ownerId))
    )
      throw new ForbiddenException('LEAD_CLIENT_LINK_NOT_ALLOWED');
    if (!client)
      client = await tx.telegramAdvertiser.create({
        data: {
          workspaceId,
          displayName: (input.displayName?.trim() || row.title).slice(0, 300),
          telegramUsername: username,
          email,
          phone,
          ownerMemberId: ownerId ?? access.memberId,
          createdByUserId: userId,
          source: 'LEAD_DISCOVERY',
          contacts: {
            create: methods.map((method, index) => ({
              workspaceId,
              type: method.type,
              value:
                method.type === 'INSTAGRAM'
                  ? (strong.find(
                      (c) =>
                        c.type === 'INSTAGRAM' &&
                        instagramIdentity(c.value).username === method.value,
                    )?.evidence ?? method.value)
                  : method.value,
              normalizedValue: method.value,
              label: method.type,
              isPrimary: index === 0,
              ...(method.type === 'INSTAGRAM'
                ? {
                    ownershipConfirmedAt: new Date(),
                    ownershipConfirmedByUserId: userId,
                    isVerified: false,
                  }
                : {}),
            })),
          },
          stage: 'NEW',
        },
        select: {
          id: true,
          ownerMemberId: true,
          manualSalesStatus: true,
          archivedAt: true,
        },
      });
    // A reviewed LINK can add the public, confirmed Instagram identity to an existing Telegram client.
    if (input.action === 'LINK')
      for (const method of methods.filter((m) => m.type === 'INSTAGRAM')) {
        const existing = await tx.telegramAdvertiserContact.findFirst({
          where: {
            workspaceId,
            type: 'INSTAGRAM',
            normalizedValue: method.value,
          },
          select: {
            id: true,
            advertiserId: true,
            identityState: true,
            ownershipConfirmedAt: true,
          },
        });
        if (existing && existing.advertiserId !== client.id)
          throw new ConflictException('LEAD_EXACT_CLIENT_MATCH_REQUIRED');
        if (!existing)
          await tx.telegramAdvertiserContact.create({
            data: {
              workspaceId,
              advertiserId: client.id,
              type: 'INSTAGRAM',
              value:
                strong.find(
                  (c) =>
                    c.type === 'INSTAGRAM' &&
                    instagramIdentity(c.value).username === method.value,
                )?.evidence ?? method.value,
              normalizedValue: method.value,
              isVerified: false,
              ownershipConfirmedAt: new Date(),
              ownershipConfirmedByUserId: userId,
            },
          });
      }
    return client.id;
  }
}

import { instagramIdentity } from '../telegram-crm-instagram-identity.service';
import {
  leadEligiblePreparationSources,
  leadUnapprovedOwnSourceIds,
} from './lead-preparation-source-gates';
import { leadPreparationChannelFacts } from './lead-preparation-channel-facts';
import { hasCurrentLeadContact } from './lead-confirmed-identities';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  LeadContact,
  LeadClassification,
  CrmCopilotFact,
} from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmLegacyAuthorizationService } from '../telegram-crm-legacy-authorization.service';
import { TelegramCrmPackageSalesContextService } from '../telegram-crm-package-sales-context.service';
import { TelegramCrmPurchaseContextService } from '../telegram-crm-purchase-context.service';
import { copilotHash } from '../telegram-crm-copilot-context.service';
import { TelegramLeadPolicy } from './lead-policy.service';
import { parseLeadScorePolicy } from './lead-qualification-policy';
import { confirmedLeadClientWhere } from './lead-confirmed-identities';
@Injectable()
export class TelegramLeadPreparationContext {
  constructor(
    readonly prisma: PrismaService,
    readonly policy: TelegramLeadPolicy,
    private readonly config: ConfigService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly crm: TelegramCrmLegacyAuthorizationService,
    readonly packages: TelegramCrmPackageSalesContextService,
    private readonly purchases: TelegramCrmPurchaseContextService,
  ) {}
  enabled() {
    return (
      this.policy.enabled() &&
      this.config.get<string>('INTERNAL_LEAD_QUALIFICATION_ENABLED') === 'true'
    );
  }
  scorePolicy() {
    return parseLeadScorePolicy(
      this.config.get<unknown>('INTERNAL_LEAD_QUALIFICATION_POLICY'),
    );
  }
  async build(
    userId: string,
    id: string,
    productIds: string[] = [],
    execute = false,
  ) {
    if (
      !Array.isArray(productIds) ||
      productIds.length > 5 ||
      new Set(productIds).size !== productIds.length
    )
      throw new BadRequestException('LEAD_PRODUCT_LIMIT');
    if (execute) await this.policy.refresh(userId);
    const { workspaceId } = await this.policy.access(
      userId,
      execute ? 'analyze' : 'view',
    );
    const candidate = await this.prisma.telegramLeadCandidate.findFirst({
      where: { id, workspaceId },
      include: {
        observations: {
          where: {
            originalStatus: 'OBSERVED',
            reviewStatus: { not: 'REJECTED' },
            expiresAt: { gt: new Date() },
          },
          orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
          take: 5,
          include: { source: true },
        },
      },
    });
    if (!candidate) throw new NotFoundException('LEAD_CANDIDATE_NOT_FOUND');
    let blockedReason: string | null = this.enabled()
      ? null
      : 'LEAD_QUALIFICATION_DISABLED';
    if (
      candidate.reviewStatus === 'REJECTED' ||
      candidate.riskStatus === 'REJECTED' ||
      candidate.reviewStatus === 'MERGED' ||
      candidate.expiresAt <= new Date()
    )
      blockedReason = 'LEAD_CANDIDATE_NOT_ELIGIBLE';
    let remaining = 10000;
    const observations = candidate.observations
      .filter((row) => {
        try {
          this.policy.assertProcessing(row.source, 'ai', false);
          return true;
        } catch {
          blockedReason = 'LEAD_PROCESSING_NOT_APPROVED';
          return false;
        }
      })
      .map((row) => {
        const text = row.text.slice(0, Math.min(2000, remaining));
        remaining -= text.length;
        return { ...row, text };
      })
      .filter((row) => row.text.length > 0);
    if (!observations.length)
      blockedReason ??= 'LEAD_CURRENT_EVIDENCE_REQUIRED';
    const contacts = (candidate.contacts as unknown as LeadContact[])
      .filter(
        (contact) =>
          contact.confirmed &&
          ['ADVERTISER', 'SALES_CONTACT'].includes(contact.role) &&
          ['TELEGRAM', 'PUBLIC_BUSINESS_CONTACT', 'INSTAGRAM'].includes(
            contact.type,
          ) &&
          observations.some((row) => hasCurrentLeadContact(contact, row.text)),
      )
      .slice(0, 12);
    if (!contacts.length)
      blockedReason ??= 'LEAD_CONFIRMED_LITERAL_CONTACT_REQUIRED';
    if (
      !observations.some(
        (row) =>
          (row.classification as unknown as LeadClassification | null)
            ?.classification === 'ADVERTISEMENT' ||
          (row.classification as unknown as LeadClassification | null)
            ?.commercialIntent,
      )
    )
      blockedReason ??= 'LEAD_CLASSIFICATION_REQUIRED';
    const clientWhere = confirmedLeadClientWhere(workspaceId, contacts);
    const identities =
      clientWhere.length || candidate.contactId
        ? await this.prisma.telegramAdvertiser.findMany({
            where: {
              workspaceId,
              OR: [
                ...(candidate.contactId ? [{ id: candidate.contactId }] : []),
                ...clientWhere,
              ],
            },
            select: {
              id: true,
              ownerMemberId: true,
              manualSalesStatus: true,
              archivedAt: true,
              contacts: {
                where: { type: 'INSTAGRAM' },
                take: 20,
                select: {
                  normalizedValue: true,
                  identityState: true,
                  ownershipConfirmedAt: true,
                },
              },
            },
            take: 3,
          })
        : [];
    if (
      identities.length > 1 ||
      (candidate.contactId &&
        !identities.some((client) => client.id === candidate.contactId))
    )
      blockedReason = 'LEAD_IDENTITY_REVIEW_REQUIRED';
    if (
      identities.some(
        (client) =>
          client.manualSalesStatus === 'DO_NOT_CONTACT' ||
          client.manualSalesStatus === 'CLOSED' ||
          client.archivedAt,
      )
    )
      blockedReason = 'LEAD_CLIENT_NOT_CONTACTABLE';
    const instagramContacts = contacts.filter((c) => c.type === 'INSTAGRAM');
    if (
      candidate.contactId &&
      instagramContacts.length &&
      !instagramContacts.some((c) =>
        identities.some(
          (client) =>
            client.id === candidate.contactId &&
            client.contacts.some(
              (method) =>
                method.identityState === 'ACTIVE' &&
                method.ownershipConfirmedAt &&
                method.normalizedValue === instagramIdentity(c.value).username,
            ),
        ),
      )
    )
      blockedReason = 'LEAD_IDENTITY_REVIEW_REQUIRED';
    if (identities.length && !candidate.contactId) {
      try {
        const scope = await this.authorization.scope(
          userId,
          'adSales.crm.viewOwn',
          'adSales.crm.viewAny',
        );
        if (
          'assignedMemberId' in scope &&
          identities.some(
            (client) => client.ownerMemberId !== scope.assignedMemberId,
          )
        )
          blockedReason = 'LEAD_IDENTITY_REVIEW_REQUIRED';
      } catch {
        blockedReason = 'LEAD_IDENTITY_REVIEW_REQUIRED';
      }
    }
    const own = await leadUnapprovedOwnSourceIds(
      this.prisma,
      workspaceId,
      observations.map((row) => row.source),
    );
    if (own.size) blockedReason = 'LEAD_OWN_CHANNEL_NOT_APPROVED';
    // Do not disclose another owner's sales history merely because its public identity matched.
    if (candidate.contactId)
      await this.crm.requireReadContact(userId, candidate.contactId);
    const products = productIds.length
      ? await this.packages.forCopilot(userId, [...productIds].sort())
      : [];
    if (products.length !== productIds.length)
      blockedReason ??= 'LEAD_PRODUCT_UNAVAILABLE';
    const channelFacts = await leadPreparationChannelFacts(
      this.prisma,
      workspaceId,
      products,
    );
    const receipts = candidate.contactId
      ? await this.purchases.forCopilot(userId, candidate.contactId)
      : [];
    const facts: CrmCopilotFact[] = [
      ...channelFacts.facts,
      ...observations.map((row) => ({
        id: `evidence:${row.id}`,
        kind: 'MESSAGE' as const,
        text: JSON.stringify({
          id: row.id,
          text: row.text,
          classification: row.classification,
          source: row.source.title,
        }),
      })),
      ...contacts.map((contact, index) => ({
        id: `contact:${index}`,
        kind: 'CLIENT' as const,
        text: JSON.stringify({
          type: contact.type,
          value: contact.value,
          role: contact.role,
        }),
      })),
      ...products.map((product) => ({
        id: `product:${product.id}`,
        kind: 'PRODUCT' as const,
        text: JSON.stringify(product),
      })),
      ...receipts.map((receipt) => ({
        id: `purchase:${receipt.id}`,
        kind: 'PURCHASE' as const,
        text: JSON.stringify(receipt),
      })),
    ];
    const policy = this.scorePolicy();
    const identity = {
      id: candidate.id,
      title: candidate.title,
      niche: candidate.niche,
      offerType: candidate.offerType,
      contacts: candidate.contacts,
      reviewStatus: candidate.reviewStatus,
      riskStatus: candidate.riskStatus,
      contactId: candidate.contactId,
      identities,
    };
    const freshness = observations.some(
      (row) =>
        (row.editedAt ?? row.publishedAt).getTime() >
        Date.now() - 30 * 86400000,
    );
    const contextVersion = copilotHash({
      freshness,
      version: 'lead-qualification-context-v1',
      policy,
      identity,
      observations: observations.map((row) => ({
        id: row.id,
        hash: row.contentHash,
        classificationVersion: row.classificationVersion,
        classification: row.classification,
        extractionVersion: row.extractionVersion,
        source: {
          title: row.source.title,
          id: row.sourceId,
          reference: row.source.processingReference,
          accountId: row.source.accountId,
          channelId: row.source.channelId,
          status: row.source.monitoringState,
          own: row.source.allowOwnChannel,
        },
      })),
      products,
      channels: channelFacts.channels,
      receipts,
    });
    const missingFacts = [
      ...(!products.length
        ? ['CURRENT_PACKAGE_QUOTE_AND_AUDIENCE_NOT_VERIFIED']
        : []),
      ...(!candidate.contactId ? ['CRM_HISTORY_NOT_LINKED'] : []),
    ];
    const warnings = [
      'MANAGER_APPROVAL_REQUIRED',
      'PACKAGE_QUOTE_REQUIRES_MANAGER',
    ];
    return {
      workspaceId,
      candidate,
      observations,
      contacts,
      products,
      channelFacts,
      facts,
      contextVersion,
      missingFacts,
      warnings,
      blockedReason,
      policy,
      scoreFacts: {
        verifiedProducts: products.length > 0 && channelFacts.verifiedThemes,
        confirmedContact: contacts.length > 0,
        commercialOffer: observations.some(
          (row) =>
            (row.classification as unknown as LeadClassification | null)
              ?.commercialIntent,
        ),
        fresh: freshness,
        repeatedEvidence:
          observations.filter(
            (row) =>
              (row.classification as unknown as LeadClassification | null)
                ?.classification === 'ADVERTISEMENT',
          ).length > 1,
      },
      canGenerate: !blockedReason,
    };
  }
  assert(
    context: Awaited<ReturnType<TelegramLeadPreparationContext['build']>>,
  ) {
    if (context.blockedReason)
      throw new ForbiddenException(context.blockedReason);
  }
  eligibleSources(workspaceId: string) {
    return leadEligiblePreparationSources(
      this.prisma,
      this.policy,
      workspaceId,
    );
  }

  async canReview(userId: string) {
    const config = await this.policy.configuration(userId);
    return config.canReview;
  }
}
export type LeadPreparationContext = Awaited<
  ReturnType<TelegramLeadPreparationContext['build']>
>;

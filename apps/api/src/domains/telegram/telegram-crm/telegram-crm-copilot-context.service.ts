import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type {
  CrmCopilotContextView,
  CrmCopilotFact,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { copilotProcessingReference } from './telegram-crm-copilot-processing-policy';
import { TelegramCrmMessageReadService } from './telegram-crm-message-read.service';
import { TelegramCrmSalesWorkflowService } from './telegram-crm-sales-workflow.service';
import { TelegramCrmPackageSalesContextService } from './telegram-crm-package-sales-context.service';
import { TelegramCrmPurchaseContextService } from './telegram-crm-purchase-context.service';
import {
  workspaceCatalogFacts,
  workspaceContextProducts,
  type CopilotPreset,
} from './telegram-crm-copilot-workspace-context';

export const copilotHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bounded = (value: string | null | undefined, length = 500) => {
  let result = '';
  for (const character of (value ?? '').slice(0, length)) {
    if (Buffer.byteLength(result + character, 'utf8') > length) break;
    result += character;
  }
  return result;
};
export type CopilotContext = CrmCopilotContextView & {
  workspaceId: string;
  identityVersion: string;
  followUpAllowed: boolean;
};

@Injectable()
export class TelegramCrmCopilotContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly config: ConfigService,
    private readonly workflow: TelegramCrmSalesWorkflowService,
    private readonly packages: TelegramCrmPackageSalesContextService,
    private readonly purchases: TelegramCrmPurchaseContextService,
    private readonly messages: TelegramCrmMessageReadService,
  ) {}
  async refreshAccess(userId: string) {
    await this.authorization.refresh(userId);
  }

  processingEnabled() {
    return (
      this.config.get<string>('INTERNAL_AI_SALES_PROCESSING_ENABLED') === 'true'
    );
  }
  async access(userId: string, conversationId: string) {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const scope = await this.authorization.scope(
      userId,
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    const row = await this.prisma.telegramCrmConversation.findFirst({
      where: {
        id: conversationId,
        workspaceId: access.workspaceId,
        ...('assignedMemberId' in scope
          ? { contact: { ownerMemberId: scope.assignedMemberId } }
          : {}),
      },
      select: {
        id: true,
        workspaceId: true,
        contactId: true,
        mtprotoAccountId: true,
        telegramCrmPeerId: true,
        state: true,
        contact: {
          select: {
            id: true,
            displayName: true,
            companyName: true,
            description: true,
            source: true,
            manualSalesStatus: true,
            ownerMemberId: true,
            archivedAt: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException('CRM conversation not found');
    return row;
  }
  async suggestionOptions(userId: string, conversationId: string) {
    const row = await this.access(userId, conversationId);
    const grants = this.config.get<unknown>(
      'INTERNAL_AI_SALES_PROCESSING_GRANTS',
    );
    const withNotes = this.processingEnabled()
      ? copilotProcessingReference(grants, row.workspaceId, row.contactId, true)
      : null;
    return {
      includeNotes: withNotes !== null,
      processingReference:
        withNotes ??
        (this.processingEnabled()
          ? copilotProcessingReference(
              grants,
              row.workspaceId,
              row.contactId,
              false,
            )
          : null) ??
        '',
    };
  }
  async build(
    userId: string,
    conversationId: string,
    options: {
      productIds: string[];
      includeNotes: boolean;
      processingReference?: string;
    } & CopilotPreset,
  ): Promise<CopilotContext> {
    if (
      options.productIds.length > 5 ||
      new Set(options.productIds).size !== options.productIds.length
    )
      throw new BadRequestException('COPILOT_PRODUCTS_LIMIT');
    const row = await this.access(userId, conversationId);
    const processingReference = this.processingEnabled()
      ? copilotProcessingReference(
          this.config.get<unknown>('INTERNAL_AI_SALES_PROCESSING_GRANTS'),
          row.workspaceId,
          row.contactId,
          options.includeNotes,
          options.processingReference,
        )
      : null;
    const processingEnabled = processingReference !== null;
    const workflow = await this.workflow.read(userId, conversationId);
    const mayExecute = await this.authorization.can(
      userId,
      'operations.executeAi',
    );
    const blockedReason = !processingEnabled
      ? 'PROCESSING_POLICY_DISABLED'
      : !mayExecute
        ? 'AI_PERMISSION_REQUIRED'
        : workflow.outreachBlockedReason;
    const facts: CrmCopilotFact[] = [];
    const missingFacts: string[] = [],
      warnings = [
        'SOURCE_ATTESTATION_REQUIRED',
        'MANAGER_APPROVAL_REQUIRED',
        'STATISTICS_AND_AVAILABILITY_NOT_VERIFIED',
      ];
    const add = (id: string, kind: CrmCopilotFact['kind'], text: string) =>
      facts.push({ id, kind, text });
    const identityVersion = copilotHash([
      row.contactId,
      row.mtprotoAccountId,
      row.telegramCrmPeerId,
      row.contact?.ownerMemberId,
      row.state,
      row.contact?.archivedAt,
      row.contact?.manualSalesStatus,
    ]);
    if (row.contact)
      add(
        `client:${row.contact.id}`,
        'CLIENT',
        JSON.stringify({
          name: bounded(row.contact.displayName, 200),
          company: bounded(row.contact.companyName, 200),
          description: bounded(row.contact.description),
          source: bounded(row.contact.source, 200),
        }),
      );
    add(
      'workflow:current',
      'WORKFLOW',
      JSON.stringify({
        state: workflow.conversationState,
        status: workflow.manualStatus,
        nextFollowUp: workflow.nextFollowUp
          ? {
              id: workflow.nextFollowUp.id,
              status: workflow.nextFollowUp.status,
              dueAt: workflow.nextFollowUp.effectiveAt,
            }
          : null,
      }),
    );
    // Blocked contexts never load the sensitive history/catalog/notes subtree.
    const canLoad = !blockedReason && Boolean(row.contactId);
    const [messages, catalog, purchases, notes, feedback] = canLoad
      ? await Promise.all([
          this.messages.forCopilot(userId, conversationId),
          options.preset === 'WORKSPACE_NEXT_MESSAGE'
            ? this.packages.forWorkspaceCopilot(userId)
            : options.productIds.length
              ? this.packages
                  .forCopilot(userId, options.productIds)
                  .then((products) => ({
                    products,
                    networks: [],
                    truncated: false,
                  }))
              : Promise.resolve({
                  products: [],
                  networks: [],
                  truncated: false,
                }),
          row.contactId &&
          (await this.authorization.can(userId, 'adSales.sales.view'))
            ? this.purchases.forCopilot(userId, row.contactId)
            : Promise.resolve([]),
          options.includeNotes && row.contactId
            ? this.prisma.telegramAdvertiserActivity.findMany({
                where: {
                  workspaceId: row.workspaceId,
                  advertiserId: row.contactId,
                  type: 'NOTE_ADDED',
                },
                select: {
                  id: true,
                  title: true,
                  description: true,
                  occurredAt: true,
                },
                orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
                take: 3,
              })
            : Promise.resolve([]),
          options.preset === 'WORKSPACE_NEXT_MESSAGE' && options.feedbackBefore
            ? this.prisma.telegramCrmAiDraft.findMany({
                where: {
                  workspaceId: row.workspaceId,
                  conversationId,
                  authorUserId: userId,
                  status: { in: ['APPROVED', 'SENT', 'DISCARDED'] },
                  text: { not: '' },
                  createdAt: { lt: new Date(options.feedbackBefore) },
                  expiresAt: { gt: new Date() },
                },
                select: { id: true, text: true, status: true, revision: true },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: 3,
              })
            : Promise.resolve([]),
        ])
      : [[], { products: [], networks: [], truncated: false }, [], [], []];
    const products = options.preset
      ? workspaceContextProducts(catalog.products)
      : catalog.products;
    for (const message of messages.slice().reverse())
      add(
        `message:${message.id}`,
        'MESSAGE',
        JSON.stringify({
          direction: message.direction,
          text: bounded(message.text, 350),
          sentAt: message.sentAt.toISOString(),
          editedAt: message.editedAt?.toISOString() ?? null,
        }),
      );
    for (const purchase of purchases)
      add(
        `purchase:${purchase.id}`,
        'PURCHASE',
        JSON.stringify({
          title: bounded(purchase.title, 150),
          status: purchase.status,
          date: purchase.createdAt.toISOString(),
          currency: purchase.settlementCurrency,
        }),
      );
    if (options.preset === 'WORKSPACE_NEXT_MESSAGE')
      facts.push(...workspaceCatalogFacts(catalog));
    else
      for (const product of products)
        add(`product:${product.id}`, 'PRODUCT', JSON.stringify(product));
    for (const item of feedback)
      add(
        `feedback:${item.id}:${item.revision}`,
        'NOTE',
        JSON.stringify({
          purpose: 'STYLE_FEEDBACK_ONLY_NOT_CUSTOMER_FACTS',
          outcome:
            item.status === 'DISCARDED'
              ? 'AVOID_THIS_REPLY'
              : 'MANAGER_ACCEPTED_REPLY',
          text: bounded(item.text, 500),
        }),
      );
    if (catalog.truncated) warnings.push('WORKSPACE_CATALOG_TRUNCATED');
    for (const note of notes)
      add(
        `note:${note.id}`,
        'NOTE',
        JSON.stringify({
          title: bounded(note.title, 100),
          text: bounded(note.description, 300),
          occurredAt: note.occurredAt.toISOString(),
        }),
      );
    if (!messages.length) missingFacts.push('MESSAGE_HISTORY_UNAVAILABLE');
    if (!products.length)
      missingFacts.push(
        options.preset
          ? 'NO_VERIFIED_WORKSPACE_PRODUCTS'
          : 'NO_SELECTED_VERIFIED_PRODUCTS',
      );
    if (products.some((product) => product.quoteRequired))
      missingFacts.push('PACKAGE_PRICE_REQUIRES_MANAGER_QUOTE');
    if (!options.preset && products.length !== options.productIds.length)
      warnings.push('SELECTED_PRODUCT_UNAVAILABLE');
    const recentRefusal = messages.some(
      (message) =>
        message.direction === 'INBOUND' &&
        /не\s*(?:цікав|интерес|пиш|потріб|нуж)|відмов|отказ|stop|not interested|do not contact/i.test(
          message.text ?? '',
        ),
    );
    const followUpAllowed =
      workflow.commercialOutreachAllowed &&
      Boolean(workflow.nextFollowUp) &&
      !recentRefusal;
    if (recentRefusal) warnings.push('RECENT_REFUSAL');
    const contextVersion = copilotHash({
      identityVersion,
      facts,
      products,
      networks: catalog.networks,
      followUpAllowed,
    });
    const result = {
      conversationId,
      contactId: row.contactId,
      contactName: bounded(row.contact?.displayName, 200),
      processingEnabled,
      processingReference,
      canGenerate: !blockedReason,
      blockedReason,
      facts,
      missingFacts,
      warnings,
      contextVersion,
      products,
      workspaceId: row.workspaceId,
      identityVersion,
      followUpAllowed,
    };
    if (
      Buffer.byteLength(JSON.stringify(result), 'utf8') >
        (options.preset ? 128 : 24) * 1024 ||
      Buffer.byteLength(JSON.stringify(facts), 'utf8') > 32 * 1024
    )
      throw new BadRequestException('COPILOT_CONTEXT_LIMIT');
    return result;
  }
}

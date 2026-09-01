import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CrmAutomationLocale,
  CrmAutomationStatusResponse,
  CrmCustomerAutomationType,
  CrmDealAutomationStatus,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmAutomationPolicyService } from './telegram-crm-automation-policy.service';
import { CrmAutomationStatusQueryDto } from './telegram-crm.dto';

const statusSelect = {
  id: true,
  workspaceId: true,
  ownerMemberId: true,
  automatedMessagesEnabled: true,
  automatedMessagesEnabledAt: true,
  automationLocale: true,
  prePublicationAutomationOverride: true,
  prePublicationAutomationEnabledAt: true,
  publishedLinksAutomationOverride: true,
  publishedLinksAutomationEnabledAt: true,
  followUpAutomationOverride: true,
  followUpAutomationEnabledAt: true,
  crmPeers: { select: { id: true, telegramUserId: true }, take: 1 },
  crmConversations: {
    where: { state: 'ACTIVE' as const },
    orderBy: [
      { lastMessageAt: { sort: 'desc' as const, nulls: 'last' as const } },
      { createdAt: 'asc' as const },
      { id: 'asc' as const },
    ],
    select: {
      id: true,
      mtprotoAccountId: true,
      mtprotoAccount: {
        select: {
          crmSendEnabled: true,
          isActive: true,
          status: true,
          sessionEncrypted: true,
          sessionIv: true,
          sessionAuthTag: true,
        },
      },
    },
    take: 1,
  },
  sales: {
    orderBy: [{ createdAt: 'desc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      workspaceId: true,
      advertiserId: true,
      customerAutomationOverride: true,
      customerAutomationEligibleAt: true,
      prePublicationAutomationOverride: true,
      prePublicationAutomationEnabledAt: true,
      publishedLinksAutomationOverride: true,
      publishedLinksAutomationEnabledAt: true,
      followUpAutomationOverride: true,
      followUpAutomationEnabledAt: true,
      crmConversationId: true,
      crmConversation: {
        select: {
          id: true,
          contactId: true,
          state: true,
          mtprotoAccountId: true,
          mtprotoAccount: {
            select: {
              crmSendEnabled: true,
              isActive: true,
              status: true,
              sessionEncrypted: true,
              sessionIv: true,
              sessionAuthTag: true,
            },
          },
        },
      },
      customerFollowUpAt: true,
      customerFollowUpVersion: true,
      customerAutomationExecutions: {
        orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
        take: 10,
        select: {
          id: true,
          automationType: true,
          status: true,
          eventOccurredAt: true,
          dueAt: true,
          attempts: true,
          maxAttempts: true,
          templateKey: true,
          locale: true,
          reason: true,
          lastError: true,
          completedAt: true,
          createdAt: true,
        },
      },
    },
  },
  workspace: {
    select: {
      telegramAdCrmWorkspaceSettings: {
        select: {
          defaultCrmSenderAccountId: true,
          customerTelegramAutomationsEnabled: true,
          customerTelegramAutomationsEnabledAt: true,
          automationLocale: true,
          prePublicationReminderEnabled: true,
          prePublicationReminderEnabledAt: true,
          publishedLinksEnabled: true,
          publishedLinksEnabledAt: true,
          followUpEnabled: true,
          followUpEnabledAt: true,
          defaultCrmSenderAccount: {
            select: {
              crmSendEnabled: true,
              isActive: true,
              status: true,
              sessionEncrypted: true,
              sessionIv: true,
              sessionAuthTag: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.TelegramAdvertiserSelect;

type StatusRow = Prisma.TelegramAdvertiserGetPayload<{
  select: typeof statusSelect;
}>;
type DealRow = StatusRow['sales'][number];

@Injectable()
export class TelegramCrmAutomationStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly policy: TelegramCrmAutomationPolicyService,
  ) {}

  async get(
    userId: string,
    query: CrmAutomationStatusQueryDto,
  ): Promise<CrmAutomationStatusResponse> {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const contact = await this.prisma.telegramAdvertiser.findFirst({
      where: { id: query.contactId, workspaceId: access.workspaceId },
      select: {
        ...statusSelect,
        sales: {
          ...statusSelect.sales,
          where: query.dealId ? { id: query.dealId } : undefined,
          take: query.dealId ? 1 : Math.max(1, Math.min(50, query.limit ?? 20)),
        },
      },
    });
    if (!contact) throw new NotFoundException('CRM Contact not found');
    await this.authorization.requireOwnOrAny(
      userId,
      { assignedMemberId: contact.ownerMemberId },
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    if (query.dealId && !contact.sales.length) {
      throw new NotFoundException('CRM Deal not found');
    }
    const settings = contact.workspace.telegramAdCrmWorkspaceSettings;
    return {
      workspace: this.workspace(settings),
      contact: {
        contactId: contact.id,
        enabled: contact.automatedMessagesEnabled,
        enabledAt: contact.automatedMessagesEnabledAt?.toISOString() ?? null,
        locale: this.localeOrNull(contact.automationLocale),
        typeOverrides: {
          PRE_PUBLICATION_REMINDER: {
            override: contact.prePublicationAutomationOverride,
            enabledAt:
              contact.prePublicationAutomationEnabledAt?.toISOString() ?? null,
          },
          PUBLISHED_LINKS: {
            override: contact.publishedLinksAutomationOverride,
            enabledAt:
              contact.publishedLinksAutomationEnabledAt?.toISOString() ?? null,
          },
          FOLLOW_UP: {
            override: contact.followUpAutomationOverride,
            enabledAt:
              contact.followUpAutomationEnabledAt?.toISOString() ?? null,
          },
        },
      },
      deals: contact.sales.map((deal) => this.deal(contact, deal)),
    };
  }

  private deal(contact: StatusRow, deal: DealRow): CrmDealAutomationStatus {
    const evaluated = {} as CrmDealAutomationStatus['evaluated'];
    for (const type of [
      'PRE_PUBLICATION_REMINDER',
      'PUBLISHED_LINKS',
      'FOLLOW_UP',
    ] as const) {
      evaluated[type] = this.evaluate(contact, deal, type);
    }
    return {
      dealId: deal.id,
      override: deal.customerAutomationOverride,
      eligibleAt: deal.customerAutomationEligibleAt?.toISOString() ?? null,
      conversationId: deal.crmConversationId,
      typeOverrides: {
        PRE_PUBLICATION_REMINDER: this.serializedDealType(
          deal,
          'PRE_PUBLICATION_REMINDER',
        ),
        PUBLISHED_LINKS: this.serializedDealType(deal, 'PUBLISHED_LINKS'),
        FOLLOW_UP: this.serializedDealType(deal, 'FOLLOW_UP'),
      },
      customerFollowUp: deal.customerFollowUpAt
        ? {
            dueAt: deal.customerFollowUpAt.toISOString(),
            version: deal.customerFollowUpVersion,
          }
        : null,
      latestExecutions: deal.customerAutomationExecutions.map((execution) => ({
        id: execution.id,
        automationType: execution.automationType,
        status: execution.status,
        eventOccurredAt: execution.eventOccurredAt.toISOString(),
        dueAt: execution.dueAt?.toISOString() ?? null,
        attempts: execution.attempts,
        maxAttempts: execution.maxAttempts,
        templateKey: execution.templateKey,
        locale: this.localeOrNull(execution.locale),
        reason: execution.reason,
        lastError: execution.lastError,
        completedAt: execution.completedAt?.toISOString() ?? null,
        createdAt: execution.createdAt.toISOString(),
      })),
      evaluated,
    };
  }

  private evaluate(
    contact: StatusRow,
    deal: DealRow,
    type: CrmCustomerAutomationType,
  ) {
    const settings = contact.workspace.telegramAdCrmWorkspaceSettings;
    const workspaceType = this.workspaceType(settings, type);
    const contactType = this.contactType(contact, type);
    const dealType = this.dealType(deal, type);
    const explicit =
      deal.crmConversation?.state === 'ACTIVE' &&
      deal.crmConversation.contactId === contact.id
        ? deal.crmConversation
        : undefined;
    const selected = deal.crmConversationId
      ? explicit
      : contact.crmConversations[0];
    const defaultAccount = settings?.defaultCrmSenderAccount;
    const canCreate =
      !deal.crmConversationId &&
      !selected &&
      Boolean(
        /^\d+$/.test(contact.crmPeers[0]?.telegramUserId ?? '') &&
        this.usable(defaultAccount),
      );
    return this.policy.evaluate({
      workspaceId: contact.workspaceId,
      automationType: type,
      workspace: {
        id: contact.workspaceId,
        enabled: settings?.customerTelegramAutomationsEnabled ?? false,
        enabledAt: settings?.customerTelegramAutomationsEnabledAt ?? null,
        typeEnabled: this.workspaceRecord(settings, 'enabled'),
        typeEnabledAt: this.workspaceRecord(settings, 'enabledAt'),
      },
      contact: {
        id: contact.id,
        workspaceId: contact.workspaceId,
        automatedMessagesEnabled: contact.automatedMessagesEnabled,
        automatedMessagesEnabledAt: contact.automatedMessagesEnabledAt,
        typeOverride: contactType.override,
        typeEnabledAt: contactType.enabledAt,
      },
      deal: {
        workspaceId: deal.workspaceId,
        contactId: deal.advertiserId,
        automationOverride: deal.customerAutomationOverride,
        automationEligibleAt: deal.customerAutomationEligibleAt,
        typeOverride: dealType.override,
        typeEnabledAt: dealType.enabledAt,
      },
      eventOccurredAt: new Date(),
      historical: false,
      idempotencyKey: `status:${deal.id}:${type}`,
      idempotencyConfirmed: true,
      conversationValid: Boolean(selected || canCreate),
      accountCrmSendEnabled: selected
        ? this.usable(selected.mtprotoAccount)
        : canCreate,
      templateAvailable: workspaceType.enabled,
    });
  }

  private workspace(
    settings: StatusRow['workspace']['telegramAdCrmWorkspaceSettings'],
  ) {
    return {
      customerTelegramAutomationsEnabled:
        settings?.customerTelegramAutomationsEnabled ?? false,
      customerTelegramAutomationsEnabledAt:
        settings?.customerTelegramAutomationsEnabledAt?.toISOString() ?? null,
      locale: this.localeOrNull(settings?.automationLocale) ?? 'en',
      typeEnabled: this.workspaceRecord(settings, 'enabled'),
      typeSettings: {
        PRE_PUBLICATION_REMINDER: this.serializedWorkspaceType(
          settings,
          'PRE_PUBLICATION_REMINDER',
        ),
        PUBLISHED_LINKS: this.serializedWorkspaceType(
          settings,
          'PUBLISHED_LINKS',
        ),
        FOLLOW_UP: this.serializedWorkspaceType(settings, 'FOLLOW_UP'),
      },
    };
  }

  private workspaceType(
    settings: StatusRow['workspace']['telegramAdCrmWorkspaceSettings'],
    type: CrmCustomerAutomationType,
  ) {
    return type === 'PRE_PUBLICATION_REMINDER'
      ? {
          enabled: settings?.prePublicationReminderEnabled ?? false,
          enabledAt: settings?.prePublicationReminderEnabledAt ?? null,
        }
      : type === 'PUBLISHED_LINKS'
        ? {
            enabled: settings?.publishedLinksEnabled ?? false,
            enabledAt: settings?.publishedLinksEnabledAt ?? null,
          }
        : {
            enabled: settings?.followUpEnabled ?? false,
            enabledAt: settings?.followUpEnabledAt ?? null,
          };
  }

  private serializedWorkspaceType(
    settings: StatusRow['workspace']['telegramAdCrmWorkspaceSettings'],
    type: CrmCustomerAutomationType,
  ) {
    const result = this.workspaceType(settings, type);
    return { ...result, enabledAt: result.enabledAt?.toISOString() ?? null };
  }

  private workspaceRecord(
    settings: StatusRow['workspace']['telegramAdCrmWorkspaceSettings'],
    field: 'enabled' | 'enabledAt',
  ) {
    return Object.fromEntries(
      (
        ['PRE_PUBLICATION_REMINDER', 'PUBLISHED_LINKS', 'FOLLOW_UP'] as const
      ).map((type) => [type, this.workspaceType(settings, type)[field]]),
    ) as never;
  }

  private contactType(contact: StatusRow, type: CrmCustomerAutomationType) {
    if (type === 'PRE_PUBLICATION_REMINDER')
      return {
        override: contact.prePublicationAutomationOverride,
        enabledAt: contact.prePublicationAutomationEnabledAt,
      };
    if (type === 'PUBLISHED_LINKS')
      return {
        override: contact.publishedLinksAutomationOverride,
        enabledAt: contact.publishedLinksAutomationEnabledAt,
      };
    return {
      override: contact.followUpAutomationOverride,
      enabledAt: contact.followUpAutomationEnabledAt,
    };
  }

  private dealType(deal: DealRow, type: CrmCustomerAutomationType) {
    return type === 'PRE_PUBLICATION_REMINDER'
      ? {
          override: deal.prePublicationAutomationOverride,
          enabledAt: deal.prePublicationAutomationEnabledAt,
        }
      : type === 'PUBLISHED_LINKS'
        ? {
            override: deal.publishedLinksAutomationOverride,
            enabledAt: deal.publishedLinksAutomationEnabledAt,
          }
        : {
            override: deal.followUpAutomationOverride,
            enabledAt: deal.followUpAutomationEnabledAt,
          };
  }

  private serializedDealType(deal: DealRow, type: CrmCustomerAutomationType) {
    const result = this.dealType(deal, type);
    return { ...result, enabledAt: result.enabledAt?.toISOString() ?? null };
  }

  private usable(
    account:
      | {
          crmSendEnabled: boolean;
          isActive: boolean;
          status: string;
          sessionEncrypted: string | null;
          sessionIv: string | null;
          sessionAuthTag: string | null;
        }
      | null
      | undefined,
  ) {
    return Boolean(
      account?.crmSendEnabled &&
      account.isActive &&
      account.status === 'connected' &&
      account.sessionEncrypted &&
      account.sessionIv &&
      account.sessionAuthTag,
    );
  }

  private localeOrNull(
    value: string | null | undefined,
  ): CrmAutomationLocale | null {
    return value === 'en' || value === 'ru' || value === 'uk' ? value : null;
  }
}

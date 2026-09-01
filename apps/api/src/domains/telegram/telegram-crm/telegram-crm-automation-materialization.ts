import { TelegramAdPlacementStatus } from '@prisma/client';
import type {
  CrmAutomationLocale,
  CrmCustomerAutomationType,
} from '@telegram-system/shared';
import { TelegramCrmAutomationPolicyService } from './telegram-crm-automation-policy.service';
import type { CrmAutomationSaleRow as SaleRow } from './telegram-crm-automation-sale';
import {
  crmAutomationSourceFingerprint,
  crmPublishedPlacementSource,
} from './telegram-crm-automation-source';
import { renderCrmAutomationTemplate } from './telegram-crm-automation-templates';

const REMINDER_LEAD_MS = 60 * 60_000;

export type CrmAutomationOccurrenceParams = {
  sale: SaleRow;
  automationType: CrmCustomerAutomationType;
  eventKey: string;
  eventOccurredAt: Date;
  dueAt: Date;
  sourceVersion: string;
  placements?: Array<{
    channelTitle: string;
    scheduledAt: Date;
    timezone: string;
    url?: string | null;
  }>;
};

export function buildCrmPrePublicationOccurrence(
  sale: SaleRow,
  eventOccurredAt: Date,
): CrmAutomationOccurrenceParams | null {
  const placements = sale.placements.filter(
    (placement) =>
      placement.scheduledAt > eventOccurredAt &&
      !(
        [
          TelegramAdPlacementStatus.PUBLISHED,
          TelegramAdPlacementStatus.COMPLETED,
          TelegramAdPlacementStatus.CANCELLED,
          TelegramAdPlacementStatus.MISSED,
        ] as TelegramAdPlacementStatus[]
      ).includes(placement.status),
  );
  if (!sale.advertiser || !placements.length) return null;
  const earliest = placements[0].scheduledAt;
  return {
    sale,
    automationType: 'PRE_PUBLICATION_REMINDER',
    eventKey: `deal:${sale.id}:pre-publication`,
    eventOccurredAt,
    dueAt: new Date(
      Math.max(
        eventOccurredAt.getTime(),
        earliest.getTime() - REMINDER_LEAD_MS,
      ),
    ),
    sourceVersion: crmAutomationSourceFingerprint(
      placements.map((placement) => ({
        id: placement.id,
        status: placement.status,
        scheduledAt: placement.scheduledAt.toISOString(),
        timezone: placement.timezone,
        channelTitle: placement.telegramChannel.title,
      })),
    ),
    placements: placements.map((placement) => ({
      channelTitle: placement.telegramChannel.title,
      scheduledAt: placement.scheduledAt,
      timezone: placement.timezone,
    })),
  };
}

export function buildCrmPublishedLinksOccurrence(
  sale: SaleRow,
): CrmAutomationOccurrenceParams | null {
  const source = crmPublishedPlacementSource(sale);
  if (!sale.advertiser || !source) return null;
  return {
    sale,
    automationType: 'PUBLISHED_LINKS',
    eventKey: `deal:${sale.id}:published-links`,
    eventOccurredAt: source.eventOccurredAt,
    dueAt: source.eventOccurredAt,
    sourceVersion: source.sourceVersion,
    placements: source.placements,
  };
}

export function materializeCrmAutomationOccurrence(
  policy: TelegramCrmAutomationPolicyService,
  params: CrmAutomationOccurrenceParams,
) {
  const { sale } = params;
  if (!sale.advertiser) return null;
  const rendered = renderCrmAutomationTemplate({
    automationType: params.automationType,
    locale: automationLocale(
      sale.advertiser.automationLocale,
      sale.workspace.telegramAdCrmWorkspaceSettings?.automationLocale,
    ),
    contactName: sale.advertiser.displayName,
    dealTitle: sale.title || sale.advertiserName,
    placements: params.placements?.map((placement) => ({
      ...placement,
      url: placement.url ?? undefined,
    })),
  });
  const eligibility = evaluateOccurrence(
    policy,
    sale,
    params.automationType,
    params.eventOccurredAt,
    params.eventKey,
    Boolean(rendered),
  );
  if (!eligibility.allowed || !rendered) return null;
  return {
    workspaceId: sale.workspaceId,
    automationType: params.automationType,
    contactId: sale.advertiser.id,
    telegramAdSaleId: sale.id,
    eventKey: params.eventKey,
    eventOccurredAt: params.eventOccurredAt,
    dueAt: params.dueAt,
    nextAttemptAt: params.dueAt,
    renderedText: rendered.text,
    templateKey: rendered.templateKey,
    locale: rendered.locale,
    stableRandomId: null,
    sourceVersion: params.sourceVersion,
    historical: false,
    status: 'PENDING' as const,
    reason: null,
    lastError: null,
    completedAt: null,
    leaseOwner: null,
    leaseExpiresAt: null,
  };
}

function evaluateOccurrence(
  policy: TelegramCrmAutomationPolicyService,
  sale: SaleRow,
  automationType: CrmCustomerAutomationType,
  eventOccurredAt: Date,
  eventKey: string,
  templateAvailable: boolean,
) {
  const contact = sale.advertiser!;
  const settings = sale.workspace.telegramAdCrmWorkspaceSettings;
  const workspaceType = workspaceAutomationType(settings, automationType);
  const contactType = contactAutomationType(contact, automationType);
  const dealType = dealAutomationType(sale, automationType);
  return policy.evaluate({
    workspaceId: sale.workspaceId,
    automationType,
    workspace: {
      id: sale.workspaceId,
      enabled: settings?.customerTelegramAutomationsEnabled ?? false,
      enabledAt: settings?.customerTelegramAutomationsEnabledAt ?? null,
      typeEnabled: workspaceTypeRecord(settings, 'enabled'),
      typeEnabledAt: workspaceTypeRecord(settings, 'enabledAt'),
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
      workspaceId: sale.workspaceId,
      contactId: sale.advertiserId,
      automationOverride: sale.customerAutomationOverride,
      automationEligibleAt: sale.customerAutomationEligibleAt,
      typeOverride: dealType.override,
      typeEnabledAt: dealType.enabledAt,
    },
    eventOccurredAt,
    historical: false,
    idempotencyKey: eventKey,
    idempotencyConfirmed: true,
    conversationValid: true,
    accountCrmSendEnabled: true,
    templateAvailable: templateAvailable && workspaceType.enabled,
  });
}

function workspaceAutomationType(
  settings: SaleRow['workspace']['telegramAdCrmWorkspaceSettings'],
  type: CrmCustomerAutomationType,
) {
  if (type === 'PRE_PUBLICATION_REMINDER') {
    return {
      enabled: settings?.prePublicationReminderEnabled ?? false,
      enabledAt: settings?.prePublicationReminderEnabledAt ?? null,
    };
  }
  if (type === 'PUBLISHED_LINKS') {
    return {
      enabled: settings?.publishedLinksEnabled ?? false,
      enabledAt: settings?.publishedLinksEnabledAt ?? null,
    };
  }
  return {
    enabled: settings?.followUpEnabled ?? false,
    enabledAt: settings?.followUpEnabledAt ?? null,
  };
}

function contactAutomationType(
  contact: NonNullable<SaleRow['advertiser']>,
  type: CrmCustomerAutomationType,
) {
  if (type === 'PRE_PUBLICATION_REMINDER') {
    return {
      override: contact.prePublicationAutomationOverride,
      enabledAt: contact.prePublicationAutomationEnabledAt,
    };
  }
  if (type === 'PUBLISHED_LINKS') {
    return {
      override: contact.publishedLinksAutomationOverride,
      enabledAt: contact.publishedLinksAutomationEnabledAt,
    };
  }
  return {
    override: contact.followUpAutomationOverride,
    enabledAt: contact.followUpAutomationEnabledAt,
  };
}

function dealAutomationType(sale: SaleRow, type: CrmCustomerAutomationType) {
  if (type === 'PRE_PUBLICATION_REMINDER') {
    return {
      override: sale.prePublicationAutomationOverride,
      enabledAt: sale.prePublicationAutomationEnabledAt,
    };
  }
  if (type === 'PUBLISHED_LINKS') {
    return {
      override: sale.publishedLinksAutomationOverride,
      enabledAt: sale.publishedLinksAutomationEnabledAt,
    };
  }
  return {
    override: sale.followUpAutomationOverride,
    enabledAt: sale.followUpAutomationEnabledAt,
  };
}

function workspaceTypeRecord(
  settings: SaleRow['workspace']['telegramAdCrmWorkspaceSettings'],
  field: 'enabled' | 'enabledAt',
) {
  const result = {
    PRE_PUBLICATION_REMINDER: workspaceAutomationType(
      settings,
      'PRE_PUBLICATION_REMINDER',
    ),
    PUBLISHED_LINKS: workspaceAutomationType(settings, 'PUBLISHED_LINKS'),
    FOLLOW_UP: workspaceAutomationType(settings, 'FOLLOW_UP'),
  };
  return {
    PRE_PUBLICATION_REMINDER: result.PRE_PUBLICATION_REMINDER[field],
    PUBLISHED_LINKS: result.PUBLISHED_LINKS[field],
    FOLLOW_UP: result.FOLLOW_UP[field],
  } as never;
}

function automationLocale(
  contactLocale: string | null,
  workspaceLocale?: string | null,
): CrmAutomationLocale {
  const value = contactLocale || workspaceLocale || 'en';
  return value === 'ru' || value === 'uk' ? value : 'en';
}

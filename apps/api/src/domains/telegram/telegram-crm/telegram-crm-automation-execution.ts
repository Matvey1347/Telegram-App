import { Prisma } from '@prisma/client';

export const crmAutomationExecutionSelect = {
  id: true,
  workspaceId: true,
  automationType: true,
  contactId: true,
  telegramAdSaleId: true,
  eventKey: true,
  eventOccurredAt: true,
  historical: true,
  attempts: true,
  maxAttempts: true,
  renderedText: true,
  templateKey: true,
  locale: true,
  stableRandomId: true,
  sourceVersion: true,
  reason: true,
  conversationId: true,
  mtprotoAccountId: true,
  sale: {
    select: {
      status: true,
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
      customerFollowUpAt: true,
      customerFollowUpVersion: true,
      placements: {
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          timezone: true,
          publishedAt: true,
          telegramPost: { select: { telegramMessageId: true } },
          telegramChannel: {
            select: { title: true, username: true, telegramChatId: true },
          },
        },
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      },
    },
  },
  contact: {
    select: {
      id: true,
      workspaceId: true,
      automatedMessagesEnabled: true,
      automatedMessagesEnabledAt: true,
      prePublicationAutomationOverride: true,
      prePublicationAutomationEnabledAt: true,
      publishedLinksAutomationOverride: true,
      publishedLinksAutomationEnabledAt: true,
      followUpAutomationOverride: true,
      followUpAutomationEnabledAt: true,
      ownerMemberId: true,
    },
  },
  workspace: {
    select: {
      telegramAdCrmWorkspaceSettings: {
        select: {
          customerTelegramAutomationsEnabled: true,
          customerTelegramAutomationsEnabledAt: true,
          prePublicationReminderEnabled: true,
          prePublicationReminderEnabledAt: true,
          publishedLinksEnabled: true,
          publishedLinksEnabledAt: true,
          followUpEnabled: true,
          followUpEnabledAt: true,
        },
      },
    },
  },
} satisfies Prisma.TelegramCrmCustomerAutomationExecutionSelect;

export type CrmAutomationExecutionRow =
  Prisma.TelegramCrmCustomerAutomationExecutionGetPayload<{
    select: typeof crmAutomationExecutionSelect;
  }>;

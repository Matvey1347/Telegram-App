import { Prisma } from '@prisma/client';

export const crmAutomationSaleSelect = {
  id: true,
  workspaceId: true,
  advertiserId: true,
  title: true,
  advertiserName: true,
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
  advertiser: {
    select: {
      id: true,
      workspaceId: true,
      displayName: true,
      automationLocale: true,
      automatedMessagesEnabled: true,
      automatedMessagesEnabledAt: true,
      prePublicationAutomationOverride: true,
      prePublicationAutomationEnabledAt: true,
      publishedLinksAutomationOverride: true,
      publishedLinksAutomationEnabledAt: true,
      followUpAutomationOverride: true,
      followUpAutomationEnabledAt: true,
    },
  },
  workspace: {
    select: {
      telegramAdCrmWorkspaceSettings: {
        select: {
          customerTelegramAutomationsEnabled: true,
          customerTelegramAutomationsEnabledAt: true,
          automationLocale: true,
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
} satisfies Prisma.TelegramAdSaleSelect;

export type CrmAutomationSaleRow = Prisma.TelegramAdSaleGetPayload<{
  select: typeof crmAutomationSaleSelect;
}>;

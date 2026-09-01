import type { CrmAutomationStatusResponse } from "@telegram-system/shared";

const types = {
  PRE_PUBLICATION_REMINDER: false,
  PUBLISHED_LINKS: false,
  FOLLOW_UP: false,
};

const activations = {
  PRE_PUBLICATION_REMINDER: { enabled: false, enabledAt: null },
  PUBLISHED_LINKS: { enabled: false, enabledAt: null },
  FOLLOW_UP: { enabled: false, enabledAt: null },
};

const overrides = {
  PRE_PUBLICATION_REMINDER: { override: "INHERIT" as const, enabledAt: null },
  PUBLISHED_LINKS: { override: "INHERIT" as const, enabledAt: null },
  FOLLOW_UP: { override: "DISABLED" as const, enabledAt: null },
};

export function automationStatusFixture(): CrmAutomationStatusResponse {
  return {
    workspace: {
      customerTelegramAutomationsEnabled: false,
      customerTelegramAutomationsEnabledAt: null,
      locale: "en",
      typeEnabled: types,
      typeSettings: activations,
    },
    contact: {
      contactId: "contact-1",
      enabled: false,
      enabledAt: null,
      locale: "ru",
      typeOverrides: overrides,
    },
    deals: [
      {
        dealId: "deal-legacy-123456",
        override: "DISABLED",
        eligibleAt: null,
        conversationId: null,
        typeOverrides: overrides,
        customerFollowUp: null,
        evaluated: {
          PRE_PUBLICATION_REMINDER: {
            allowed: false,
            reason: "WORKSPACE_DISABLED",
          },
          PUBLISHED_LINKS: {
            allowed: false,
            reason: "DEAL_NOT_ELIGIBLE",
          },
          FOLLOW_UP: {
            allowed: false,
            reason: "CONTACT_TYPE_DISABLED",
          },
        },
        latestExecutions: [
          {
            id: "execution-1",
            automationType: "PUBLISHED_LINKS",
            status: "SENT",
            eventOccurredAt: "2026-09-01T09:00:00.000Z",
            dueAt: null,
            attempts: 1,
            maxAttempts: 3,
            templateKey: "crm.automation.publishedLinks.complete",
            locale: "ru",
            reason: null,
            lastError: null,
            completedAt: "2026-09-01T09:01:00.000Z",
            createdAt: "2026-09-01T09:00:00.000Z",
          },
          {
            id: "execution-2",
            automationType: "FOLLOW_UP",
            status: "SKIPPED",
            eventOccurredAt: "2026-09-01T10:00:00.000Z",
            dueAt: "2026-09-01T10:00:00.000Z",
            attempts: 0,
            maxAttempts: 3,
            templateKey: null,
            locale: null,
            reason: "CONTACT_TYPE_DISABLED",
            lastError: null,
            completedAt: "2026-09-01T10:00:01.000Z",
            createdAt: "2026-09-01T10:00:00.000Z",
          },
        ],
      },
    ],
  };
}

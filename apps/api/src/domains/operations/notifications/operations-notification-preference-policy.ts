import type { Prisma } from '@prisma/client';

/** Default-off incoming alerts do not inherit an older global Web Push opt-in. */
export function operationsNotificationPreferenceWhere(): Prisma.OperationsNotificationWhereInput {
  const noPreference = {
    recipient: { operationsNotificationPreference: { is: null } },
  };
  const master = {
    OR: [
      noPreference,
      {
        recipient: {
          operationsNotificationPreference: { crmNotificationsEnabled: true },
        },
      },
    ],
  };
  return {
    OR: [
      {
        type: {
          notIn: [
            'CRM_MESSAGE_RECEIVED',
            'CRM_FOLLOW_UP_DUE',
            'CRM_PLACEMENT_FAILURE',
            'CRM_AI_LEAD_QUALIFIED',
          ],
        },
      },
      {
        AND: [
          master,
          {
            type: 'CRM_MESSAGE_RECEIVED',
            recipient: {
              operationsNotificationPreference: {
                crmIncomingMessagesEnabled: true,
              },
            },
          },
        ],
      },
      {
        AND: [
          master,
          { type: 'CRM_FOLLOW_UP_DUE' },
          {
            OR: [
              noPreference,
              {
                recipient: {
                  operationsNotificationPreference: {
                    crmFollowUpEnabled: true,
                  },
                },
              },
            ],
          },
        ],
      },
      { AND: [master, { type: 'CRM_PLACEMENT_FAILURE' }] },
      {
        AND: [
          master,
          {
            type: 'CRM_AI_LEAD_QUALIFIED',
            recipient: {
              operationsNotificationPreference: { crmAiLeadsEnabled: true },
            },
          },
        ],
      },
    ],
  };
}

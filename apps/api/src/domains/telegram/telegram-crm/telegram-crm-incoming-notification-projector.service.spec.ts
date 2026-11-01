import type { Prisma } from '@prisma/client';
import type { OperationsNotificationInsert } from '../../operations/notifications/operations-notification-store.service';
import { TelegramCrmIncomingNotificationProjector } from './telegram-crm-incoming-notification-projector.service';
import { TelegramCrmNotificationEligibilityService } from './telegram-crm-notification-eligibility.service';
import { TelegramCrmNotificationGroups } from './telegram-crm-notification-groups';
import type { CrmMessageBatchInput } from './telegram-crm-message-batch-writer.service';
import type { CrmMessageRow } from './telegram-crm-message.mapper';

const now = new Date('2026-10-31T12:00:00.000Z');
const message = (numeric = 42): CrmMessageRow => ({
  id: `message-${numeric}`,
  workspaceId: 'workspace-current',
  conversationId: 'conversation-current',
  telegramMessageId: String(numeric),
  telegramMessageIdNumeric: numeric,
  mtprotoAccountId: 'account-current',
  clientIdempotencyKey: null,
  direction: 'INBOUND',
  origin: 'TELEGRAM_SYNC',
  sentByMemberId: null,
  text: 'Private message '.repeat(40),
  contentMetadata: null,
  sentAt: now,
  editedAt: null,
  deletedAt: null,
  readState: 'UNREAD',
  deliveryState: 'UNKNOWN',
  createdAt: now,
});
const input = (numeric = 42): CrmMessageBatchInput => ({
  conversation: {
    id: 'conversation-current',
    contactId: 'contact-current',
    telegramCrmPeerId: 'peer-current',
    lastOutboundAt: now,
    lastInboundAt: new Date(now.getTime() - 1000),
    peer: {
      telegramUserId: '777',
      username: 'ada',
      firstName: 'Ada',
      lastName: 'Lovelace',
      photoUrl: null,
    },
  },
  message: {
    telegramMessageId: numeric,
    telegramUserId: '777',
    direction: 'INBOUND',
    text: message(numeric).text,
    sentAt: now,
    editedAt: null,
    contentMetadata: null,
  },
});
const conversation = {
  id: 'conversation-current',
  workspaceId: 'workspace-current',
  mtprotoAccountId: 'account-current',
  contactId: 'contact-current',
  telegramCrmPeerId: 'peer-current',
  unreadCount: 100,
  lastReadInboxTelegramMessageId: 0,
};

function setup({
  preview = false,
  enabled = true,
  eligible = true,
  watermark = 0,
} = {}) {
  const snapshot = {
    contact: jest.fn().mockReturnValue({
      id: 'contact-current',
      displayName: 'Ada',
      ownerMemberId: 'member-current',
    }),
    recipient: jest.fn().mockReturnValue({ id: 'member-current' }),
    incomingEnabled: () => enabled,
    previewEnabled: () => preview,
    priority: jest.fn().mockReturnValue('HIGH'),
  };
  const recipients = { load: jest.fn().mockResolvedValue(snapshot) };
  const upsertMany = jest
    .fn<
      Promise<{ id: string }[]>,
      [Prisma.TransactionClient, OperationsNotificationInsert[]]
    >()
    .mockResolvedValue([{ id: 'notification-current' }]);
  const tx = {
    telegramCrmConversation: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          eligible
            ? [{ ...conversation, lastReadInboxTelegramMessageId: watermark }]
            : [],
        ),
    },
  };
  const projector = new TelegramCrmIncomingNotificationProjector(
    recipients as never,
    { upsertMany } as never,
    new TelegramCrmNotificationEligibilityService(),
    new TelegramCrmNotificationGroups(),
  );
  return { projector, tx, snapshot, recipients, upsertMany };
}

describe('TelegramCrmIncomingNotificationProjector', () => {
  it('creates one durable intent for an opted-in live unread incoming message with a private default body', async () => {
    const { projector, tx, upsertMany, snapshot } = setup();
    await expect(
      projector.project(
        tx as never,
        'workspace-current',
        'live',
        [input()],
        [message()],
      ),
    ).resolves.toEqual([{ id: 'notification-current' }]);
    const row = upsertMany.mock.calls[0][1][0];
    expect(row).toMatchObject({
      sourceKey: 'account:account-current:conversation:conversation-current',
      recipientMemberId: 'member-current',
      type: 'CRM_MESSAGE_RECEIVED',
      priority: 'HIGH',
      body: 'Open Inbox to read the new message.',
      metadata: {
        messageId: 'message-42',
        telegramMessageId: 42,
        messageCount: 100,
      },
    });
    expect(row.body).not.toContain('Private');
    expect(row.metadata).not.toHaveProperty('text');
    const target = new URL(row.targetUrl, 'https://nexeloq.test');
    expect(target.pathname).toBe('/ad-sales/inbox');
    expect(Object.fromEntries(target.searchParams)).toEqual({
      conversationId: conversation.id,
      workspaceId: conversation.workspaceId,
      peerId: conversation.telegramCrmPeerId,
    });
    expect(snapshot.priority).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Date),
      true,
    );
    expect(tx.telegramCrmConversation.findMany).toHaveBeenCalledTimes(1);
  });

  it('caps preview at 240 characters only after explicit preview opt-in', async () => {
    const { projector, tx, upsertMany } = setup({ preview: true });
    await projector.project(
      tx as never,
      'workspace-current',
      'live',
      [input()],
      [message()],
    );
    expect(upsertMany.mock.calls[0][1][0].body).toHaveLength(240);
  });

  it('groups a 100-message burst by exact account and conversation using one eligibility read', async () => {
    const { projector, tx, upsertMany } = setup();
    await projector.project(
      tx as never,
      'workspace-current',
      'live',
      Array.from({ length: 100 }, (_, n) => input(n + 1)),
      Array.from({ length: 100 }, (_, n) => message(n + 1)),
    );
    expect(upsertMany.mock.calls[0][1]).toHaveLength(1);
    expect(upsertMany.mock.calls[0][1][0].metadata.messageId).toBe(
      'message-100',
    );
    expect(tx.telegramCrmConversation.findMany).toHaveBeenCalledTimes(1);
  });

  it.each([{ enabled: false }, { eligible: false }, { watermark: 42 }])(
    'skips opted-out, ineligible or already read work: %j',
    async (options) => {
      const { projector, tx, upsertMany } = setup(options);
      await projector.project(
        tx as never,
        'workspace-current',
        'live',
        [input()],
        [message()],
      );
      expect(upsertMany).not.toHaveBeenCalled();
    },
  );

  it('does not reroute a responsible recipient who disabled incoming notifications', async () => {
    const { projector, tx, upsertMany, snapshot } = setup({ enabled: false });
    await projector.project(
      tx as never,
      'workspace-current',
      'live',
      [input()],
      [message()],
    );
    expect(snapshot.recipient).toHaveBeenCalledTimes(1);
    expect(upsertMany).not.toHaveBeenCalled();
  });

  it.each(['history', 'snapshot'] as const)(
    'performs no projection work for %s',
    async (mode) => {
      const { projector, tx, upsertMany } = setup();
      await projector.project(
        tx as never,
        'workspace-current',
        mode,
        [input()],
        [message()],
      );
      expect(tx.telegramCrmConversation.findMany).not.toHaveBeenCalled();
      expect(upsertMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    'duplicate',
    'edited',
    'outbound',
    'read',
    'foreign-workspace',
    'foreign-account',
  ])('suppresses %s without notifications', async (kind) => {
    const { projector, tx, upsertMany } = setup();
    const row = message();
    if (kind === 'outbound') row.direction = 'OUTBOUND';
    if (kind === 'read') row.readState = 'READ';
    if (kind === 'foreign-workspace') row.workspaceId = 'workspace-foreign';
    if (kind === 'foreign-account') row.mtprotoAccountId = 'account-foreign';
    await projector.project(
      tx as never,
      'workspace-current',
      'live',
      [{ ...input(), edited: kind === 'edited' }],
      kind === 'duplicate' ? [] : [row],
    );
    expect(upsertMany).not.toHaveBeenCalled();
  });
});

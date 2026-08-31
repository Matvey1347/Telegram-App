import { TelegramCrmConversationService } from './telegram-crm-conversation.service';

const conversation = (accountId: string) => ({
  id: `conversation-${accountId}`,
  workspaceId: 'workspace-1',
  telegramCrmPeerId: 'peer-1',
  contactId: null,
  mtprotoAccountId: accountId,
  telegramDialogId: 'dialog-123',
  state: 'ACTIVE',
  lastMessageAt: null,
  lastInboundAt: null,
  lastOutboundAt: null,
  unreadCount: 0,
  readState: 'UNKNOWN',
  lastReadTelegramMessageId: null,
  lastReadAt: null,
  incrementalSyncCheckpoint: null,
  recoveryCheckpoint: null,
  lastMeaningfulSyncAt: null,
  createdAt: new Date('2026-09-01T08:00:00.000Z'),
  updatedAt: new Date('2026-09-01T08:00:00.000Z'),
});

describe('TelegramCrmConversationService', () => {
  const setup = () => {
    const prisma = {
      telegramCrmPeer: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'peer-1', contactId: null }),
      },
      telegramCrmConversation: {
        create: jest.fn(({ data }: { data: { mtprotoAccountId: string } }) =>
          Promise.resolve(conversation(data.mtprotoAccountId)),
        ),
        findUnique: jest.fn(),
      },
      telegramAdCrmWorkspaceSettings: {
        findUnique: jest.fn().mockResolvedValue({
          defaultCrmSenderAccountId: 'account-default',
        }),
      },
    };
    const authorization = {
      require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      context: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-1',
        memberId: 'member-1',
      }),
    };
    const accountAccess = {
      requireUsableSender: jest.fn().mockResolvedValue({}),
    };
    return {
      prisma,
      authorization,
      accountAccess,
      service: new TelegramCrmConversationService(
        prisma as never,
        authorization as never,
        accountAccess as never,
      ),
    };
  };

  it('allows one peer to have Conversations through multiple MTProto accounts', async () => {
    const { service, prisma } = setup();

    await service.create('user-1', {
      telegramCrmPeerId: 'peer-1',
      accountId: 'account-1',
      telegramDialogId: 'dialog-123',
    });
    await service.create('user-1', {
      telegramCrmPeerId: 'peer-1',
      accountId: 'account-2',
      telegramDialogId: 'dialog-123',
    });

    expect(
      prisma.telegramCrmConversation.create.mock.calls[0][0].data,
    ).toMatchObject({
      telegramCrmPeerId: 'peer-1',
      mtprotoAccountId: 'account-1',
    });
    expect(
      prisma.telegramCrmConversation.create.mock.calls[1][0].data,
    ).toMatchObject({
      telegramCrmPeerId: 'peer-1',
      mtprotoAccountId: 'account-2',
    });
  });

  it('uses the workspace default sender only when creating a Conversation', async () => {
    const { service, prisma, accountAccess } = setup();

    const result = await service.create('user-1', {
      telegramCrmPeerId: 'peer-1',
      telegramDialogId: 'dialog-123',
    });

    expect(
      prisma.telegramAdCrmWorkspaceSettings.findUnique,
    ).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-1' },
      select: { defaultCrmSenderAccountId: true },
    });
    expect(accountAccess.requireUsableSender).toHaveBeenCalledWith(
      'workspace-1',
      'account-default',
    );
    expect(result.mtprotoAccountId).toBe('account-default');
    expect(prisma.telegramCrmConversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mtprotoAccountId: 'account-default' }),
      }),
    );
  });
});

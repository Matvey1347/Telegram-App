import { Prisma } from '@prisma/client';
import { TelegramCrmConversationService } from './telegram-crm-conversation.service';

const callArgument = (
  mock: { mock: { calls: unknown[][] } },
  index = 0,
): unknown => mock.mock.calls[index]?.[0];

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
        findFirst: jest.fn().mockResolvedValue({
          id: 'peer-1',
          contactId: null,
          telegramUserId: '42',
        }),
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

    expect(callArgument(prisma.telegramCrmConversation.create)).toMatchObject({
      data: {
        telegramCrmPeerId: 'peer-1',
        mtprotoAccountId: 'account-1',
        telegramDialogId: '42',
      },
    });
    expect(
      callArgument(prisma.telegramCrmConversation.create, 1),
    ).toMatchObject({
      data: {
        telegramCrmPeerId: 'peer-1',
        mtprotoAccountId: 'account-2',
        telegramDialogId: '42',
      },
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
    expect(callArgument(prisma.telegramCrmConversation.create)).toMatchObject({
      data: { mtprotoAccountId: 'account-default' },
    });
  });

  it('returns the composite-key winner when creation races with a different client dialog id', async () => {
    const { service, prisma } = setup();
    const winner = {
      ...conversation('account-1'),
      id: 'conversation-winner',
      telegramDialogId: 'legacy-client-dialog-id',
    };
    prisma.telegramCrmConversation.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique race', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    );
    prisma.telegramCrmConversation.findUnique.mockResolvedValue(winner);

    const result = await service.create('user-1', {
      telegramCrmPeerId: 'peer-1',
      accountId: 'account-1',
      telegramDialogId: 'client-supplied-dialog-id',
    });

    expect(result.id).toBe('conversation-winner');
    expect(result.telegramDialogId).toBe('legacy-client-dialog-id');
    expect(prisma.telegramCrmConversation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_telegramCrmPeerId_mtprotoAccountId: {
            workspaceId: 'workspace-1',
            telegramCrmPeerId: 'peer-1',
            mtprotoAccountId: 'account-1',
          },
        },
      }),
    );
  });
});

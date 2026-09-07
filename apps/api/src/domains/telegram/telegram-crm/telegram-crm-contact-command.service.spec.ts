import { ForbiddenException } from '@nestjs/common';
import { TelegramCrmContactCommandService } from './telegram-crm-contact-command.service';

describe('TelegramCrmContactCommandService', () => {
  const contactRow = {
    id: 'contact-1',
    workspaceId: 'workspace-1',
    displayName: 'Customer',
    companyName: null,
    telegramUsername: null,
    phone: null,
    email: null,
    website: null,
    description: null,
    source: null,
    stage: 'CUSTOMER',
    ownerMemberId: 'member-1',
    lastContactAt: null,
    lastInboundAt: null,
    lastOutboundAt: null,
    lastPurchaseAt: null,
    nextContactAt: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    _count: { sales: 0 },
  };

  it('authorizes writes against Contact ownership inside the selected workspace', async () => {
    const prisma = {
      telegramAdvertiser: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'contact-1',
          workspaceId: 'workspace-1',
          ownerMemberId: 'member-2',
          archivedAt: null,
        }),
        update: jest.fn(),
      },
    };
    const authorization = {
      require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      context: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-1',
        memberId: 'member-1',
      }),
      can: jest.fn(async (_userId: string, key: string) =>
        ['adSales.crm.editOwn'].includes(key),
      ),
      requireOwnOrAny: jest.fn().mockRejectedValue(new ForbiddenException()),
    };
    const notifications = {
      contactVisibilityChanged: jest.fn(),
      invalidateVisibility: jest.fn(),
    };
    const service = new TelegramCrmContactCommandService(
      prisma as never,
      authorization as never,
      notifications as never,
    );

    await expect(
      service.update('user-1', 'contact-1', { stage: 'QUALIFIED' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.telegramAdvertiser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'contact-1', workspaceId: 'workspace-1' },
      }),
    );
    expect(authorization.requireOwnOrAny).toHaveBeenCalledWith(
      'user-1',
      { assignedMemberId: 'member-2' },
      'adSales.crm.editOwn',
      'adSales.crm.editAny',
    );
    expect(prisma.telegramAdvertiser.update).not.toHaveBeenCalled();
  });

  it('does not enable customer automation when the Contact becomes a Customer', async () => {
    const prisma = {
      telegramAdvertiser: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'contact-1',
          workspaceId: 'workspace-1',
          ownerMemberId: 'member-1',
          archivedAt: null,
        }),
        update: jest.fn().mockResolvedValue(contactRow),
      },
    };
    const authorization = {
      require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      context: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-1',
        memberId: 'member-1',
      }),
      can: jest.fn().mockResolvedValue(true),
      requireOwnOrAny: jest.fn().mockResolvedValue(undefined),
    };
    const notifications = {
      contactVisibilityChanged: jest.fn(),
      invalidateVisibility: jest.fn(),
    };
    const service = new TelegramCrmContactCommandService(
      prisma as never,
      authorization as never,
      notifications as never,
    );

    await service.update('user-1', 'contact-1', { stage: 'CUSTOMER' });

    expect(prisma.telegramAdvertiser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { stage: 'CUSTOMER', archivedAt: null },
      }),
    );
  });

  it('atomically revokes old previews and transfers pending visibility on ownership change', async () => {
    const tx = {
      telegramAdvertiser: { update: jest.fn().mockResolvedValue(contactRow) },
    };
    const prisma = {
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 'member-2' }),
      },
      telegramAdvertiser: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'contact-1',
          workspaceId: 'workspace-1',
          ownerMemberId: 'member-1',
          archivedAt: null,
        }),
      },
      $transaction: jest.fn(async (work: (value: unknown) => unknown) =>
        work(tx),
      ),
    };
    const authorization = {
      require: jest.fn(),
      context: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-1',
        memberId: 'member-1',
      }),
      can: jest.fn().mockResolvedValue(true),
      requireOwnOrAny: jest.fn(),
    };
    const notifications = {
      contactVisibilityChanged: jest.fn().mockResolvedValue(['member-1']),
      invalidateVisibility: jest.fn(),
    };
    const service = new TelegramCrmContactCommandService(
      prisma as never,
      authorization as never,
      notifications as never,
    );

    await service.update('user-1', 'contact-1', {
      ownerMemberId: 'member-2',
    });

    expect(notifications.contactVisibilityChanged).toHaveBeenCalledWith(
      tx,
      'workspace-1',
      'contact-1',
    );
    expect(notifications.invalidateVisibility).toHaveBeenCalledWith(
      'workspace-1',
      ['member-1'],
    );
  });

  it('mutes only the current unanswered-message waterline inside the writable workspace', async () => {
    const telegramAdvertiser = {
      findFirst: jest.fn().mockResolvedValue({
        id: 'contact-1',
        workspaceId: 'workspace-1',
        ownerMemberId: 'member-1',
        archivedAt: null,
      }),
      update: jest.fn().mockResolvedValue({
        id: 'contact-1',
        replyAlertMutedAt: new Date('2026-09-06T10:00:00.000Z'),
      }),
    };
    const prisma = {
      telegramAdvertiser,
      telegramCrmConversation: {
        findMany: jest.fn().mockResolvedValue([
          {
            contactId: 'contact-1',
            inboundMessageCount: 2,
            outboundMessageCount: 1,
            historyExhausted: true,
            lastInboundAt: new Date('2026-09-06T09:00:00.000Z'),
            lastOutboundAt: new Date('2026-09-06T08:00:00.000Z'),
            unreadCount: 0,
          },
        ]),
      },
    };
    const responseCache = { clearWorkspacePath: jest.fn() };
    const service = new TelegramCrmContactCommandService(
      prisma as never,
      {
        require: jest.fn(),
        context: jest.fn().mockResolvedValue({
          workspaceId: 'workspace-1',
          memberId: 'member-1',
        }),
        can: jest.fn().mockResolvedValue(true),
        requireOwnOrAny: jest.fn(),
      } as never,
      {} as never,
      responseCache as never,
    );

    await expect(
      service.setReplyAlertMuted('user-1', 'contact-1', { muted: true }),
    ).resolves.toMatchObject({
      replySummary: {
        status: 'CONVERSATION_UNANSWERED_READ',
        muted: true,
      },
    });
    expect(telegramAdvertiser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'contact-1', workspaceId: 'workspace-1' },
      }),
    );
    expect(telegramAdvertiser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { replyAlertMutedAt: expect.any(Date) },
      }),
    );
    expect(responseCache.clearWorkspacePath).toHaveBeenCalledWith(
      'workspace-1',
      '/telegram-crm/contacts',
    );
  });
});

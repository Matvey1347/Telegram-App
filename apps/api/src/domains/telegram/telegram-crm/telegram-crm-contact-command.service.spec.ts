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
    automatedMessagesEnabled: false,
    automatedMessagesEnabledAt: null,
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
          automatedMessagesEnabled: false,
          automatedMessagesEnabledAt: null,
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
          automatedMessagesEnabled: false,
          automatedMessagesEnabledAt: null,
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
    expect(
      prisma.telegramAdvertiser.update.mock.calls[0]?.[0].data,
    ).not.toHaveProperty('automatedMessagesEnabled');
    expect(authorization.require).not.toHaveBeenCalledWith(
      'user-1',
      'adSales.crm.manageAutomation',
    );
  });

  it('does not accept automation consent through the legacy Contact command', async () => {
    const prisma = {
      telegramAdvertiser: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'contact-1',
          workspaceId: 'workspace-1',
          ownerMemberId: 'member-1',
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

    await expect(
      service.update('user-1', 'contact-1', {
        automatedMessagesEnabled: true,
      } as never),
    ).rejects.toThrow('No changes');
    expect(prisma.telegramAdvertiser.update).not.toHaveBeenCalled();
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
});

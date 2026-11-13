/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- focused connection test doubles */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TelegramSystemBotConnectionsService } from './telegram-system-bot-connections.service';
import { TelegramSystemBotNotificationConnectionsService } from './telegram-system-bot-notification-connections.service';

describe('TelegramSystemBotConnectionsService', () => {
  const config = {
    frontendUrl: 'https://app.example.test',
    username: 'system_bot',
    configured: true,
    environment: 'LOCAL',
    dashboardRuntimes: jest.fn().mockReturnValue([
      { environment: 'LOCAL', username: 'system_bot', selected: true },
      {
        environment: 'PRODUCTION',
        username: 'system_bot_prod',
        selected: false,
      },
    ]),
    hashLinkToken: jest.fn((value: string) => `hash:${value}`),
  };
  const prisma = {
    systemBotLinkToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    telegramSystemBotConnection: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      upsert: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    workspaceMember: { findMany: jest.fn(), findFirst: jest.fn() },
    workspace: {
      update: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    telegramSystemBotTaskSubscription: {
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(async (operations: unknown[]) =>
      Promise.all(operations),
    ),
  } as any;
  let service: TelegramSystemBotConnectionsService;
  let notificationConnections: TelegramSystemBotNotificationConnectionsService;
  const taskRegistry = {
    definitions: jest.fn().mockReturnValue([]),
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TelegramSystemBotConnectionsService(
      prisma,
      config as any,
      taskRegistry as any,
    );
    notificationConnections =
      new TelegramSystemBotNotificationConnectionsService(
        prisma,
        config as any,
      );
  });

  it('creates a short-lived group linking code for an authorized workspace manager', async () => {
    prisma.workspaceMember.findFirst.mockResolvedValue({ role: 'owner' });
    prisma.workspace.update.mockResolvedValue({});
    const link = await notificationConnections.createNotificationGroupLink(
      'workspace-a',
      'user-a',
    );
    expect(link.botUsername).toBe('system_bot');
    expect(link.token).toHaveLength(32);
    expect(new Date(link.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'workspace-a' },
        data: expect.objectContaining({
          telegramNotificationLinkTokenHash: `hash:${link.token}`,
        }),
      }),
    );
  });

  it('does not let a regular member create or consume group binding links', async () => {
    prisma.workspaceMember.findFirst.mockResolvedValue({ role: 'member' });
    await expect(
      notificationConnections.createNotificationGroupLink(
        'workspace-a',
        'user-a',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('consumes the group code once and stores workspace chat metadata', async () => {
    prisma.workspace.findFirst.mockResolvedValue({ id: 'workspace-a' });
    prisma.workspace.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      notificationConnections.consumeNotificationGroupLink(
        'one-time-token-value',
        '-100123',
        'Ops group',
      ),
    ).resolves.toBe(true);
    expect(prisma.workspace.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          telegramNotificationLinkTokenHash: 'hash:one-time-token-value',
        }),
        data: expect.objectContaining({
          telegramNotificationChatId: '-100123',
          telegramNotificationChatTitle: 'Ops group',
          telegramNotificationLinkTokenHash: null,
        }),
      }),
    );
  });

  it('creates an expiring workspace notification account link independent of its creator', async () => {
    prisma.workspaceMember.findFirst.mockResolvedValue({ role: 'admin' });
    prisma.workspace.update.mockResolvedValue({});
    const link = await notificationConnections.createNotificationAccountLink(
      'workspace-a',
      'admin-a',
    );
    expect(link.botUsername).toBe('system_bot');
    expect(link.runtimeEnvironment).toBe('LOCAL');
    expect(link.botRuntimes).toHaveLength(2);
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'workspace-a' },
        data: expect.objectContaining({
          telegramNotificationAccountLinkTokenHash: `hash:${link.token}`,
        }),
      }),
    );
  });

  it('binds the Telegram identity that opens the workspace token rather than its creating member', async () => {
    prisma.workspace.findFirst.mockResolvedValue({ id: 'workspace-a' });
    prisma.workspace.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      notificationConnections.consumeNotificationAccountLink({
        token: 'one-time-account-token',
        telegramUserId: 'telegram-user-44',
        telegramChatId: 'telegram-user-44',
        username: 'primary_admin',
        firstName: 'Primary',
      }),
    ).resolves.toBe(true);
    expect(prisma.workspace.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          telegramNotificationAccountLinkTokenHash:
            'hash:one-time-account-token',
        }),
        data: expect.objectContaining({
          telegramNotificationUserId: 'telegram-user-44',
          telegramNotificationUserChatId: 'telegram-user-44',
          telegramNotificationUserName: '@primary_admin',
          telegramNotificationAccountLinkTelegramUserId: 'telegram-user-44',
        }),
      }),
    );
  });

  it('reports an expired or previously consumed workspace account token without binding it', async () => {
    prisma.workspace.findFirst.mockResolvedValue(null);
    await expect(
      notificationConnections.consumeNotificationAccountLink({
        token: 'expired-account-token',
        telegramUserId: 'telegram-user-44',
        telegramChatId: 'telegram-user-44',
      }),
    ).resolves.toBe(false);
    expect(prisma.workspace.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to bind an account token from a non-private chat', async () => {
    await expect(
      notificationConnections.consumeNotificationAccountLink({
        token: 'group-account-token',
        telegramUserId: 'telegram-user-44',
        telegramChatId: '-100123',
      }),
    ).resolves.toBe(false);
    expect(prisma.workspace.findFirst).not.toHaveBeenCalled();
  });

  it('accepts the same account opening the shared binding link in a second bot environment', async () => {
    prisma.workspace.findFirst.mockResolvedValue({
      id: 'workspace-a',
      telegramNotificationAccountLinkTelegramUserId: 'telegram-user-44',
    });
    await expect(
      notificationConnections.consumeNotificationAccountLink({
        token: 'shared-account-token',
        telegramUserId: 'telegram-user-44',
        telegramChatId: 'telegram-user-44',
      }),
    ).resolves.toBe(true);
    expect(prisma.workspace.updateMany).not.toHaveBeenCalled();
  });

  it('reuses an authorized connection when resolving current workspace membership', async () => {
    const connection = {
      id: 'connection',
      userId: 'user',
      telegramUserId: '44',
      currentWorkspaceId: 'workspace-a',
    };
    prisma.workspaceMember.findFirst.mockResolvedValue({
      workspaceId: 'workspace-a',
      role: 'admin',
      workspace: {
        name: 'Business',
        timezone: 'Europe/Warsaw',
        avatarIcon: null,
      },
    });

    await expect(
      service.requireCurrentWorkspace(connection),
    ).resolves.toMatchObject({
      workspaceId: 'workspace-a',
      workspace: {
        name: 'Business',
        timezone: 'Europe/Warsaw',
        avatarPresentation: null,
      },
    });

    expect(
      prisma.telegramSystemBotConnection.findUniqueOrThrow,
    ).not.toHaveBeenCalled();
    expect(prisma.workspaceMember.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user', workspaceId: 'workspace-a' },
      }),
    );
  });

  it('rejects a stale current workspace membership while reusing the connection', async () => {
    prisma.workspaceMember.findFirst.mockResolvedValue(null);

    await expect(
      service.requireCurrentWorkspace({
        id: 'connection',
        userId: 'user',
        telegramUserId: '44',
        currentWorkspaceId: 'removed-workspace',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(
      prisma.telegramSystemBotConnection.findUniqueOrThrow,
    ).not.toHaveBeenCalled();
    expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user', workspaceId: 'removed-workspace' },
      }),
    );
  });

  it('stores an explicit workspace subscription independently of navigation context', async () => {
    prisma.telegramSystemBotConnection.findFirst.mockResolvedValue({
      id: 'connection',
      userId: 'user',
      currentWorkspaceId: 'workspace-b',
    });
    prisma.workspaceMember.findFirst.mockResolvedValue({
      workspaceId: 'workspace-a',
    });
    taskRegistry.get.mockReturnValue({
      key: 'telegram.channels.full_sync',
      scope: 'WORKSPACE_OPERATION',
      notificationSupported: true,
    });
    prisma.telegramSystemBotTaskSubscription.upsert.mockResolvedValue({});

    await service.updateSubscription('user', {
      workspaceId: 'workspace-a',
      taskKey: 'telegram.channels.full_sync',
      enabled: true,
      notifyOnSuccess: true,
      notifyOnFailure: false,
    });

    expect(
      prisma.telegramSystemBotTaskSubscription.upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          connectionId_workspaceId_taskKey: {
            connectionId: 'connection',
            workspaceId: 'workspace-a',
            taskKey: 'telegram.channels.full_sync',
          },
        },
      }),
    );
  });

  it('returns the configured bot username when a recipient is not connected', async () => {
    taskRegistry.definitions.mockReturnValue([
      {
        key: 'telegram.channels.full_sync',
        scope: 'WORKSPACE_OPERATION',
        notificationSupported: true,
      },
    ]);
    prisma.workspaceMember.findFirst.mockResolvedValue({
      workspaceId: 'workspace-a',
    });
    prisma.telegramSystemBotConnection.findFirst.mockResolvedValue(null);

    await expect(service.subscriptions('user', 'workspace-a')).resolves.toEqual(
      {
        connected: false,
        botUsername: 'system_bot',
        workspaceId: 'workspace-a',
        items: [
          {
            workspaceId: 'workspace-a',
            taskKey: 'telegram.channels.full_sync',
            enabled: false,
            notifyOnSuccess: false,
            notifyOnFailure: false,
          },
        ],
      },
    );
  });

  it('switches the connected bot to an accessible website workspace', async () => {
    prisma.telegramSystemBotConnection.findFirst.mockResolvedValue({
      id: 'connection',
      userId: 'user',
      currentWorkspaceId: 'workspace-old',
    });
    prisma.workspaceMember.findFirst.mockResolvedValue({
      workspaceId: 'workspace-current',
    });
    prisma.telegramSystemBotConnection.update.mockResolvedValue({});

    await service.switchWorkspaceForUser('user', 'workspace-current');

    expect(prisma.telegramSystemBotConnection.update).toHaveBeenCalledWith({
      where: { id: 'connection' },
      data: {
        currentWorkspaceId: 'workspace-current',
        lastInteractionAt: expect.any(Date),
      },
    });
  });

  it('uses the website-selected workspace when connecting instead of the first membership', async () => {
    const token = 'x'.repeat(32);
    prisma.systemBotLinkToken.findUnique.mockResolvedValue({
      id: 'link',
      telegramUserId: '44',
      telegramChatId: '55',
      telegramMessageId: 7,
      username: 'matvii',
      firstName: 'Matvii',
      usedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.workspaceMember.findMany.mockResolvedValue([
      { workspaceId: 'test' },
      { workspaceId: 'business' },
    ]);
    prisma.telegramSystemBotConnection.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        enabled: true,
        username: 'matvii',
        firstName: 'Matvii',
        createdAt: new Date('2026-08-29T08:00:00.000Z'),
        currentWorkspaceId: 'business',
        currentWorkspace: { id: 'business', name: 'Business' },
      });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const upsert = jest.fn().mockResolvedValue({ id: 'connection' });
    prisma.$transaction.mockImplementationOnce(
      (callback: (tx: unknown) => unknown) =>
        callback({
          systemBotLinkToken: { updateMany },
          telegramSystemBotConnection: { upsert },
        }),
    );

    await service.confirmLink('user', token, 'business');

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ currentWorkspaceId: 'business' }),
        update: expect.objectContaining({ currentWorkspaceId: 'business' }),
      }),
    );
  });

  it('updates every notifiable task in a group atomically', async () => {
    prisma.telegramSystemBotConnection.findFirst.mockResolvedValue({
      id: 'connection',
      userId: 'user',
    });
    prisma.workspaceMember.findFirst.mockResolvedValue({
      workspaceId: 'workspace-a',
    });
    taskRegistry.definitions.mockReturnValue([
      {
        key: 'telegram.channels.full_sync',
        scope: 'WORKSPACE_OPERATION',
        notificationSupported: true,
        group: { key: 'TELEGRAM' },
      },
      {
        key: 'telegram.post_metrics.sync',
        scope: 'WORKSPACE_OPERATION',
        notificationSupported: true,
        group: { key: 'TELEGRAM' },
      },
      {
        key: 'currencies.rates.sync',
        scope: 'WORKSPACE_OPERATION',
        notificationSupported: true,
      },
    ]);
    prisma.telegramSystemBotTaskSubscription.upsert.mockResolvedValue({});
    prisma.telegramSystemBotTaskSubscription.findMany.mockResolvedValue([]);

    await service.updateGroupSubscriptions('user', {
      workspaceId: 'workspace-a',
      groupKey: 'TELEGRAM',
      notifyOnSuccess: true,
      notifyOnFailure: false,
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array));
    expect(
      prisma.telegramSystemBotTaskSubscription.upsert,
    ).toHaveBeenCalledTimes(2);
    expect(
      prisma.telegramSystemBotTaskSubscription.upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          taskKey: 'telegram.channels.full_sync',
          enabled: true,
        }),
      }),
    );
  });

  it('persists only a hash for a generated connection link', async () => {
    prisma.systemBotLinkToken.create.mockResolvedValue({ id: 'link' });
    const result = await service.createLink({
      telegramUserId: '44',
      telegramChatId: '55',
    });
    expect(result.url).toContain('/system-bot/connect?token=');
    expect(prisma.systemBotLinkToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenHash: expect.stringMatching(/^hash:/),
        }),
      }),
    );
    expect(
      JSON.stringify(prisma.systemBotLinkToken.create.mock.calls),
    ).not.toContain('token=');
  });

  it('rejects expired and used connection links', async () => {
    prisma.systemBotLinkToken.findUnique.mockResolvedValueOnce({
      id: 'link',
      expiresAt: new Date(Date.now() - 1),
      usedAt: null,
      revokedAt: null,
    });
    await expect(
      service.previewLink('user', 'a'.repeat(32)),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.systemBotLinkToken.findUnique.mockResolvedValueOnce({
      id: 'link',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
      revokedAt: null,
    });
    await expect(
      service.previewLink('user', 'b'.repeat(32)),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not let another logged-in user take an existing Telegram identity', async () => {
    prisma.systemBotLinkToken.findUnique.mockResolvedValue({
      id: 'link',
      telegramUserId: '44',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      revokedAt: null,
    });
    prisma.telegramSystemBotConnection.findUnique.mockResolvedValue({
      userId: 'other-user',
    });
    await expect(
      service.previewLink('user', 'c'.repeat(32)),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

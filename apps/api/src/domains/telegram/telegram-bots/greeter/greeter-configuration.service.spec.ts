import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GreeterAutomationEnvironment } from '@prisma/client';
import { GreeterConfigurationService } from './greeter-configuration.service';

describe('GreeterConfigurationService', () => {
  const global = {
    id: 'cfg',
    workspaceId: 'w',
    botIntegrationId: 'b',
    captchaEnabled: true,
    captchaType: 'BUTTON_CONFIRM',
    captchaMessage: 'Hello',
    confirmButtonText: 'Confirm',
    choicePrompt: '{{captcha.answer}}',
    timeoutMinutes: 30,
    successMessage: 'Welcome',
    failureMessage: null,
    failureBehavior: 'KEEP_PENDING',
  } as any;

  it('resolves partial channel overrides over global values', async () => {
    const prisma = {
      greeterConfig: { upsert: jest.fn().mockResolvedValue(global) },
    } as any;
    const service = new GreeterConfigurationService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.effectiveConfig('b', {
        workspaceId: 'w',
        useGlobalConfig: false,
        timeoutMinutes: 5,
      } as any),
    ).resolves.toMatchObject({
      source: 'OVERRIDE',
      timeoutMinutes: 5,
      captchaMessage: 'Hello',
    });
  });

  it('keeps draft CAPTCHA changes in TEST while production reads the immutable snapshot', async () => {
    const prisma = {
      greeterConfig: {
        upsert: jest.fn().mockResolvedValue({
          ...global,
          captchaMessage: 'Draft message',
          currentPublishedVersionId: 'published-1',
        }),
      },
      greeterConfigVersion: {
        findUnique: jest.fn().mockResolvedValue({
          ...global,
          id: 'published-1',
          captchaMessage: 'Published message',
          channelVersions: [],
        }),
      },
    } as any;
    const service = new GreeterConfigurationService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.effectiveConfig('b', { workspaceId: 'w' } as any),
    ).resolves.toMatchObject({ captchaMessage: 'Published message' });
    await expect(
      service.effectiveConfig(
        'b',
        { workspaceId: 'w' } as any,
        GreeterAutomationEnvironment.TEST,
      ),
    ).resolves.toMatchObject({ captchaMessage: 'Draft message' });
    expect(prisma.greeterConfigVersion.findUnique).toHaveBeenCalledTimes(1);
  });

  it('increments the fenced draft revision without changing the published pointer', async () => {
    const prisma = {
      greeterConfig: {
        upsert: jest.fn().mockResolvedValue({
          ...global,
          draftRevision: 3,
          publishedRevision: 2,
          currentPublishedVersionId: 'published-2',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({}),
      },
    } as any;
    const service = new GreeterConfigurationService(
      prisma,
      {
        requireBot: jest.fn().mockResolvedValue({ id: 'b', workspaceId: 'w' }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.updateConfig('admin', 'b', { captchaMessage: 'New draft' });

    expect(prisma.greeterConfig.updateMany).toHaveBeenCalledWith({
      where: { id: 'cfg', draftRevision: 3 },
      data: {
        captchaMessage: 'New draft',
        draftRevision: { increment: 1 },
      },
    });
  });

  it('publishes an immutable snapshot and fences it to the expected draft revision', async () => {
    const config = {
      ...global,
      draftRevision: 4,
      publishedRevision: 3,
      currentPublishedVersionId: 'published-3',
    };
    const prisma: any = {
      greeterConfig: {
        upsert: jest.fn().mockResolvedValue(config),
        findUnique: jest.fn().mockResolvedValue({ ...config, channels: [] }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      greeterConfigVersion: {
        create: jest.fn().mockResolvedValue({ id: 'published-4' }),
      },
    };
    prisma.$transaction = jest.fn((callback: any) => callback(prisma));
    const service = new GreeterConfigurationService(
      prisma,
      {
        requireBot: jest.fn().mockResolvedValue({ id: 'b', workspaceId: 'w' }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(service, 'overview').mockResolvedValue({} as never);

    await service.publishConfig('admin', 'b', 4);

    expect(prisma.greeterConfigVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        configId: 'cfg',
        revision: 4,
        captchaMessage: 'Hello',
      }),
    });
    expect(prisma.greeterConfig.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'cfg',
        draftRevision: 4,
        publishedRevision: 3,
      },
      data: {
        currentPublishedVersionId: 'published-4',
        publishedRevision: 4,
      },
    });
  });

  it('treats publishing an already-published draft revision as idempotent', async () => {
    const prisma = {
      greeterConfig: {
        upsert: jest.fn().mockResolvedValue({
          ...global,
          draftRevision: 4,
          publishedRevision: 4,
          currentPublishedVersionId: 'published-4',
        }),
      },
      $transaction: jest.fn(),
    } as any;
    const service = new GreeterConfigurationService(
      prisma,
      {
        requireBot: jest.fn().mockResolvedValue({ id: 'b', workspaceId: 'w' }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(service, 'overview').mockResolvedValue({} as never);

    await service.publishConfig('admin', 'b', 4);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unsupported template variables before persistence', async () => {
    const service = new GreeterConfigurationService(
      {} as any,
      {
        requireBot: jest.fn().mockResolvedValue({ id: 'b', workspaceId: 'w' }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.updateConfig('u', 'b', { captchaMessage: '{{secret.token}}' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not delete a channel outside the admin bot scope', async () => {
    const service = new GreeterConfigurationService(
      {
        greeterChannel: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      } as any,
      {
        requireBot: jest.fn().mockResolvedValue({ id: 'b', workspaceId: 'w' }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.deleteChannel('u', 'b', 'foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refreshes live Bot API permissions and persists the scoped source access', async () => {
    const previousEnvironment = process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT;
    process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT = 'PRODUCTION';
    const prisma = {
      greeterChannel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'gc',
          channel: { id: 'channel', telegramChatId: '-100' },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    } as any;
    const admin = {
      requireBot: jest.fn().mockResolvedValue({
        id: 'bot',
        workspaceId: 'workspace',
        runtimeInstances: [{
          environment: 'PRODUCTION',
          botTokenEncrypted: 'enc',
          botTokenIv: 'iv',
          botTokenAuthTag: 'tag',
        }],
      }),
    } as any;
    const botApi = {
      getMe: jest.fn().mockResolvedValue({ id: 77 }),
      getChatMember: jest
        .fn()
        .mockResolvedValue({ status: 'administrator', can_invite_users: true }),
    } as any;
    const sourceAccess = {
      normalizeBotPermissions: jest.fn().mockReturnValue({
        role: 'ADMIN',
        permissions: { canInviteUsers: true },
      }),
      upsertAccess: jest.fn().mockResolvedValue({ canInviteUsers: true }),
    } as any;
    const service = new GreeterConfigurationService(
      prisma,
      admin,
      botApi,
      { decrypt: jest.fn().mockReturnValue('token') } as any,
      sourceAccess,
    );
    try {
      await expect(
        service.refreshChannelPermissions('admin', 'bot', 'gc'),
      ).resolves.toMatchObject({ canInviteUsers: true });
    } finally {
      if (previousEnvironment === undefined)
        delete process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT;
      else process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT = previousEnvironment;
    }
    expect(botApi.getChatMember).toHaveBeenCalledWith('token', '-100', '77');
    expect(sourceAccess.upsertAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace',
        channelId: 'channel',
        sourceId: 'bot',
        rawPermissions: expect.objectContaining({ can_invite_users: true }),
      }),
    );
    expect(prisma.greeterChannel.update).toHaveBeenCalledWith({
      where: { id: 'gc' },
      data: { permissionError: null },
    });
  });

  it('persists a sanitized degraded permission state when refresh fails', async () => {
    const prisma = {
      greeterChannel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'gc',
          channel: { id: 'channel', telegramChatId: '-100' },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    } as any;
    const admin = {
      requireBot: jest.fn().mockResolvedValue({
        id: 'bot',
        workspaceId: 'workspace',
        runtimeInstances: [{
          environment: 'PRODUCTION',
          botTokenEncrypted: 'enc',
          botTokenIv: 'iv',
          botTokenAuthTag: 'tag',
        }],
      }),
    } as any;
    const botApi = {
      getMe: jest.fn().mockRejectedValue(new Error('token=secret denied')),
    } as any;
    const service = new GreeterConfigurationService(
      prisma,
      admin,
      botApi,
      { decrypt: jest.fn().mockReturnValue('token') } as any,
      {} as any,
    );

    await expect(
      service.refreshChannelPermissions('admin', 'bot', 'gc'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.greeterChannel.update).toHaveBeenCalledWith({
      where: { id: 'gc' },
      data: { permissionError: expect.not.stringContaining('secret') },
    });
  });

  it('refuses connection when a live permission refresh reports can_invite_users missing', async () => {
    const previousEnvironment = process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT;
    process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT = 'PRODUCTION';
    const prisma = {
      telegramChannel: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'channel', telegramChatId: '-100' }),
      },
      greeterChannel: { upsert: jest.fn() },
      greeterConfig: { upsert: jest.fn() },
    } as any;
    const bot = {
      id: 'bot',
      workspaceId: 'workspace',
      runtimeInstances: [{
        environment: 'PRODUCTION',
        botTokenEncrypted: 'enc',
        botTokenIv: 'iv',
        botTokenAuthTag: 'tag',
      }],
    };
    const botApi = {
      getMe: jest.fn().mockResolvedValue({ id: 77 }),
      getChatMember: jest.fn().mockResolvedValue({
        status: 'administrator',
        can_invite_users: false,
      }),
    } as any;
    const sourceAccess = {
      normalizeBotPermissions: jest.fn().mockReturnValue({
        role: 'ADMIN',
        permissions: { canInviteUsers: false },
      }),
      upsertAccess: jest.fn().mockResolvedValue({ canInviteUsers: false }),
    } as any;
    const service = new GreeterConfigurationService(
      prisma,
      { requireBot: jest.fn().mockResolvedValue(bot) } as any,
      botApi,
      { decrypt: jest.fn().mockReturnValue('token') } as any,
      sourceAccess,
    );
    try {
      await expect(
        service.connectChannel('admin', 'bot', 'channel'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      if (previousEnvironment === undefined)
        delete process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT;
      else process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT = previousEnvironment;
    }
    expect(prisma.greeterChannel.upsert).not.toHaveBeenCalled();
  });
});

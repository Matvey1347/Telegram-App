import { ForbiddenException } from '@nestjs/common';
import {
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
  TelegramBotRuntimeStatus,
  WorkspaceRole,
} from '@prisma/client';
import { TelegramBotsService } from './telegram-bots.service';

const logicalBot = {
  id: 'bot-1',
  workspaceId: 'workspace-1',
  label: 'Finance bot',
  isActive: true,
  applicationType: TelegramBotApplicationType.FINANCE,
  assignedMember: null,
  runtimeInstances: [
    {
      id: 'runtime-prod',
      environment: TelegramBotRuntimeEnvironment.PRODUCTION,
      runtimeStatus: TelegramBotRuntimeStatus.ACTIVE,
    },
  ],
};

function setup() {
  const prisma = {
    telegramBotIntegration: {
      findFirst: jest.fn().mockResolvedValue(logicalBot),
      findMany: jest.fn().mockResolvedValue([logicalBot]),
      create: jest.fn().mockResolvedValue({ id: 'bot-1' }),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...logicalBot, ...data }),
      ),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    telegramBotRuntimeInstance: {
      findUnique: jest.fn().mockResolvedValue(logicalBot.runtimeInstances[0]),
    },
    telegramChannelSourceAccess: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
    },
    telegramChannel: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const workspaces = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
    requireWorkspaceRole: jest.fn().mockResolvedValue({
      workspaceId: 'workspace-1',
      role: WorkspaceRole.admin,
    }),
    resolveAssignedMemberId: jest.fn().mockResolvedValue({
      workspaceId: 'workspace-1',
      assignedMemberId: null,
    }),
  };
  const runtime = {
    configureRuntime: jest.fn().mockResolvedValue({
      id: 'runtime-local',
      botId: '456',
      firstName: 'Local Finance',
      username: 'finance_local_bot',
    }),
    checkRuntime: jest.fn(),
    enableRuntime: jest.fn(),
    disableRuntime: jest.fn(),
    removeRuntime: jest.fn(),
    reconcilePresentation: jest.fn(),
  };
  const applications = {
    optionsForWorkspace: jest.fn().mockResolvedValue([]),
    isEligible: jest.fn().mockResolvedValue(true),
  };
  const views = { toView: jest.fn((row) => row) };
  const service = new TelegramBotsService(
    prisma as never,
    workspaces as never,
    { channelsForSource: jest.fn(), normalizeBotPermissions: jest.fn() } as never,
    { getChatMember: jest.fn() } as never,
    applications as never,
    runtime as never,
    { writeStructured: jest.fn() } as never,
    {} as never,
    views as never,
  );
  return { service, prisma, runtime, applications };
}

describe('TelegramBotsService runtime instances', () => {
  const previousEnvironment = process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT;

  beforeEach(() => {
    process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT = 'LOCAL';
  });

  afterAll(() => {
    if (previousEnvironment === undefined) {
      delete process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT;
    } else {
      process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT = previousEnvironment;
    }
  });

  it('connects a LOCAL runtime without creating another logical bot', async () => {
    const { service, prisma, runtime } = setup();

    await service.upsertRuntime('user-1', 'bot-1', 'LOCAL', {
      botToken: '456:local-test-token',
    });

    expect(runtime.configureRuntime).toHaveBeenCalledWith({
      botIntegrationId: 'bot-1',
      environment: TelegramBotRuntimeEnvironment.LOCAL,
      token: '456:local-test-token',
    });
    expect(prisma.telegramBotIntegration.create).not.toHaveBeenCalled();
  });

  it('rejects mutations for an environment not owned by this process', async () => {
    const { service, runtime } = setup();
    runtime.configureRuntime.mockRejectedValueOnce(new ForbiddenException());

    await expect(
      service.upsertRuntime('user-1', 'bot-1', 'PRODUCTION', {
        botToken: '123:production-token',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(runtime.configureRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: TelegramBotRuntimeEnvironment.PRODUCTION,
      }),
    );
  });

  it('checks the selected runtime after workspace isolation preflight', async () => {
    const { service, prisma, runtime } = setup();

    await service.checkRuntime('user-1', 'bot-1', 'LOCAL');

    expect(prisma.telegramBotIntegration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bot-1', workspaceId: 'workspace-1' },
      }),
    );
    expect(runtime.checkRuntime).toHaveBeenCalledWith(
      'bot-1',
      TelegramBotRuntimeEnvironment.LOCAL,
    );
  });

  it('updates logical application data and never enables a production runtime locally', async () => {
    const { service, runtime } = setup();

    await service.switchApplication('user-1', 'bot-1', {
      applicationType: TelegramBotApplicationType.GREETER,
    });

    expect(runtime.enableRuntime).not.toHaveBeenCalled();
    expect(runtime.disableRuntime).not.toHaveBeenCalled();
  });
});

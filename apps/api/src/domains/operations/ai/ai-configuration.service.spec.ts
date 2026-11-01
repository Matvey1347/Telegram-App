import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AiConfigurationService } from './ai-configuration.service';
import { AiModelRegistry } from './ai-model-registry';
import {
  AiCategoryConfigurationDto,
  AiReconciliationDto,
  AiUsageQueryDto,
  AiWorkspaceConfigurationDto,
} from './ai-usage.dto';
import { AiDeploymentConfig } from './ai-deployment-config.service';

function setup(manage = true, view = true) {
  const prisma = {
    aiWorkspaceConfig: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    aiCategoryConfig: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (run: (tx: typeof prisma) => Promise<unknown>) => run(prisma),
  );
  const context = {
    workspaceId: 'workspace-current',
    memberId: 'member-current',
    userId: 'user-current',
  };
  const authorization = {
    context: jest.fn().mockResolvedValue(context),
    require: jest
      .fn()
      .mockImplementation(() =>
        manage
          ? Promise.resolve(context)
          : Promise.reject(new ForbiddenException()),
      ),
    can: jest
      .fn()
      .mockImplementation((_user: string, key: string) =>
        Promise.resolve(key === 'operations.manageAi' ? manage : view),
      ),
  };
  const registry = new AiModelRegistry();
  const deployment = new AiDeploymentConfig({
    get: (key: string) =>
      key === 'INTERNAL_AI_OPENAI_API_KEY' ? 'test-private-api-key' : undefined,
  } as never);
  return {
    service: new AiConfigurationService(
      prisma as never,
      authorization as never,
      registry,
      deployment,
    ),
    prisma,
    authorization,
  };
}

describe('internal AI configuration', () => {
  it('returns all disabled categories without initializing configuration or exposing credentials', async () => {
    const { service, prisma } = setup();
    const result = await service.get('user-current');
    expect(result.settings).toMatchObject({
      enabled: false,
      automaticEnabled: false,
      dailyBudget: null,
      monthlyBudget: null,
      maxRequestCost: null,
    });
    expect(result.categories).toHaveLength(8);
    expect(
      result.categories.every((c) => !c.enabled && !c.automaticEnabled),
    ).toBe(true);
    expect(result.models.map((m) => m.modelId)).toEqual([
      'gpt-6-luna',
      'gpt-5.4-mini-2026-03-17',
    ]);
    expect(JSON.stringify(result)).not.toContain('test-private-api-key');
    expect(prisma.aiWorkspaceConfig.upsert).not.toHaveBeenCalled();
    expect(prisma.aiCategoryConfig.upsert).not.toHaveBeenCalled();
  });
  it('permits a configuration-only manager without granting usage reads', async () => {
    const { service } = setup(true, false);
    expect((await service.get('user-current')).canConfigure).toBe(true);
  });
  it('permits read-only view but rejects settings mutations before any transaction', async () => {
    const { service, prisma } = setup(false, true);
    expect((await service.get('user-current')).canConfigure).toBe(false);
    await expect(
      service.patchWorkspace('user-current', { enabled: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects unprivileged configuration reads without touching stored data', async () => {
    const { service, prisma } = setup(false, false);
    await expect(service.get('user-current')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.aiWorkspaceConfig.findUnique).not.toHaveBeenCalled();
  });
  it('does not write unchanged defaults or equivalent financial decimals', async () => {
    const { service, prisma } = setup();
    await service.patchWorkspace('user-current', { enabled: false });
    expect(prisma.aiWorkspaceConfig.upsert).not.toHaveBeenCalled();
    prisma.aiWorkspaceConfig.findUnique.mockResolvedValue({
      enabled: false,
      automaticEnabled: false,
      dailyBudget: new Prisma.Decimal('1.10'),
      monthlyBudget: null,
      maxRequestCost: null,
      warningPercent: 80,
    });
    await service.patchWorkspace('user-current', { dailyBudget: '1.1000' });
    expect(prisma.aiWorkspaceConfig.upsert).not.toHaveBeenCalled();
  });
  it('changes only current workspace with exact decimal strings', async () => {
    const { service, prisma } = setup();
    await service.patchWorkspace('user-current', {
      dailyBudget: '0.000000000001',
      monthlyBudget: '10',
      maxRequestCost: '0.05',
    });
    expect(prisma.aiWorkspaceConfig.upsert).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-current' },
      create: {
        workspaceId: 'workspace-current',
        dailyBudget: '0.000000000001',
        monthlyBudget: '10.000000000000',
        maxRequestCost: '0.050000000000',
      },
      update: {
        dailyBudget: '0.000000000001',
        monthlyBudget: '10.000000000000',
        maxRequestCost: '0.050000000000',
      },
    });
  });
  it.each(['', 'unapproved-model'])(
    'rejects unapproved model override %j before persistence',
    async (modelId) => {
      const { service, prisma } = setup();
      await expect(
        service.patchCategory('user-current', 'SALES_FIRST_DRAFT', { modelId }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.aiCategoryConfig.upsert).not.toHaveBeenCalled();
    },
  );
  it('rejects unknown category, negative/float costs and hidden provider/schema overrides', async () => {
    const { service, prisma } = setup();
    await expect(
      service.patchCategory('user-current', 'UNAPPROVED' as never, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.patchWorkspace('user-current', { dailyBudget: '-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.patchWorkspace('user-current', { dailyBudget: 0.1 } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.patchCategory('user-current', 'SUPPORT_ASSISTANT', {
        schemaId: 'arbitrary',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.aiCategoryConfig.upsert).not.toHaveBeenCalled();
  });
  it('updates category configuration with whitelist and version without changing another category', async () => {
    const { service, prisma } = setup();
    await service.patchCategory('user-current', 'LEAD_QUALIFICATION', {
      modelId: 'gpt-5.4-mini-2026-03-17',
      maxInputTokens: 32768,
    });
    expect(prisma.aiCategoryConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_category: {
            workspaceId: 'workspace-current',
            category: 'LEAD_QUALIFICATION',
          },
        },
        update: {
          modelId: 'gpt-5.4-mini-2026-03-17',
          maxInputTokens: 32768,
          version: { increment: 1 },
        },
      }),
    );
  });
  it('does not create rows for a no-op category patch', async () => {
    const { service, prisma } = setup();
    await service.patchCategory('user-current', 'LEAD_QUALIFICATION', {
      enabled: false,
      maxInputTokens: 8000,
    });
    expect(prisma.aiCategoryConfig.upsert).not.toHaveBeenCalled();
  });
});

describe('AI configuration DTO contracts', () => {
  it.each([
    { enabled: null },
    { dailyBudget: -1 },
    { dailyBudget: 'NaN' },
    { dailyBudget: '1e6' },
    { warningPercent: 101 },
  ])('rejects unsafe workspace input %j', async (value) => {
    expect(
      await validate(plainToInstance(AiWorkspaceConfigurationDto, value)),
    ).not.toHaveLength(0);
  });
  it('accepts the exact approved category caps and nullable budgets', async () => {
    expect(
      await validate(
        plainToInstance(AiCategoryConfigurationDto, {
          maxInputTokens: 32768,
          maxOutputTokens: 8000,
          timeoutMs: 60000,
          concurrencyLimit: 8,
          dailyBudget: null,
        }),
      ),
    ).toHaveLength(0);
  });
  it('transforms unresolved query booleans without accepting arbitrary text', async () => {
    expect(
      plainToInstance(AiUsageQueryDto, { unresolved: 'true' }).unresolved,
    ).toBe(true);
    expect(
      await validate(
        plainToInstance(AiUsageQueryDto, { unresolved: 'unknown' }),
      ),
    ).not.toHaveLength(0);
  });
  it('requires safe explicit reconciliation evidence and financial string', async () => {
    expect(
      await validate(
        plainToInstance(AiReconciliationDto, {
          actualCost: '0',
          evidence: 'invoice:verified-reference',
        }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(AiReconciliationDto, {
          actualCost: '0',
          evidence: 'private message transcript',
        }),
      ),
    ).not.toHaveLength(0);
  });
});

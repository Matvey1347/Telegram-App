import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AI_CATEGORIES,
  type AiCategory,
  type AiCategoryConfigurationPatch,
  type AiConfiguration,
  type AiWorkspaceConfiguration,
  type AiWorkspaceConfigurationPatch,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { AiDeploymentConfig } from './ai-deployment-config.service';
import { AiModelRegistry } from './ai-model-registry';

export const AI_WORKSPACE_DEFAULTS: AiWorkspaceConfiguration = {
  enabled: false,
  automaticEnabled: false,
  dailyBudget: null,
  monthlyBudget: null,
  maxRequestCost: null,
  warningPercent: 80,
};
const moneyFields = new Set(['dailyBudget', 'monthlyBudget', 'maxRequestCost']);
const booleans = new Set(['enabled', 'automaticEnabled']);
const bounds: Record<string, [number, number]> = {
  warningPercent: [1, 100],
  maxInputTokens: [64, 32768],
  maxOutputTokens: [16, 8000],
  timeoutMs: [1000, 60000],
  concurrencyLimit: [1, 8],
};

/** Normalize financial strings without floating point, and reject unsupported overrides. */
function normalize(patch: Record<string, unknown>, allowed: readonly string[]) {
  const values: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (!allowed.includes(key))
      throw new BadRequestException('Unsupported AI configuration field');
    if (moneyFields.has(key)) {
      if (value === null) {
        values[key] = null;
        continue;
      }
      if (
        typeof value !== 'string' ||
        !/^(0|[1-9]\d{0,6})(\.\d{1,12})?$/.test(value)
      )
        throw new BadRequestException(
          'Budget must be a nonnegative USD decimal string',
        );
      values[key] = new Prisma.Decimal(value).toFixed(12);
    } else if (booleans.has(key)) {
      if (typeof value !== 'boolean')
        throw new BadRequestException('AI toggle must be boolean');
      values[key] = value;
    } else if (bounds[key]) {
      const [min, max] = bounds[key];
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < min ||
        value > max
      )
        throw new BadRequestException('AI configuration limit is out of range');
      values[key] = value;
    } else {
      if (typeof value !== 'string')
        throw new BadRequestException('Invalid AI model');
      values[key] = value;
    }
  }
  return values;
}
function changed(patch: ReturnType<typeof normalize>, current: object) {
  return Object.fromEntries(
    Object.entries(patch).filter(
      ([key, value]) => value !== (current as Record<string, unknown>)[key],
    ),
  );
}

@Injectable()
export class AiConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly registry: AiModelRegistry,
    private readonly deployment: AiDeploymentConfig,
  ) {}

  async get(userId: string): Promise<AiConfiguration> {
    const access = await this.authorization.context(userId);
    const [canView, canConfigure] = await Promise.all([
      this.authorization.can(userId, 'operations.viewAiUsage'),
      this.authorization.can(userId, 'operations.manageAi'),
    ]);
    if (!canView && !canConfigure)
      throw new ForbiddenException('Missing AI usage permission');
    const [row, categories] = await Promise.all([
      this.prisma.aiWorkspaceConfig.findUnique({
        where: { workspaceId: access.workspaceId },
      }),
      this.prisma.aiCategoryConfig.findMany({
        where: { workspaceId: access.workspaceId },
        take: AI_CATEGORIES.length,
      }),
    ]);
    const byCategory = new Map(categories.map((item) => [item.category, item]));
    return {
      workspaceId: access.workspaceId,
      canConfigure,
      providerConfigured: this.deployment.configured,
      deploymentEnabled: this.deployment.enabled,
      currency: 'USD',
      models: this.registry.models(),
      settings: row
        ? {
            enabled: row.enabled,
            automaticEnabled: row.automaticEnabled,
            dailyBudget: row.dailyBudget?.toFixed(12) ?? null,
            monthlyBudget: row.monthlyBudget?.toFixed(12) ?? null,
            maxRequestCost: row.maxRequestCost?.toFixed(12) ?? null,
            warningPercent: row.warningPercent,
          }
        : { ...AI_WORKSPACE_DEFAULTS },
      categories: AI_CATEGORIES.map((category) =>
        this.registry.resolve(category, byCategory.get(category)),
      ),
    };
  }

  async patchWorkspace(userId: string, patch: AiWorkspaceConfigurationPatch) {
    const access = await this.authorization.require(
      userId,
      'operations.manageAi',
    );
    const values = normalize(patch, Object.keys(AI_WORKSPACE_DEFAULTS));
    await this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(
        tx,
        `internal-ai:${access.workspaceId}`,
      );
      const row = await tx.aiWorkspaceConfig.findUnique({
        where: { workspaceId: access.workspaceId },
      });
      const current = row
        ? {
            ...row,
            dailyBudget: row.dailyBudget?.toFixed(12) ?? null,
            monthlyBudget: row.monthlyBudget?.toFixed(12) ?? null,
            maxRequestCost: row.maxRequestCost?.toFixed(12) ?? null,
          }
        : AI_WORKSPACE_DEFAULTS;
      const changes = changed(values, current);
      if (!Object.keys(changes).length) return;
      await tx.aiWorkspaceConfig.upsert({
        where: { workspaceId: access.workspaceId },
        create: { workspaceId: access.workspaceId, ...changes },
        update: changes,
      });
    });
    return this.get(userId);
  }

  async patchCategory(
    userId: string,
    category: AiCategory,
    patch: AiCategoryConfigurationPatch,
  ) {
    const access = await this.authorization.require(
      userId,
      'operations.manageAi',
    );
    if (!AI_CATEGORIES.includes(category))
      throw new BadRequestException('Unknown AI category');
    const values = normalize(patch, [
      'modelId',
      'enabled',
      'automaticEnabled',
      'dailyBudget',
      'monthlyBudget',
      'maxRequestCost',
      'maxInputTokens',
      'maxOutputTokens',
      'timeoutMs',
      'concurrencyLimit',
    ]);
    if (
      values.modelId !== undefined &&
      !this.registry.price(String(values.modelId))
    )
      throw new BadRequestException('Unsupported AI model');
    await this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(
        tx,
        `internal-ai:${access.workspaceId}`,
      );
      const where = {
        workspaceId_category: { workspaceId: access.workspaceId, category },
      };
      const row = await tx.aiCategoryConfig.findUnique({ where });
      const current = this.registry.resolve(category, row);
      const changes = changed(values, current);
      if (!Object.keys(changes).length) return;
      const defaults = this.registry.category(category);
      await tx.aiCategoryConfig.upsert({
        where,
        create: {
          workspaceId: access.workspaceId,
          category,
          modelId: defaults.modelId,
          enabled: defaults.enabled,
          automaticEnabled: defaults.automaticEnabled,
          maxInputTokens: defaults.maxInputTokens,
          maxOutputTokens: defaults.maxOutputTokens,
          timeoutMs: defaults.timeoutMs,
          concurrencyLimit: defaults.concurrencyLimit,
          ...changes,
        },
        update: { ...changes, version: { increment: 1 } },
      });
    });
    return this.get(userId);
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FinanceAiConnectionStatus, FinanceAiProvider, WorkspaceRole } from '@prisma/client';
import { TokenEncryptionService } from '../../../../common/security/token-encryption.service';
import { WorkspaceService } from '../../../../common/workspace.service';
import { PrismaService } from '../../../../prisma/prisma.service';

const DEFAULT_MODEL = 'gpt-5.6-luna';

@Injectable()
export class FinanceAiConfigService {
  constructor(private readonly prisma: PrismaService, private readonly workspace: WorkspaceService, private readonly encryption: TokenEncryptionService) {}

  private async bot(userId: string, botIntegrationId: string) {
    const membership = await this.workspace.requireWorkspaceRole(userId, [WorkspaceRole.owner, WorkspaceRole.admin]);
    const bot = await this.prisma.telegramBotIntegration.findFirst({ where: { id: botIntegrationId, workspaceId: membership.workspaceId }, select: { id: true, workspaceId: true } });
    if (!bot) throw new NotFoundException('Telegram bot not found');
    return bot;
  }

  private view(row: { model: string; apiKeyEncrypted: string | null; connectionStatus: FinanceAiConnectionStatus; lastCheckedAt: Date | null; lastValidationError: string | null } | null, source: 'WORKSPACE_DEFAULT' | 'BOT_OVERRIDE' | 'NONE') {
    return { provider: FinanceAiProvider.OPENAI, model: row?.model || DEFAULT_MODEL, source, status: row?.connectionStatus || FinanceAiConnectionStatus.NOT_CONFIGURED, apiKeyConfigured: Boolean(row?.apiKeyEncrypted), lastCheckedAt: row?.lastCheckedAt?.toISOString() || null, lastValidationError: row?.lastValidationError || null };
  }

  async resolved(userId: string, botIntegrationId: string) {
    const bot = await this.bot(userId, botIntegrationId);
    const rows = await this.prisma.financeAiProviderConfig.findMany({ where: { workspaceId: bot.workspaceId, provider: FinanceAiProvider.OPENAI, OR: [{ botIntegrationId }, { botIntegrationId: null }] } });
    const override = rows.find((row) => row.botIntegrationId === botIntegrationId);
    const fallback = rows.find((row) => row.botIntegrationId === null);
    return this.view(override || fallback || null, override ? 'BOT_OVERRIDE' : fallback ? 'WORKSPACE_DEFAULT' : 'NONE');
  }

  async workspaceResolved(userId: string) {
    const membership = await this.workspace.requireWorkspaceRole(userId, [WorkspaceRole.owner, WorkspaceRole.admin]);
    const row = await this.prisma.financeAiProviderConfig.findFirst({ where: { workspaceId: membership.workspaceId, botIntegrationId: null, provider: FinanceAiProvider.OPENAI }, orderBy: { createdAt: 'desc' } });
    return this.view(row, row ? 'WORKSPACE_DEFAULT' : 'NONE');
  }

  async save(userId: string, input: { botIntegrationId?: string; apiKey?: string; model?: string }) {
    const membership = await this.workspace.requireWorkspaceRole(userId, [WorkspaceRole.owner, WorkspaceRole.admin]);
    if (input.botIntegrationId) await this.bot(userId, input.botIntegrationId);
    const apiKey = input.apiKey?.trim();
    // PostgreSQL treats NULL values as distinct in a compound unique index, so
    // workspace defaults must be resolved explicitly rather than upserted.
    const existing = await this.prisma.financeAiProviderConfig.findFirst({ where: { workspaceId: membership.workspaceId, botIntegrationId: input.botIntegrationId || null, provider: FinanceAiProvider.OPENAI }, select: { id: true } });
    if (!existing && !apiKey) {
      throw new BadRequestException('An OpenAI API key is required for a new configuration');
    }
    const encrypted = apiKey ? this.encryption.encrypt(apiKey) : null;
    const data = {
      ...(encrypted ? { apiKeyEncrypted: encrypted.encrypted, apiKeyIv: encrypted.iv, apiKeyAuthTag: encrypted.authTag } : {}),
      ...(input.model?.trim() ? { model: input.model.trim() } : {}),
      connectionStatus: FinanceAiConnectionStatus.NOT_CONFIGURED,
      lastCheckedAt: null,
      lastValidationError: null,
    };
    const row = existing
      ? await this.prisma.financeAiProviderConfig.update({ where: { id: existing.id }, data })
      : await this.prisma.financeAiProviderConfig.create({ data: { workspaceId: membership.workspaceId, botIntegrationId: input.botIntegrationId || null, provider: FinanceAiProvider.OPENAI, model: input.model?.trim() || DEFAULT_MODEL, ...data } });
    return this.view(row, input.botIntegrationId ? 'BOT_OVERRIDE' : 'WORKSPACE_DEFAULT');
  }

  async validate(userId: string, botIntegrationId: string) {
    const bot = await this.bot(userId, botIntegrationId);
    const rows = await this.prisma.financeAiProviderConfig.findMany({ where: { workspaceId: bot.workspaceId, provider: FinanceAiProvider.OPENAI, OR: [{ botIntegrationId }, { botIntegrationId: null }] } });
    const config = rows.find((row) => row.botIntegrationId === botIntegrationId) || rows.find((row) => row.botIntegrationId === null);
    if (!config?.apiKeyEncrypted || !config.apiKeyIv || !config.apiKeyAuthTag) return this.view(config || null, config?.botIntegrationId ? 'BOT_OVERRIDE' : config ? 'WORKSPACE_DEFAULT' : 'NONE');
    let error: string | null = null;
    try {
      const key = this.encryption.decrypt({ encrypted: config.apiKeyEncrypted, iv: config.apiKeyIv, authTag: config.apiKeyAuthTag });
      const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(config.model)}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8_000) });
      if (!response.ok) error = response.status === 401 ? 'OpenAI key is invalid.' : `OpenAI model check failed (${response.status}).`;
    } catch {
      error = 'Could not reach OpenAI to validate this configuration.';
    }
    const row = await this.prisma.financeAiProviderConfig.update({ where: { id: config.id }, data: { connectionStatus: error ? FinanceAiConnectionStatus.INVALID : FinanceAiConnectionStatus.CONNECTED, lastCheckedAt: new Date(), lastValidationError: error } });
    return this.view(row, config.botIntegrationId ? 'BOT_OVERRIDE' : 'WORKSPACE_DEFAULT');
  }

  async useWorkspaceDefault(userId: string, botIntegrationId: string) {
    const bot = await this.bot(userId, botIntegrationId);
    await this.prisma.financeAiProviderConfig.deleteMany({ where: { workspaceId: bot.workspaceId, botIntegrationId, provider: FinanceAiProvider.OPENAI } });
    const fallback = await this.prisma.financeAiProviderConfig.findFirst({ where: { workspaceId: bot.workspaceId, botIntegrationId: null, provider: FinanceAiProvider.OPENAI } });
    return this.view(fallback, fallback ? 'WORKSPACE_DEFAULT' : 'NONE');
  }
}

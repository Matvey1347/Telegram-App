import { BadRequestException } from '@nestjs/common';
import {
  BotBillingConnectionStatus,
  BotBillingProvider,
  BotBillingProviderMode,
} from '@prisma/client';
import type { BotBillingProviderConfigView } from '@telegram-system/shared';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BILLING_PROVIDER_CAPABILITIES } from './bot-billing.providers';
import { UpsertBillingProviderConfigDto } from './dto';
import { StripeBillingProvider } from './stripe-billing.provider';

type Mode = 'TEST' | 'LIVE';
type Provider = 'STRIPE' | 'TELEGRAM_STARS';

export class BotBillingProviderSettings {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: TokenEncryptionService,
    private readonly stripe: StripeBillingProvider,
    private readonly admin: (
      userId: string,
    ) => ReturnType<WorkspaceService['requireWorkspaceRole']>,
    private readonly bot: (
      userId: string,
      botIntegrationId: string,
    ) => Promise<{ id: string; workspaceId: string }>,
    private readonly audit: (
      workspaceId: string,
      userId: string,
      event: string,
      metadata: Record<string, unknown>,
    ) => void,
  ) {}

  private mask(value?: string | null) {
    if (!value) return null;
    return value.length <= 8
      ? '••••'
      : `${value.slice(0, 4)}••••${value.slice(-4)}`;
  }

  private toProviderView(
    row: {
      provider: BotBillingProvider;
      mode: BotBillingProviderMode;
      connectionStatus: BotBillingConnectionStatus;
      publicKey: string | null;
      publicKeyMasked: string | null;
      secretKeyEncrypted: string | null;
      webhookSecretEncrypted: string | null;
      lastCheckedAt: Date | null;
      lastValidationError: string | null;
    } | null,
    provider: Provider,
    mode: Mode,
    source: BotBillingProviderConfigView['source'],
  ): BotBillingProviderConfigView {
    return {
      provider,
      mode,
      source,
      status: row?.connectionStatus || 'NOT_CONFIGURED',
      publicKeyConfigured: Boolean(row?.publicKey || row?.publicKeyMasked),
      publicKeyMasked: row?.publicKeyMasked || null,
      secretKeyConfigured: Boolean(row?.secretKeyEncrypted),
      webhookSecretConfigured: Boolean(row?.webhookSecretEncrypted),
      lastCheckedAt: row?.lastCheckedAt?.toISOString() || null,
      lastValidationError: row?.lastValidationError || null,
      capabilities: BILLING_PROVIDER_CAPABILITIES[provider],
    };
  }

  private nonBlank(value: string | undefined) {
    return value?.trim() || undefined;
  }

  private validateStripeCredential(
    value: string,
    mode: Mode,
    kind: 'public' | 'secret' | 'webhook',
  ) {
    const valid =
      kind === 'webhook'
        ? /^whsec_[A-Za-z0-9]+$/.test(value)
        : kind === 'public'
          ? new RegExp(`^pk_${mode.toLowerCase()}_[A-Za-z0-9]+$`).test(value)
          : new RegExp(`^(?:sk|rk)_${mode.toLowerCase()}_[A-Za-z0-9]+$`).test(
              value,
            );
    if (!valid)
      throw new BadRequestException(
        kind === 'webhook'
          ? 'Stripe webhook signing secret is invalid'
          : `Stripe ${kind} key does not match ${mode} mode`,
      );
  }

  async providerResolution(userId: string, botIntegrationId: string) {
    const bot = await this.bot(userId, botIntegrationId);
    const rows = await this.prisma.botBillingProviderConfig.findMany({
      where: {
        workspaceId: bot.workspaceId,
        OR: [{ botIntegrationId }, { botIntegrationId: null }],
      },
    });
    return (['STRIPE', 'TELEGRAM_STARS'] as const).flatMap((provider) =>
      (['TEST', 'LIVE'] as const).map((mode) => {
        const override = rows.find(
          (row) =>
            row.provider === provider &&
            row.mode === mode &&
            row.botIntegrationId === botIntegrationId,
        );
        const defaultConfig = rows.find(
          (row) =>
            row.provider === provider &&
            row.mode === mode &&
            row.botIntegrationId === null,
        );
        return this.toProviderView(
          override || defaultConfig || null,
          provider,
          mode,
          override
            ? 'BOT_OVERRIDE'
            : defaultConfig
              ? 'WORKSPACE_DEFAULT'
              : 'NONE',
        );
      }),
    );
  }

  async workspaceProviderResolution(userId: string) {
    const membership = await this.admin(userId);
    const rows = await this.prisma.botBillingProviderConfig.findMany({
      where: { workspaceId: membership.workspaceId, botIntegrationId: null },
      orderBy: { createdAt: 'desc' },
    });
    return (['STRIPE', 'TELEGRAM_STARS'] as const).flatMap((provider) =>
      (['TEST', 'LIVE'] as const).map((mode) => {
        const row = rows.find(
          (item) => item.provider === provider && item.mode === mode,
        );
        return this.toProviderView(
          row || null,
          provider,
          mode,
          row ? 'WORKSPACE_DEFAULT' : 'NONE',
        );
      }),
    );
  }

  async removeWorkspaceProviderDefault(
    userId: string,
    provider: Provider,
    mode: Mode,
  ) {
    const membership = await this.admin(userId);
    await this.prisma.botBillingProviderConfig.deleteMany({
      where: {
        workspaceId: membership.workspaceId,
        botIntegrationId: null,
        provider,
        mode,
      },
    });
    this.audit(
      membership.workspaceId,
      userId,
      'billing.workspace_provider_disabled',
      { provider, mode },
    );
    return this.toProviderView(null, provider, mode, 'NONE');
  }

  async saveProviderConfig(
    userId: string,
    input: {
      botIntegrationId?: string;
      provider: Provider;
      mode: Mode;
      dto: UpsertBillingProviderConfigDto;
    },
  ) {
    const membership = await this.admin(userId);
    if (input.botIntegrationId) await this.bot(userId, input.botIntegrationId);
    const data = input.dto;
    const secretValue = this.nonBlank(data.secretKey);
    const webhookValue = this.nonBlank(data.webhookSecret);
    const publicKey = this.nonBlank(data.publicKey);
    if (input.provider === 'STRIPE') {
      if (secretValue)
        this.validateStripeCredential(secretValue, input.mode, 'secret');
      if (webhookValue)
        this.validateStripeCredential(webhookValue, input.mode, 'webhook');
      if (publicKey)
        this.validateStripeCredential(publicKey, input.mode, 'public');
    }
    const secret = secretValue
      ? this.encryption.encrypt(secretValue)
      : undefined;
    const webhook = webhookValue
      ? this.encryption.encrypt(webhookValue)
      : undefined;
    const identity = {
      workspaceId: membership.workspaceId,
      botIntegrationId: input.botIntegrationId || null,
      provider: input.provider,
      mode: input.mode,
    };
    const values = {
      ...(secret
        ? {
            secretKeyEncrypted: secret.encrypted,
            secretKeyIv: secret.iv,
            secretKeyAuthTag: secret.authTag,
          }
        : {}),
      ...(webhook
        ? {
            webhookSecretEncrypted: webhook.encrypted,
            webhookSecretIv: webhook.iv,
            webhookSecretAuthTag: webhook.authTag,
          }
        : {}),
      ...(publicKey
        ? { publicKey, publicKeyMasked: this.mask(publicKey) }
        : {}),
      connectionStatus: BotBillingConnectionStatus.NOT_CONFIGURED,
      lastValidationError: null,
    };
    const existing = await this.prisma.botBillingProviderConfig.findFirst({
      where: identity,
    });
    // A first override inherits the complete resolved default. Blank inputs
    // therefore preserve effective credentials instead of shadowing them.
    const inherited =
      !existing && input.botIntegrationId
        ? await this.prisma.botBillingProviderConfig.findFirst({
            where: {
              workspaceId: membership.workspaceId,
              botIntegrationId: null,
              provider: input.provider,
              mode: input.mode,
            },
            orderBy: { createdAt: 'desc' },
          })
        : null;
    let config = existing
      ? await this.prisma.botBillingProviderConfig.update({
          where: { id: existing.id },
          data: values,
        })
      : await this.prisma.botBillingProviderConfig.create({
          data: {
            ...identity,
            ...(inherited
              ? {
                  secretKeyEncrypted: inherited.secretKeyEncrypted,
                  secretKeyIv: inherited.secretKeyIv,
                  secretKeyAuthTag: inherited.secretKeyAuthTag,
                  webhookSecretEncrypted: inherited.webhookSecretEncrypted,
                  webhookSecretIv: inherited.webhookSecretIv,
                  webhookSecretAuthTag: inherited.webhookSecretAuthTag,
                  publicKey: inherited.publicKey,
                  publicKeyMasked: inherited.publicKeyMasked,
                }
              : {}),
            ...values,
          },
        });
    if (input.provider === 'STRIPE') {
      if (
        !config.secretKeyEncrypted ||
        !config.secretKeyIv ||
        !config.secretKeyAuthTag ||
        !config.webhookSecretEncrypted ||
        !config.webhookSecretIv ||
        !config.webhookSecretAuthTag
      ) {
        config = await this.prisma.botBillingProviderConfig.update({
          where: { id: config.id },
          data: {
            connectionStatus: BotBillingConnectionStatus.NOT_CONFIGURED,
            lastCheckedAt: new Date(),
            lastValidationError: !config.secretKeyEncrypted
              ? 'Stripe secret key is required'
              : 'Stripe webhook secret is required',
          },
        });
      } else {
        const key = this.encryption.decrypt({
          encrypted: config.secretKeyEncrypted,
          iv: config.secretKeyIv,
          authTag: config.secretKeyAuthTag,
        });
        const validation = await this.stripe.validateKey(key, input.mode);
        config = await this.prisma.botBillingProviderConfig.update({
          where: { id: config.id },
          data: {
            connectionStatus: validation.status,
            lastCheckedAt: new Date(),
            lastValidationError: validation.error,
          },
        });
      }
    }
    if (input.provider === 'TELEGRAM_STARS')
      config = await this.prisma.botBillingProviderConfig.update({
        where: { id: config.id },
        data: {
          connectionStatus: BotBillingConnectionStatus.CONNECTED,
          lastCheckedAt: new Date(),
          lastValidationError: null,
        },
      });
    this.audit(
      membership.workspaceId,
      userId,
      'billing.provider_config_changed',
      {
        provider: input.provider,
        mode: input.mode,
        botIntegrationId: input.botIntegrationId || null,
      },
    );
    return this.toProviderView(
      config,
      input.provider,
      input.mode,
      input.botIntegrationId ? 'BOT_OVERRIDE' : 'WORKSPACE_DEFAULT',
    );
  }

  async useWorkspaceProviderDefault(
    userId: string,
    botIntegrationId: string,
    provider: Provider,
    mode: Mode,
  ) {
    const bot = await this.bot(userId, botIntegrationId);
    await this.prisma.botBillingProviderConfig.deleteMany({
      where: { workspaceId: bot.workspaceId, botIntegrationId, provider, mode },
    });
    const fallback = await this.prisma.botBillingProviderConfig.findFirst({
      where: {
        workspaceId: bot.workspaceId,
        botIntegrationId: null,
        provider,
        mode,
      },
    });
    this.audit(bot.workspaceId, userId, 'billing.provider_override_reset', {
      provider,
      mode,
      botIntegrationId,
    });
    return this.toProviderView(
      fallback,
      provider,
      mode,
      fallback ? 'WORKSPACE_DEFAULT' : 'NONE',
    );
  }
}

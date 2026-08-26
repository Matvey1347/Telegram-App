import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import {
  publicApiOrigin,
  publicWebOrigin,
} from '../../../config/deployment-config';

type SystemBotEnvironment = 'LOCAL' | 'PRODUCTION';
type SystemBotAuditCredential = {
  environment: SystemBotEnvironment;
  token: string | null;
  username: string | null;
  selected: boolean;
};

@Injectable()
export class TelegramSystemBotConfigService {
  private generatedWebhookSecret: string | null = null;

  constructor(private readonly config: ConfigService) {}

  get environment(): 'LOCAL' | 'PRODUCTION' | null {
    const value = this.config
      .get<string>('TELEGRAM_SYSTEM_BOT_ENVIRONMENT')
      ?.trim();
    return value === 'LOCAL' || value === 'PRODUCTION' ? value : null;
  }

  get token() {
    return this.environmentValue('TOKEN');
  }

  get configured() {
    return Boolean(this.token);
  }

  get username() {
    return this.environmentValue('USERNAME');
  }

  auditCredentials(): SystemBotAuditCredential[] {
    const environments: readonly SystemBotEnvironment[] =
      this.environment === 'LOCAL'
        ? ['LOCAL', 'PRODUCTION']
        : this.environment === 'PRODUCTION'
          ? ['PRODUCTION']
          : [];
    return environments.map((environment) => ({
      environment,
      token: this.valueForEnvironment(environment, 'TOKEN'),
      username: this.valueForEnvironment(environment, 'USERNAME'),
      selected: environment === this.environment,
    }));
  }

  get frontendUrl() {
    return (
      publicWebOrigin({
        FRONTEND_URL: this.config.get<string>('FRONTEND_URL'),
      }) || null
    );
  }

  get webhookUrl() {
    const base = publicApiOrigin({
      API_PUBLIC_URL: this.config.get<string>('API_PUBLIC_URL'),
    });
    if (!base) return null;
    return `${base}${base.endsWith('/api') ? '' : '/api'}/telegram/system-bot/webhook`;
  }

  createWebhookSecret() {
    return randomBytes(32).toString('base64url');
  }

  expectedWebhookSecret() {
    const configured = this.environmentValue('WEBHOOK_SECRET');
    if (configured) return configured;
    this.generatedWebhookSecret ??= this.createWebhookSecret();
    return this.generatedWebhookSecret;
  }

  validatesWebhookSecret(candidate?: string) {
    const expected = this.expectedWebhookSecret();
    if (!expected || !candidate) return false;
    const expectedBuffer = Buffer.from(expected);
    const candidateBuffer = Buffer.from(candidate);
    return (
      expectedBuffer.length === candidateBuffer.length &&
      timingSafeEqual(expectedBuffer, candidateBuffer)
    );
  }

  hashLinkToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private environmentValue(suffix: 'TOKEN' | 'USERNAME' | 'WEBHOOK_SECRET') {
    const environment = this.environment;
    if (!environment) return null;
    return this.valueForEnvironment(environment, suffix);
  }

  private valueForEnvironment(
    environment: 'LOCAL' | 'PRODUCTION',
    suffix: 'TOKEN' | 'USERNAME' | 'WEBHOOK_SECRET',
  ) {
    return (
      this.config
        .get<string>(`TELEGRAM_SYSTEM_BOT_${environment}_${suffix}`)
        ?.trim() || null
    );
  }
}

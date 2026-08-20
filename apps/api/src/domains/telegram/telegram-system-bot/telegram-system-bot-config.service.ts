import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

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

  get frontendUrl() {
    const value = this.config.get<string>('FRONTEND_URL');
    return value?.replace(/\/$/, '') || null;
  }

  get webhookUrl() {
    const base = this.config
      .get<string>('TELEGRAM_SYSTEM_BOT_WEBHOOK_BASE_URL')
      ?.replace(/\/$/, '');
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
    return (
      this.config
        .get<string>(`TELEGRAM_SYSTEM_BOT_${environment}_${suffix}`)
        ?.trim() || null
    );
  }
}

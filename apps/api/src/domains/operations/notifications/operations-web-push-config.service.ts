import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type WebPushConfig = {
  enabled: true;
  subject: string;
  publicKey: string;
  privateKey: string;
};

@Injectable()
export class OperationsWebPushConfigService {
  private readonly value: WebPushConfig | { enabled: false };

  constructor(config: ConfigService) {
    const subject = config.get<string>('WEB_PUSH_VAPID_SUBJECT')?.trim() ?? '';
    const publicKey =
      config.get<string>('WEB_PUSH_VAPID_PUBLIC_KEY')?.trim() ?? '';
    const privateKey =
      config.get<string>('WEB_PUSH_VAPID_PRIVATE_KEY')?.trim() ?? '';
    if (!subject && !publicKey && !privateKey) {
      this.value = { enabled: false };
      return;
    }
    if (!subject || !publicKey || !privateKey) {
      throw new Error('Web Push VAPID configuration must be atomic');
    }
    if (!this.validSubject(subject)) {
      throw new Error('WEB_PUSH_VAPID_SUBJECT must be mailto: or https:');
    }
    if (!this.validKey(publicKey) || !this.validKey(privateKey)) {
      throw new Error('Web Push VAPID keys must be base64url values');
    }
    this.value = { enabled: true, subject, publicKey, privateKey };
  }

  get() {
    return this.value;
  }

  publicConfig() {
    return this.value.enabled
      ? { enabled: true, publicKey: this.value.publicKey }
      : { enabled: false, publicKey: null };
  }

  private validSubject(value: string) {
    if (value.startsWith('mailto:')) return value.length > 'mailto:'.length;
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }

  private validKey(value: string) {
    return value.length >= 32 && /^[A-Za-z0-9_-]+$/.test(value);
  }
}

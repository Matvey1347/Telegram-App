import { ForbiddenException, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { FinanceRuntimeConfig } from '../config/finance-runtime-config';

export interface FinanceSession {
  financeBotId: string;
  financeTelegramUserId: string;
  profileId: string;
  expiresAt: number;
  surface?: 'EXTERNAL_WEB' | 'TELEGRAM_MINI_APP';
}

@Injectable()
export class FinanceSessionService {
  constructor(private readonly config: FinanceRuntimeConfig) {}

  issue(subject: Omit<FinanceSession, 'expiresAt'>, now = Date.now()) {
    const payload: FinanceSession = { ...subject, expiresAt: now + 8 * 60 * 60 * 1000 };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.sign(encoded)}`;
  }

  authenticate(authorization: string | undefined, expectedBotId?: string) {
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined;
    if (!token) throw new ForbiddenException('Finance session is required');
    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra || !this.safeEqual(this.sign(encoded), signature)) {
      throw new ForbiddenException('Finance session is invalid');
    }
    try {
      const session = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as FinanceSession;
      if (
        !session.financeBotId ||
        !session.financeTelegramUserId ||
        !session.profileId ||
        !Number.isSafeInteger(session.expiresAt) ||
        session.expiresAt <= Date.now() ||
        (expectedBotId && session.financeBotId !== expectedBotId)
      ) {
        throw new Error('invalid claims');
      }
      return session;
    } catch {
      throw new ForbiddenException('Finance session is invalid');
    }
  }

  authenticateBrowser(authorization: string | undefined, cookie: string | undefined, origin: string | undefined, expectedBotId: string, mutating = false) {
    if (authorization?.startsWith('Bearer ')) return this.authenticate(authorization, expectedBotId);
    if (mutating && (!origin || origin !== this.config.webPublicUrl)) throw new ForbiddenException('Finance billing origin is invalid');
    const token = cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('finance_session='))?.slice('finance_session='.length);
    return this.authenticate(token ? `Bearer ${token}` : undefined, expectedBotId);
  }

  assertExternalCheckout(session: FinanceSession) {
    if (session.surface !== 'EXTERNAL_WEB') {
      throw new ForbiddenException('Checkout requires an external Finance Web session');
    }
  }

  verifyBootstrap(
    financeBotId: string,
    telegramUserId: string,
    issuedAt: number,
    signature: string,
  ) {
    if (!Number.isSafeInteger(issuedAt) || Math.abs(Date.now() - issuedAt) > 5 * 60 * 1000) {
      throw new ForbiddenException('Finance bootstrap proof is expired');
    }
    const payload = `${financeBotId}:${telegramUserId}:${issuedAt}`;
    if (!this.safeEqual(this.bootstrapSignature(payload), signature)) {
      throw new ForbiddenException('Finance bootstrap proof is invalid');
    }
  }

  bootstrapSignature(payload: string) {
    return createHmac('sha256', this.config.bootstrapSigningKey).update(payload).digest('base64url');
  }

  private sign(payload: string) {
    return createHmac('sha256', this.config.sessionSigningKey).update(payload).digest('base64url');
  }

  private safeEqual(expected: string, actual: string) {
    const left = Buffer.from(expected);
    const right = Buffer.from(actual);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}

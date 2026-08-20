import { ForbiddenException, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

export type FinanceConsumerSession = {
  profileId: string;
  botIntegrationId: string;
  telegramBotUserId: string;
  telegramChatId?: string | null;
  workspaceId: string;
  defaultCurrency: string;
};

type SignedSession = FinanceConsumerSession & {
  exp: number;
  scope: 'finance-consumer';
};

const COOKIE_NAME = 'finance_consumer_session';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30;

/** Stateless, consumer-only session. It deliberately shares neither secret nor claims with dashboard JWTs. */
@Injectable()
export class FinanceConsumerSessionService {
  issue(context: FinanceConsumerSession, now = new Date()) {
    const ttl = Number(
      process.env.FINANCE_CONSUMER_SESSION_TTL_SECONDS || DEFAULT_TTL_SECONDS,
    );
    const payload: SignedSession = {
      ...context,
      scope: 'finance-consumer',
      exp:
        Math.floor(now.getTime() / 1000) +
        (Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TTL_SECONDS),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.sign(encoded)}`;
  }

  fromRequest(
    request: Request,
    expectedBotIntegrationId: string,
  ): FinanceConsumerSession {
    const value = this.cookie(request.headers.cookie, COOKIE_NAME);
    if (!value)
      throw new ForbiddenException('Finance consumer session is required');
    const session = this.verify(value);
    if (session.botIntegrationId !== expectedBotIntegrationId) {
      throw new ForbiddenException(
        'Finance consumer session belongs to another bot',
      );
    }
    return session;
  }

  verify(value: string, now = new Date()): FinanceConsumerSession {
    const [encoded, signature, ...extra] = value.split('.');
    if (
      !encoded ||
      !signature ||
      extra.length ||
      !this.safeEqual(signature, this.sign(encoded))
    ) {
      throw new ForbiddenException('Finance consumer session is invalid');
    }
    let payload: SignedSession;
    try {
      payload = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as SignedSession;
    } catch {
      throw new ForbiddenException('Finance consumer session is invalid');
    }
    if (
      payload.scope !== 'finance-consumer' ||
      !payload.profileId ||
      !payload.botIntegrationId ||
      !payload.telegramBotUserId ||
      !payload.workspaceId ||
      !payload.defaultCurrency ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= Math.floor(now.getTime() / 1000)
    )
      throw new ForbiddenException(
        'Finance consumer session is expired or invalid',
      );
    const { exp: _exp, scope: _scope, ...session } = payload;
    return session;
  }

  cookieName() {
    return COOKIE_NAME;
  }

  private sign(value: string) {
    const secret = process.env.FINANCE_CONSUMER_SESSION_SECRET;
    if (!secret || secret.length < 32)
      throw new Error(
        'FINANCE_CONSUMER_SESSION_SECRET must be configured with at least 32 characters',
      );
    return createHmac('sha256', secret).update(value).digest('base64url');
  }

  private safeEqual(left: string, right: string) {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private cookie(header: string | undefined, name: string) {
    return header
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1);
  }
}

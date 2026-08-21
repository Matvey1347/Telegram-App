import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { PrismaService } from '../../../../prisma/prisma.service';

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

export type FinanceConsumerSessionInspection =
  | { authenticated: true; session: FinanceConsumerSession }
  | { authenticated: false; clearCookie: boolean };

/** Stateless, consumer-only session. It deliberately shares neither secret nor claims with dashboard JWTs. */
@Injectable()
export class FinanceConsumerSessionService {
  private readonly signingRootKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const encodedKey = config.get<string>('BOT_TOKEN_ENCRYPTION_KEY');
    const key = encodedKey
      ? Buffer.from(encodedKey, 'base64')
      : Buffer.alloc(0);
    if (key.length !== 32) {
      throw new Error(
        'BOT_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
      );
    }
    this.signingRootKey = key;
  }

  async issue(context: FinanceConsumerSession, now = new Date()) {
    const ttlSeconds = await this.ttlSeconds(context.botIntegrationId);
    const payload: SignedSession = {
      ...context,
      scope: 'finance-consumer',
      exp: Math.floor(now.getTime() / 1000) + ttlSeconds,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return {
      token: `${encoded}.${this.sign(encoded, context.botIntegrationId)}`,
      ttlSeconds,
    };
  }

  fromRequest(
    request: Request,
    expectedBotIntegrationId: string,
  ): FinanceConsumerSession {
    const value = this.cookie(request.headers.cookie, COOKIE_NAME);
    if (!value)
      throw new ForbiddenException('Finance consumer session is required');
    const session = this.verify(value, expectedBotIntegrationId);
    if (session.botIntegrationId !== expectedBotIntegrationId) {
      throw new ForbiddenException(
        'Finance consumer session belongs to another bot',
      );
    }
    return session;
  }

  inspectRequest(
    request: Request,
    expectedBotIntegrationId: string,
  ): FinanceConsumerSessionInspection {
    const value = this.cookie(request.headers.cookie, COOKIE_NAME);
    if (!value) return { authenticated: false, clearCookie: false };
    try {
      const session = this.verify(value, expectedBotIntegrationId);
      if (session.botIntegrationId !== expectedBotIntegrationId) {
        return { authenticated: false, clearCookie: true };
      }
      return { authenticated: true, session };
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return { authenticated: false, clearCookie: true };
      }
      throw error;
    }
  }

  verify(
    value: string,
    expectedBotIntegrationId: string,
    now = new Date(),
  ): FinanceConsumerSession {
    const [encoded, signature, ...extra] = value.split('.');
    if (
      !encoded ||
      !signature ||
      extra.length ||
      !this.safeEqual(signature, this.sign(encoded, expectedBotIntegrationId))
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
    return {
      profileId: payload.profileId,
      botIntegrationId: payload.botIntegrationId,
      telegramBotUserId: payload.telegramBotUserId,
      ...(payload.telegramChatId === undefined
        ? {}
        : { telegramChatId: payload.telegramChatId }),
      workspaceId: payload.workspaceId,
      defaultCurrency: payload.defaultCurrency,
    };
  }

  cookieName() {
    return COOKIE_NAME;
  }

  private async ttlSeconds(botIntegrationId: string) {
    const bot = await this.prisma.telegramBotIntegration.findUniqueOrThrow({
      where: { id: botIntegrationId },
      select: { financeConsumerSessionTtlSeconds: true },
    });
    return bot.financeConsumerSessionTtlSeconds;
  }

  private sign(value: string, botIntegrationId: string) {
    const botKey = createHmac('sha256', this.signingRootKey)
      .update(`finance-consumer-session:${botIntegrationId}`)
      .digest();
    return createHmac('sha256', botKey).update(value).digest('base64url');
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

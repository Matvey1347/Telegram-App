import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ApplicationLoggerService } from '../../../operations/application-logs/application-logger.service';
import type { FinanceConsumerSession } from './finance-consumer-session.service';

const TTL_SECONDS = 10 * 60;
const BROWSER_LOGIN_TTL_SECONDS = 5 * 60;
const BROWSER_LOGIN_PREFIX = 'finlogin_';

export type FinanceBrowserLoginStatus =
  | { status: 'pending' }
  | { status: 'expired' }
  | { status: 'approved'; session: FinanceConsumerSession };

@Injectable()
export class FinanceConsumerTransferService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly applicationLogger?: ApplicationLoggerService,
  ) {}

  async create(session: FinanceConsumerSession, publicWebOrigin?: string) {
    if (!publicWebOrigin) {
      this.writeDiagnostic(
        'error',
        'finance_browser_transfer.configuration_error',
        'Finance browser transfer could not be prepared.',
        session,
        { reason: 'missing_public_web_origin' },
      );
      throw new InternalServerErrorException(
        'Finance browser URL is not configured',
      );
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);
    const created = await this.prisma.financeConsumerTransfer.create({
      data: {
        profileId: session.profileId,
        tokenHash: this.hash(token),
        expiresAt,
      },
      select: { id: true },
    });
    const url = new URL(
      `/finance/${encodeURIComponent(session.botIntegrationId)}`,
      `${publicWebOrigin.replace(/\/$/u, '')}/`,
    );
    url.searchParams.set('browserTransfer', token);
    this.writeDiagnostic(
      'warn',
      'finance_browser_transfer.prepared',
      'Finance browser transfer was prepared for a Mini App.',
      session,
      {
        diagnosticId: created.id,
        targetOrigin: url.origin,
        targetPath: url.pathname,
        expiresAt: expiresAt.toISOString(),
      },
    );
    return {
      token,
      expiresAt,
      url: url.toString(),
      diagnosticId: created.id,
    };
  }

  async consume(
    token: string,
    expectedBotIntegrationId: string,
  ): Promise<FinanceConsumerSession> {
    if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) {
      this.logRejected(expectedBotIntegrationId, 'invalid_token_format');
      throw new ForbiddenException('Finance browser transfer is invalid');
    }
    const hash = this.hash(token);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.financeConsumerTransfer.findUnique({
        where: { tokenHash: hash },
        select: {
          id: true,
          profile: {
            select: {
              id: true,
              botIntegrationId: true,
              telegramBotUserId: true,
              defaultCurrency: true,
              botIntegration: { select: { workspaceId: true } },
              telegramUser: { select: { telegramChatId: true } },
            },
          },
        },
      });
      if (
        !transfer ||
        transfer.profile.botIntegrationId !== expectedBotIntegrationId
      ) {
        this.logRejected(expectedBotIntegrationId, 'not_found_or_wrong_bot');
        throw new ForbiddenException('Finance browser transfer is invalid');
      }
      const consumed = await tx.financeConsumerTransfer.updateMany({
        where: {
          id: transfer.id,
          tokenHash: hash,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        this.logRejected(
          expectedBotIntegrationId,
          'expired_or_already_consumed',
          transfer.id,
        );
        throw new ForbiddenException(
          'Finance browser transfer is expired or already used',
        );
      }
      this.writeDiagnostic(
        'warn',
        'finance_browser_transfer.consumed',
        'Finance browser transfer reached the Web App successfully.',
        {
          workspaceId: transfer.profile.botIntegration.workspaceId,
          profileId: transfer.profile.id,
          botIntegrationId: transfer.profile.botIntegrationId,
        },
        {
          diagnosticId: transfer.id,
        },
      );
      return {
        profileId: transfer.profile.id,
        botIntegrationId: transfer.profile.botIntegrationId,
        telegramBotUserId: transfer.profile.telegramBotUserId,
        telegramChatId: transfer.profile.telegramUser.telegramChatId,
        workspaceId: transfer.profile.botIntegration.workspaceId,
        defaultCurrency: transfer.profile.defaultCurrency,
      };
    });
  }

  async createBrowserLogin(botIntegrationId: string, botUsername: string) {
    const token = randomBytes(24).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + BROWSER_LOGIN_TTL_SECONDS * 1000,
    );
    await this.prisma.financeBrowserLoginChallenge.deleteMany({
      where: { botIntegrationId, expiresAt: { lte: now } },
    });
    await this.prisma.financeBrowserLoginChallenge.create({
      data: {
        botIntegrationId,
        tokenHash: this.hash(token),
        expiresAt,
      },
    });
    return {
      token,
      expiresAt,
      loginUrl: `https://t.me/${botUsername.replace(/^@/u, '')}?start=${BROWSER_LOGIN_PREFIX}${token}`,
    };
  }

  async approveBrowserLogin(input: {
    token: string;
    botIntegrationId: string;
    profileId: string;
  }) {
    if (!this.validBrowserLoginToken(input.token)) return false;
    const now = new Date();
    const tokenHash = this.hash(input.token);
    const approved = await this.prisma.financeBrowserLoginChallenge.updateMany({
      where: {
        tokenHash,
        botIntegrationId: input.botIntegrationId,
        approvedProfileId: null,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { approvedProfileId: input.profileId, approvedAt: now },
    });
    if (approved.count === 1) return true;
    const existing = await this.prisma.financeBrowserLoginChallenge.findUnique({
      where: { tokenHash },
      select: {
        botIntegrationId: true,
        approvedProfileId: true,
        consumedAt: true,
        expiresAt: true,
      },
    });
    return Boolean(
      existing &&
      existing.botIntegrationId === input.botIntegrationId &&
      existing.approvedProfileId === input.profileId &&
      !existing.consumedAt &&
      existing.expiresAt > now,
    );
  }

  async consumeBrowserLogin(
    token: string,
    expectedBotIntegrationId: string,
  ): Promise<FinanceBrowserLoginStatus> {
    if (!this.validBrowserLoginToken(token)) return { status: 'expired' };
    const tokenHash = this.hash(token);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const challenge = await tx.financeBrowserLoginChallenge.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          botIntegrationId: true,
          expiresAt: true,
          consumedAt: true,
          approvedProfile: {
            select: {
              id: true,
              botIntegrationId: true,
              telegramBotUserId: true,
              defaultCurrency: true,
              botIntegration: { select: { workspaceId: true } },
              telegramUser: { select: { telegramChatId: true } },
            },
          },
        },
      });
      if (
        !challenge ||
        challenge.botIntegrationId !== expectedBotIntegrationId ||
        challenge.consumedAt ||
        challenge.expiresAt <= now
      ) {
        return { status: 'expired' };
      }
      if (!challenge.approvedProfile) return { status: 'pending' };
      if (
        challenge.approvedProfile.botIntegrationId !== expectedBotIntegrationId
      ) {
        return { status: 'expired' };
      }
      const consumed = await tx.financeBrowserLoginChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          expiresAt: { gt: now },
          approvedProfileId: challenge.approvedProfile.id,
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) return { status: 'expired' };
      return {
        status: 'approved',
        session: {
          profileId: challenge.approvedProfile.id,
          botIntegrationId: challenge.approvedProfile.botIntegrationId,
          telegramBotUserId: challenge.approvedProfile.telegramBotUserId,
          telegramChatId: challenge.approvedProfile.telegramUser.telegramChatId,
          workspaceId: challenge.approvedProfile.botIntegration.workspaceId,
          defaultCurrency: challenge.approvedProfile.defaultCurrency,
        },
      };
    });
  }

  private validBrowserLoginToken(token: string) {
    return /^[A-Za-z0-9_-]{32}$/u.test(token);
  }

  private logRejected(
    botIntegrationId: string,
    reason: string,
    diagnosticId?: string,
  ) {
    this.applicationLogger?.writeStructured({
      level: 'warn',
      kind: 'application',
      source: FinanceConsumerTransferService.name,
      event: 'finance_browser_transfer.rejected',
      message: 'Finance browser transfer was rejected.',
      metadata: {
        botIntegrationId,
        reason,
        ...(diagnosticId ? { diagnosticId } : {}),
      },
    });
  }

  private writeDiagnostic(
    level: 'warn' | 'error',
    event: string,
    message: string,
    session: Pick<
      FinanceConsumerSession,
      'workspaceId' | 'profileId' | 'botIntegrationId'
    >,
    metadata: Record<string, unknown>,
  ) {
    this.applicationLogger?.writeStructured({
      level,
      kind: 'application',
      source: FinanceConsumerTransferService.name,
      event,
      message,
      workspaceId: session.workspaceId,
      metadata: {
        ...metadata,
        profileId: session.profileId,
        botIntegrationId: session.botIntegrationId,
      },
    });
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}

import { ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { FinanceConsumerSession } from './finance-consumer-session.service';

const TTL_SECONDS = 60;
const BROWSER_LOGIN_TTL_SECONDS = 5 * 60;
const BROWSER_LOGIN_PREFIX = 'finlogin_';

export type FinanceBrowserLoginStatus =
  | { status: 'pending' }
  | { status: 'expired' }
  | { status: 'approved'; session: FinanceConsumerSession };

@Injectable()
export class FinanceConsumerTransferService {
  constructor(private readonly prisma: PrismaService) {}

  async create(session: FinanceConsumerSession) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);
    await this.prisma.financeConsumerTransfer.create({
      data: {
        profileId: session.profileId,
        tokenHash: this.hash(token),
        expiresAt,
      },
    });
    return { token, expiresAt };
  }

  async consume(
    token: string,
    expectedBotIntegrationId: string,
  ): Promise<FinanceConsumerSession> {
    if (!/^[A-Za-z0-9_-]{32,}$/.test(token))
      throw new ForbiddenException('Finance browser transfer is invalid');
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
      )
        throw new ForbiddenException('Finance browser transfer is invalid');
      const consumed = await tx.financeConsumerTransfer.updateMany({
        where: {
          id: transfer.id,
          tokenHash: hash,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1)
        throw new ForbiddenException(
          'Finance browser transfer is expired or already used',
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

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}

import { ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { FinanceConsumerSession } from './finance-consumer-session.service';

const TTL_SECONDS = 60;

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
  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}

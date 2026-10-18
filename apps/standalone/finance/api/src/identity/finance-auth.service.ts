import { Injectable } from '@nestjs/common';
import { FinancePrismaService } from '../prisma/finance-prisma.service';
import { FinanceSessionService } from './finance-session.service';

@Injectable()
export class FinanceAuthService {
  constructor(
    private readonly prisma: FinancePrismaService,
    private readonly sessions: FinanceSessionService,
  ) {}

  async bootstrap(input: {
    financeBotId: string;
    telegramUserId: string;
    issuedAt: number;
    signature: string;
  }) {
    this.sessions.verifyBootstrap(
      input.financeBotId,
      input.telegramUserId,
      input.issuedAt,
      input.signature,
    );
    const user = await this.prisma.financeTelegramUser.upsert({
      where: {
        financeBotId_telegramUserId: {
          financeBotId: input.financeBotId,
          telegramUserId: input.telegramUserId,
        },
      },
      create: {
        financeBotId: input.financeBotId,
        telegramUserId: input.telegramUserId,
      },
      update: {},
    });
    const profile = await this.prisma.financeProfile.upsert({
      where: { financeTelegramUserId: user.id },
      create: { financeBotId: input.financeBotId, financeTelegramUserId: user.id },
      update: {},
    });
    return {
      session: this.sessions.issue({
        financeBotId: input.financeBotId,
        financeTelegramUserId: user.id,
        profileId: profile.id,
      }),
      profileId: profile.id,
    };
  }
}

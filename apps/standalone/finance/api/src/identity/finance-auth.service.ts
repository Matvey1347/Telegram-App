import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { FinanceRuntimeConfig } from '../config/finance-runtime-config';
import { FinancePrismaService } from '../prisma/finance-prisma.service';
import { FinanceSessionService } from './finance-session.service';

@Injectable()
export class FinanceAuthService {
  constructor(
    private readonly prisma: FinancePrismaService,
    private readonly sessions: FinanceSessionService,
    private readonly config: FinanceRuntimeConfig,
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
        surface: 'EXTERNAL_WEB',
      }),
      profileId: profile.id,
    };
  }

  async telegramBrowserSession(input: { financeBotId: string; initData: string }) {
    const bot = await this.prisma.financeBot.findUnique({ where: { id: input.financeBotId }, select: { runtimeEnvironment: true } });
    if (!bot?.runtimeEnvironment) throw new NotFoundException('Finance bot not found');
    const runtime = this.config.botForEnvironment(bot.runtimeEnvironment);
    if (!runtime) throw new ForbiddenException('Finance bot credentials unavailable');
    const params = new URLSearchParams(input.initData);
    const hash = params.get('hash');
    const authDate = Number(params.get('auth_date'));
    if (!hash || !/^[a-f0-9]{64}$/i.test(hash) || !Number.isSafeInteger(authDate) || Math.abs(Date.now() / 1000 - authDate) > 300) throw new ForbiddenException('Telegram initData is expired or invalid');
    const checkString = [...params.entries()].filter(([key]) => key !== 'hash').sort(([a],[b]) => a.localeCompare(b)).map(([key,value]) => `${key}=${value}`).join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(runtime.token).digest();
    const expected = createHmac('sha256', secret).update(checkString).digest();
    if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) throw new ForbiddenException('Telegram initData signature is invalid');
    let telegramUserId: string;
    try {
      const user = JSON.parse(params.get('user') || '{}');
      telegramUserId = String(user.id);
      if (!/^[1-9]\d{0,19}$/.test(telegramUserId)) throw new Error('invalid id');
    } catch { throw new ForbiddenException('Telegram user is invalid'); }
    const user = await this.prisma.financeTelegramUser.upsert({ where: { financeBotId_telegramUserId: { financeBotId: input.financeBotId, telegramUserId } }, create: { financeBotId: input.financeBotId, telegramUserId }, update: {} });
    const profile = await this.prisma.financeProfile.upsert({ where: { financeTelegramUserId: user.id }, create: { financeBotId: input.financeBotId, financeTelegramUserId: user.id }, update: {} });
    return this.sessions.issue({ financeBotId: input.financeBotId, financeTelegramUserId: user.id, profileId: profile.id, surface: 'TELEGRAM_MINI_APP' });
  }
}

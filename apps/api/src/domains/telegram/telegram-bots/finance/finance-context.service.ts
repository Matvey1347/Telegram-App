import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TelegramBotApplicationType } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { TokenEncryptionService } from '../../../../common/security/token-encryption.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  DEFAULT_FINANCE_CATEGORIES,
  FINANCE_INIT_DATA_MAX_AGE_SECONDS,
} from './finance-defaults';
import { FinanceConsumerRuntimeEnvironmentService } from './finance-consumer-runtime-environment.service';

type TelegramWebAppUser = {
  id: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};

@Injectable()
export class FinanceContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: TokenEncryptionService,
    private readonly environments: FinanceConsumerRuntimeEnvironmentService,
  ) {}

  async fromInitData(botIntegrationId: string, initData: string | undefined) {
    if (!initData)
      throw new ForbiddenException(
        'Telegram Mini App authentication is required',
      );
    const { bot, runtime } = await this.selectedRuntime(botIntegrationId);
    const token = this.encryption.decrypt({
      encrypted: runtime.botTokenEncrypted,
      iv: runtime.botTokenIv,
      authTag: runtime.botTokenAuthTag,
    });
    const parsed = this.verifyInitData(initData, token);
    return this.resolveIdentity(bot, runtime.id, parsed.user);
  }

  async fromTelegramLogin(
    botIntegrationId: string,
    login: Record<string, string | undefined>,
  ) {
    const { bot, runtime } = await this.selectedRuntime(botIntegrationId);
    const token = this.encryption.decrypt({
      encrypted: runtime.botTokenEncrypted,
      iv: runtime.botTokenIv,
      authTag: runtime.botTokenAuthTag,
    });
    return this.resolveIdentity(
      bot,
      runtime.id,
      this.verifyLoginData(login, token),
    );
  }

  async browserLoginConfig(botIntegrationId: string) {
    const { runtime } = await this.selectedRuntime(botIntegrationId);
    const username = runtime.username;
    if (!username)
      throw new NotFoundException('Finance bot browser login is unavailable');
    return { username };
  }

  private async selectedRuntime(botIntegrationId: string) {
    // Consumer auth validates against one configured runtime only. It never
    // probes another token after a signature failure.
    const environment = this.environments.current();
    if (!environment) {
      throw new NotFoundException(
        'Finance bot runtime is not enabled in this process',
      );
    }
    const bot = await this.prisma.telegramBotIntegration.findFirst({
      where: {
        id: botIntegrationId,
        applicationType: TelegramBotApplicationType.FINANCE,
        isActive: true,
      },
      select: {
        id: true,
        workspaceId: true,
        runtimeInstances: {
          where: { environment, runtimeStatus: 'ACTIVE' },
          select: {
            id: true,
            username: true,
            botTokenEncrypted: true,
            botTokenIv: true,
            botTokenAuthTag: true,
          },
          take: 1,
        },
      },
    });
    const runtime = bot?.runtimeInstances[0];
    if (!bot || !runtime) throw new NotFoundException('Finance bot not found');
    return { bot, runtime };
  }

  private async resolveIdentity(
    bot: { id: string; workspaceId: string },
    runtimeInstanceId: string,
    user: TelegramWebAppUser,
  ) {
    const telegramUserId = String(user.id);
    const existingUser = await this.prisma.telegramBotUser.findUnique({
      where: {
        runtimeInstanceId_telegramUserId: {
          runtimeInstanceId,
          telegramUserId,
        },
      },
    });
    const identity = {
      username: user.username || null,
      firstName: user.first_name || null,
      lastName: user.last_name || null,
      languageCode:
        user.language_code === undefined
          ? existingUser?.languageCode || null
          : user.language_code || null,
    };
    const telegramUser = !existingUser
      ? await this.prisma.telegramBotUser.create({
          data: {
            workspaceId: bot.workspaceId,
            botIntegrationId: bot.id,
            runtimeInstanceId,
            telegramUserId,
            telegramChatId: telegramUserId,
            ...identity,
          },
        })
      : this.identityChanged(existingUser, identity)
        ? await this.prisma.telegramBotUser.update({
            where: { id: existingUser.id },
            data: identity,
          })
        : existingUser;
    const profile = await this.ensureProfile(bot.id, telegramUser.id);
    return { bot, telegramUser, profile };
  }

  async ensureProfile(botIntegrationId: string, telegramBotUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existingProfile = await tx.financeProfile.findUnique({
        where: {
          botIntegrationId_telegramBotUserId: {
            botIntegrationId,
            telegramBotUserId,
          },
        },
      });
      if (existingProfile) return existingProfile;
      let profile;
      try {
        profile = await tx.financeProfile.create({
          data: { botIntegrationId, telegramBotUserId },
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }
        const concurrentlyCreated = await tx.financeProfile.findUnique({
          where: {
            botIntegrationId_telegramBotUserId: {
              botIntegrationId,
              telegramBotUserId,
            },
          },
        });
        if (!concurrentlyCreated) throw error;
        return concurrentlyCreated;
      }
      await tx.financeCategory.createMany({
        data: DEFAULT_FINANCE_CATEGORIES.map((item) => ({
          profileId: profile.id,
          name: item.name,
          type: item.type,
          key: item.name.toLowerCase().replace(/\s+/g, '-'),
        })),
        skipDuplicates: true,
      });
      const account = await tx.financeAccount.findFirst({
        where: { profileId: profile.id },
        select: { id: true },
      });
      if (!account)
        await tx.financeAccount.create({
          data: {
            profileId: profile.id,
            name: 'Cash',
            type: 'CASH',
            currency: profile.defaultCurrency,
          },
        });
      return profile;
    });
  }

  private identityChanged(
    existing: {
      username: string | null;
      firstName: string | null;
      lastName: string | null;
      languageCode: string | null;
    },
    incoming: {
      username: string | null;
      firstName: string | null;
      lastName: string | null;
      languageCode: string | null;
    },
  ) {
    return (
      existing.username !== incoming.username ||
      existing.firstName !== incoming.firstName ||
      existing.lastName !== incoming.lastName ||
      existing.languageCode !== incoming.languageCode
    );
  }

  verifyInitData(initData: string, botToken: string, now = new Date()) {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    const authDateRaw = params.get('auth_date');
    const userRaw = params.get('user');
    if (!hash || !/^[a-f0-9]{64}$/i.test(hash) || !authDateRaw || !userRaw)
      throw new BadRequestException('Invalid Telegram initData');
    const dataCheckString = [...params.entries()]
      .filter(([key]) => key !== 'hash')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expected = createHmac('sha256', secret)
      .update(dataCheckString)
      .digest();
    const supplied = Buffer.from(hash, 'hex');
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw new ForbiddenException('Telegram initData signature is invalid');
    const authDate = Number(authDateRaw);
    const age = Math.floor(now.getTime() / 1000) - authDate;
    if (
      !Number.isInteger(authDate) ||
      age < -30 ||
      age > FINANCE_INIT_DATA_MAX_AGE_SECONDS
    )
      throw new ForbiddenException('Telegram initData has expired');
    let user: TelegramWebAppUser;
    try {
      user = JSON.parse(userRaw) as TelegramWebAppUser;
    } catch {
      throw new BadRequestException('Telegram initData user is invalid');
    }
    if (!user || !/^\d+$/.test(String(user.id)))
      throw new BadRequestException('Telegram initData user is invalid');
    return { user, authDate };
  }

  verifyLoginData(
    login: Record<string, string | undefined>,
    botToken: string,
    now = new Date(),
  ): TelegramWebAppUser {
    const hash = login.hash;
    const authDate = Number(login.auth_date);
    const id = login.id;
    if (
      !hash ||
      !/^[a-f0-9]{64}$/i.test(hash) ||
      !id ||
      !/^\d+$/.test(id) ||
      !Number.isInteger(authDate)
    )
      throw new BadRequestException('Invalid Telegram login data');
    const telegramFields = new Set([
      'id',
      'first_name',
      'last_name',
      'username',
      'photo_url',
      'auth_date',
    ]);
    const data = Object.entries(login)
      .filter(([key, value]) => telegramFields.has(key) && value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    const secret = createHash('sha256').update(botToken).digest();
    const expected = createHmac('sha256', secret).update(data).digest();
    const supplied = Buffer.from(hash, 'hex');
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw new ForbiddenException('Telegram login signature is invalid');
    const age = Math.floor(now.getTime() / 1000) - authDate;
    if (age < -30 || age > FINANCE_INIT_DATA_MAX_AGE_SECONDS)
      throw new ForbiddenException('Telegram login has expired');
    return {
      id,
      username: login.username,
      first_name: login.first_name,
      last_name: login.last_name,
    };
  }
}

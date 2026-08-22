import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, createHmac } from 'crypto';
import { FinanceContextService } from './finance-context.service';
import { DEFAULT_FINANCE_CATEGORIES } from '../catalog/finance-defaults';

function signed(token: string, authDate = Math.floor(Date.now() / 1000)) {
  const values = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'query',
    user: JSON.stringify({ id: 12345, first_name: 'Ada' }),
  });
  const data = [...values.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  values.set('hash', createHmac('sha256', secret).update(data).digest('hex'));
  return values.toString();
}

function signedLogin(token: string) {
  const values = {
    id: '12345',
    first_name: 'Ada',
    auth_date: String(Math.floor(Date.now() / 1000)),
  };
  const data = Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHash('sha256').update(token).digest();
  return {
    ...values,
    hash: createHmac('sha256', secret).update(data).digest('hex'),
  };
}

describe('FinanceContextService Telegram Mini App verification', () => {
  const service = new FinanceContextService(
    {} as never,
    {} as never,
    {} as never,
  );
  it('accepts fresh initData signed by the exact bot token', () => {
    expect(
      service.verifyInitData(signed('123:token'), '123:token').user,
    ).toMatchObject({ id: 12345 });
  });
  it('rejects forged initData', () => {
    expect(() =>
      service.verifyInitData(signed('other-token'), '123:token'),
    ).toThrow(ForbiddenException);
  });
  it('rejects stale and malformed initData', () => {
    expect(() =>
      service.verifyInitData(
        signed('123:token', Math.floor(Date.now() / 1000) - 3600),
        '123:token',
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.verifyInitData('auth_date=1&user=%7B%7D', '123:token'),
    ).toThrow(BadRequestException);
  });
  it('accepts Telegram Login Widget data while ignoring a local safe return path', () => {
    const login = signedLogin('123:token');
    expect(
      service.verifyLoginData(
        { ...login, returnTo: '/finance/bot-1' },
        '123:token',
      ),
    ).toMatchObject({ id: '12345', first_name: 'Ada' });
  });
});

describe('FinanceContextService consumer bootstrap persistence', () => {
  const previousEnvironment = process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT;
  beforeAll(() => {
    process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT = 'PRODUCTION';
  });
  afterAll(() => {
    if (previousEnvironment === undefined)
      delete process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT;
    else process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT = previousEnvironment;
  });
  const bot = {
    id: 'bot-1',
    workspaceId: 'workspace-1',
    runtimeInstances: [
      {
        id: 'runtime-1',
        username: 'finance_bot',
        botTokenEncrypted: 'encrypted',
        botTokenIv: 'iv',
        botTokenAuthTag: 'tag',
      },
    ],
  };
  const telegramUser = {
    id: 'user-1',
    username: 'ada',
    firstName: 'Ada',
    lastName: null,
    languageCode: null,
  };

  function setup() {
    const prisma = {
      telegramBotIntegration: { findFirst: jest.fn().mockResolvedValue(bot) },
      telegramBotUser: {
        findUnique: jest.fn().mockResolvedValue(telegramUser),
        create: jest.fn(),
        update: jest.fn(({ data }) =>
          Promise.resolve({ ...telegramUser, ...data }),
        ),
      },
      financeProfile: { findUnique: jest.fn(), create: jest.fn() },
      $transaction: jest.fn(),
    };
    const encryption = { decrypt: jest.fn().mockReturnValue('bot-token') };
    const service = new FinanceContextService(
      prisma as never,
      encryption as never,
      { current: () => 'PRODUCTION' } as never,
    );
    jest.spyOn(service, 'verifyInitData').mockReturnValue({
      user: { id: 12345, username: 'ada', first_name: 'Ada' },
      authDate: 0,
    });
    return { service, prisma };
  }

  it('does not update an unchanged established consumer identity or reinitialize its profile', async () => {
    const { service, prisma } = setup();
    const profile = { id: 'profile-1' };
    prisma.financeProfile.findUnique.mockResolvedValue(profile);

    await expect(
      service.fromInitData('bot-1', 'signed-data'),
    ).resolves.toMatchObject({
      telegramUser,
      profile,
    });

    expect(prisma.telegramBotUser.create).not.toHaveBeenCalled();
    expect(prisma.telegramBotUser.update).not.toHaveBeenCalled();
    expect(prisma.financeProfile.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.telegramBotIntegration.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'bot-1',
        applicationType: 'FINANCE',
        isActive: true,
      },
      select: {
        id: true,
        workspaceId: true,
        runtimeInstances: {
          where: { environment: 'PRODUCTION', runtimeStatus: 'ACTIVE' },
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
  });

  it('updates only changed Telegram identity fields without recording consumer API activity', async () => {
    const { service, prisma } = setup();
    prisma.telegramBotUser.findUnique.mockResolvedValue({
      ...telegramUser,
      username: 'old-ada',
    });
    prisma.financeProfile.findUnique.mockResolvedValue({ id: 'profile-1' });

    await service.fromInitData('bot-1', 'signed-data');

    expect(prisma.telegramBotUser.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        username: 'ada',
        firstName: 'Ada',
        lastName: null,
        languageCode: null,
      },
    });
  });

  it('does not erase a known Telegram language when browser login omits language_code', async () => {
    const { service, prisma } = setup();
    prisma.telegramBotUser.findUnique.mockResolvedValue({
      ...telegramUser,
      languageCode: 'uk',
    });
    prisma.financeProfile.findUnique.mockResolvedValue({ id: 'profile-1' });
    jest.spyOn(service, 'verifyLoginData').mockReturnValue({
      id: '12345',
      username: 'ada',
      first_name: 'Ada',
      last_name: undefined,
    });

    await service.fromTelegramLogin('bot-1', {});

    expect(prisma.telegramBotUser.update).not.toHaveBeenCalled();
  });

  it('resolves Mini App initData and browser Telegram Login to one bot-scoped Finance profile', async () => {
    const { service, prisma } = setup();
    const profile = { id: 'profile-shared' };
    prisma.financeProfile.findUnique.mockResolvedValue(profile);
    jest.spyOn(service, 'verifyLoginData').mockReturnValue({
      id: '12345',
      username: 'ada',
      first_name: 'Ada',
      last_name: undefined,
    });

    const miniApp = await service.fromInitData('bot-1', 'signed-data');
    const browser = await service.fromTelegramLogin('bot-1', {});

    expect(miniApp.telegramUser.id).toBe(browser.telegramUser.id);
    expect(miniApp.profile.id).toBe('profile-shared');
    expect(browser.profile.id).toBe('profile-shared');
    expect(prisma.telegramBotUser.create).not.toHaveBeenCalled();
    expect(prisma.financeProfile.create).not.toHaveBeenCalled();
  });

  it('initializes defaults exactly once for a first Finance profile', async () => {
    const { service, prisma } = setup();
    prisma.financeProfile.findUnique.mockResolvedValue(null);
    prisma.financeProfile.create.mockResolvedValue({
      id: 'profile-1',
      defaultCurrency: 'UAH',
    });

    await service.ensureProfile('bot-1', 'user-1');

    expect(prisma.financeProfile.create).toHaveBeenCalledWith({
      data: {
        botIntegrationId: 'bot-1',
        telegramBotUserId: 'user-1',
        categories: {
          create: DEFAULT_FINANCE_CATEGORIES.map((item) => ({
            name: item.name,
            type: item.type,
            key: item.name.toLowerCase().replace(/\s+/g, '-'),
          })),
        },
        accounts: { create: { name: 'Cash', type: 'CASH', currency: 'UAH' } },
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reuses a concurrently initialized profile instead of recreating defaults', async () => {
    const { service, prisma } = setup();
    const profile = { id: 'profile-concurrent' };
    prisma.financeProfile.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(profile);
    prisma.financeProfile.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.ensureProfile('bot-1', 'user-1')).resolves.toBe(
      profile,
    );
    expect(prisma.financeProfile.create).toHaveBeenCalledTimes(1);
    expect(prisma.financeProfile.findUnique).toHaveBeenCalledTimes(2);
  });
});

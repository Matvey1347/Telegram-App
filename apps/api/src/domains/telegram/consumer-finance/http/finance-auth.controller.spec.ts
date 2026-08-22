/* eslint-disable @typescript-eslint/unbound-method -- Jest assertions inspect mock methods without invoking them. */
import type { Request, Response } from 'express';
import { FinanceConsumerSessionService } from '../identity/finance-consumer-session.service';
import { FinanceController } from './finance.controller';

describe('FinanceController consumer auth', () => {
  const previousFrontend = process.env.FRONTEND_URL;
  const previousApiPublicUrl = process.env.API_PUBLIC_URL;
  const previousNodeEnvironment = process.env.NODE_ENV;
  const profile = {
    id: 'profile-1',
    defaultCurrency: 'UAH',
    timezone: 'Europe/Kyiv',
    locale: 'uk',
    localeOverride: null,
    onboardingCompletedAt: null,
  };
  const context = {
    bot: { id: 'bot-1', workspaceId: 'workspace-1' },
    telegramUser: {
      id: 'telegram-user-1',
      telegramChatId: '12345',
    },
    profile,
  };

  beforeAll(() => {
    process.env.FRONTEND_URL = 'https://finance.example';
    process.env.API_PUBLIC_URL = 'https://api.example';
  });

  afterAll(() => {
    if (previousFrontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontend;
    if (previousApiPublicUrl === undefined) delete process.env.API_PUBLIC_URL;
    else process.env.API_PUBLIC_URL = previousApiPublicUrl;
    if (previousNodeEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnvironment;
  });

  function setup() {
    const contexts = {
      fromInitData: jest.fn().mockResolvedValue(context),
      fromTelegramLogin: jest.fn().mockResolvedValue(context),
      browserLoginConfig: jest
        .fn()
        .mockResolvedValue({ username: 'finance_bot' }),
    };
    const sessions = new FinanceConsumerSessionService(
      {
        telegramBotIntegration: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            financeConsumerSessionTtlSeconds: 60 * 60 * 24 * 30,
          }),
        },
      } as never,
      {
        get: jest.fn().mockReturnValue(Buffer.alloc(32, 7).toString('base64')),
      } as never,
    );
    const core = {
      profile: jest.fn().mockResolvedValue(profile),
      updateSettings: jest.fn().mockResolvedValue(profile),
      notificationTarget: jest.fn().mockResolvedValue(null),
      limits: jest.fn().mockResolvedValue([]),
      goal: jest.fn().mockResolvedValue(null),
    };
    const ledger = {
      stats: jest.fn().mockResolvedValue({
        income: '10',
        expense: '3',
        net: '7',
        categories: [],
        accounts: [],
        totalBalance: {
          amount: '0',
          currency: 'UAH',
          includedAccountCount: 0,
          excludedAccounts: [],
        },
      }),
      history: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    };
    const transfers = {
      createBrowserLogin: jest.fn().mockResolvedValue({
        token: 'a'.repeat(32),
        expiresAt: new Date('2026-08-21T10:05:00.000Z'),
        loginUrl: `https://t.me/finance_bot?start=finlogin_${'a'.repeat(32)}`,
      }),
      consumeBrowserLogin: jest.fn(),
    };
    const delivery = {
      enqueueSendMessage: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new FinanceController(
      contexts as never,
      sessions,
      transfers as never,
      core as never,
      ledger as never,
      {} as never,
      {} as never,
      {} as never,
      delivery as never,
    );
    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      redirect: jest.fn(),
    } as unknown as Response;
    return {
      controller,
      contexts,
      sessions,
      transfers,
      core,
      ledger,
      delivery,
      response,
    };
  }

  function request(cookie?: string, forwardedProtocol?: string): Request {
    return {
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(forwardedProtocol
          ? { 'x-forwarded-proto': forwardedProtocol }
          : {}),
      },
      protocol: 'http',
      secure: false,
    } as Request;
  }

  function trustedMutationRequest(forwardedProtocol?: string): Request {
    const result = request(undefined, forwardedProtocol);
    result.method = 'POST';
    result.headers['x-finance-consumer-request'] = '1';
    return result;
  }

  it('returns a 200 unauthenticated state without querying a profile when no cookie exists', async () => {
    const { controller, core, response } = setup();

    await expect(
      controller.session('bot-1', request(), response),
    ).resolves.toEqual({ authenticated: false });
    expect(core.profile).not.toHaveBeenCalled();
    expect(response.clearCookie).not.toHaveBeenCalled();
  });

  it('clears an expired cookie and returns a 200 unauthenticated state', async () => {
    const { controller, sessions, response } = setup();
    const expired = (
      await sessions.issue(
        {
          profileId: 'profile-1',
          botIntegrationId: 'bot-1',
          telegramBotUserId: 'telegram-user-1',
          workspaceId: 'workspace-1',
          defaultCurrency: 'UAH',
        },
        new Date('2020-01-01T00:00:00Z'),
      )
    ).token;

    await expect(
      controller.session(
        'bot-1',
        request(`finance_consumer_session=${expired}`),
        response,
      ),
    ).resolves.toEqual({ authenticated: false });
    expect(response.clearCookie).toHaveBeenCalledWith(
      'finance_consumer_session',
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/api/finance-bots/bot-1',
      }),
    );
  });

  it('returns the authenticated state for a valid scoped consumer cookie', async () => {
    const { controller, sessions, response } = setup();
    const token = (
      await sessions.issue({
        profileId: 'profile-1',
        botIntegrationId: 'bot-1',
        telegramBotUserId: 'telegram-user-1',
        workspaceId: 'workspace-1',
        defaultCurrency: 'UAH',
      })
    ).token;

    await expect(
      controller.session(
        'bot-1',
        request(`finance_consumer_session=${token}`),
        response,
      ),
    ).resolves.toEqual({ authenticated: true, profile });
  });

  it('logs out idempotently by clearing only the bot-scoped Finance session cookie', () => {
    const { controller, response } = setup();
    const logoutRequest = trustedMutationRequest('https');

    expect(controller.logout('bot-1', logoutRequest, response)).toEqual({
      authenticated: false,
    });
    expect(response.clearCookie).toHaveBeenCalledTimes(1);
    expect(response.clearCookie).toHaveBeenCalledWith(
      'finance_consumer_session',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/api/finance-bots/bot-1',
      }),
    );
  });

  it('rejects a cross-site logout without the consumer mutation header', () => {
    const { controller, response } = setup();
    const logoutRequest = request();
    logoutRequest.method = 'POST';

    expect(() => controller.logout('bot-1', logoutRequest, response)).toThrow(
      'Finance consumer request is not trusted',
    );
    expect(response.clearCookie).not.toHaveBeenCalled();
  });

  it('builds the dashboard period from the authoritative profile timezone', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-31T10:30:00.000Z'));
    const { controller, sessions, ledger } = setup();
    const token = (
      await sessions.issue({
        profileId: 'profile-1',
        botIntegrationId: 'bot-1',
        telegramBotUserId: 'telegram-user-1',
        workspaceId: 'workspace-1',
        defaultCurrency: 'UAH',
      })
    ).token;
    const dashboardRequest = request(`finance_consumer_session=${token}`);
    profile.timezone = 'Pacific/Kiritimati';

    try {
      await expect(
        controller.dashboard('bot-1', dashboardRequest),
      ).resolves.toMatchObject({
        stats: {
          totalBalance: {
            amount: '0',
            currency: 'UAH',
            excludedAccounts: [],
          },
        },
      });
      expect(ledger.stats).toHaveBeenCalledWith(
        'profile-1',
        new Date('2026-01-31T10:00:00.000Z'),
        new Date('2026-02-28T10:00:00.000Z'),
      );
    } finally {
      profile.timezone = 'Europe/Kyiv';
      jest.useRealTimers();
    }
  });

  it('refreshes the Telegram keyboard in the selected language and exact runtime', async () => {
    const { controller, sessions, core, delivery } = setup();
    const token = (
      await sessions.issue({
        profileId: 'profile-1',
        botIntegrationId: 'bot-1',
        telegramBotUserId: 'telegram-user-1',
        workspaceId: 'workspace-1',
        defaultCurrency: 'UAH',
      })
    ).token;
    core.profile.mockResolvedValueOnce({ ...profile, locale: 'en' });
    core.updateSettings.mockResolvedValue({ ...profile, locale: 'ru' });
    core.notificationTarget.mockResolvedValue({
      botIntegrationId: 'bot-1',
      botIntegration: { workspaceId: 'workspace-1' },
      telegramUser: {
        id: 'telegram-user-1',
        telegramChatId: '12345',
        languageCode: 'en',
        runtimeInstanceId: 'production-runtime',
      },
    });

    await controller.settings(
      'bot-1',
      Object.assign(request(`finance_consumer_session=${token}`), {
        method: 'PATCH',
        headers: {
          cookie: `finance_consumer_session=${token}`,
          'x-finance-consumer-request': '1',
        },
      }),
      {
        defaultCurrency: profile.defaultCurrency,
        timezone: profile.timezone,
        locale: 'ru',
      },
    );

    expect(delivery.enqueueSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeInstanceId: 'production-runtime',
        text: '✅ Язык обновлён.',
        replyKeyboard: expect.arrayContaining([
          expect.arrayContaining([
            expect.objectContaining({ text: '💸 Добавить расход' }),
          ]),
        ]),
      }),
    );
  });

  it('bootstraps from initData and emits a secure cookie behind the HTTPS gateway', async () => {
    const { controller, contexts, response } = setup();

    await expect(
      controller.authBootstrap(
        'bot-1',
        'signed-init-data',
        trustedMutationRequest('https'),
        response,
      ),
    ).resolves.toEqual({ authenticated: true, profile });
    expect(contexts.fromInitData).toHaveBeenCalledWith(
      'bot-1',
      'signed-init-data',
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'finance_consumer_session',
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/api/finance-bots/bot-1',
      }),
    );
  });

  it('never emits an insecure consumer cookie in production behind a misconfigured proxy', async () => {
    const { controller, response } = setup();
    process.env.NODE_ENV = 'production';

    try {
      await controller.authBootstrap(
        'bot-1',
        'signed-init-data',
        trustedMutationRequest(),
        response,
      );
    } finally {
      process.env.NODE_ENV = previousNodeEnvironment || 'test';
    }

    expect(response.cookie).toHaveBeenCalledWith(
      'finance_consumer_session',
      expect.any(String),
      expect.objectContaining({ secure: true }),
    );
  });

  it('does not set a cookie when Telegram bootstrap validation fails', async () => {
    const { controller, contexts, response } = setup();
    contexts.fromInitData.mockRejectedValue(new Error('invalid initData'));

    await expect(
      controller.authBootstrap(
        'bot-1',
        'forged-init-data',
        trustedMutationRequest(),
        response,
      ),
    ).rejects.toThrow('invalid initData');
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('rejects an unsafe consumer request without the CSRF header', async () => {
    const { controller, contexts, response } = setup();
    const untrusted = request();
    untrusted.method = 'POST';

    await expect(
      controller.authBootstrap(
        'bot-1',
        'signed-init-data',
        untrusted,
        response,
      ),
    ).rejects.toThrow('Finance consumer request is not trusted');
    expect(contexts.fromInitData).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('keeps the signed browser callback return inside the selected Finance app', async () => {
    const { controller, response } = setup();
    const callbackRequest = request(undefined, 'https');
    const config = await controller.browserConfig(
      'bot-1',
      callbackRequest,
      response,
      '/dashboard',
    );
    const state = new URL(config.callbackUrl).searchParams.get('state');

    expect(state).toBeTruthy();
    expect(config.callbackUrl).toContain(
      'https://api.example/api/finance-bots/bot-1/auth/browser?',
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'finance_browser_login_state',
      state,
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 10 * 60 * 1000,
        path: '/api/finance-bots/bot-1/auth/browser',
      }),
    );

    await controller.browserLogin(
      'bot-1',
      { returnTo: '/dashboard', state: state! },
      request(`finance_browser_login_state=${state}`, 'https'),
      response,
    );

    expect(response.clearCookie).toHaveBeenCalledWith(
      'finance_browser_login_state',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/api/finance-bots/bot-1/auth/browser',
      }),
    );
    expect(response.redirect).toHaveBeenCalledWith(
      'https://finance.example/finance/bot-1',
    );
  });

  it('creates a domain-independent Telegram deep-link login challenge', async () => {
    const { controller, contexts, transfers } = setup();
    const loginRequest = trustedMutationRequest('https');

    await expect(
      controller.createBrowserLoginChallenge('bot-1', loginRequest),
    ).resolves.toMatchObject({
      token: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/u),
      loginUrl: expect.stringContaining('https://t.me/finance_bot?start='),
    });
    expect(contexts.browserLoginConfig).toHaveBeenCalledWith('bot-1');
    expect(transfers.createBrowserLogin).toHaveBeenCalledWith(
      'bot-1',
      'finance_bot',
    );
  });

  it('issues the browser session only after the bot approved the challenge', async () => {
    const { controller, transfers, response } = setup();
    transfers.consumeBrowserLogin.mockResolvedValue({
      status: 'approved',
      session: {
        profileId: 'profile-1',
        botIntegrationId: 'bot-1',
        telegramBotUserId: 'telegram-user-1',
        telegramChatId: '12345',
        workspaceId: 'workspace-1',
        defaultCurrency: 'UAH',
      },
    });

    await expect(
      controller.consumeBrowserLoginChallenge(
        'bot-1',
        { token: 'a'.repeat(32) },
        trustedMutationRequest('https'),
        response,
      ),
    ).resolves.toEqual({ status: 'authenticated', profile });
    expect(response.cookie).toHaveBeenCalledWith(
      'finance_consumer_session',
      expect.any(String),
      expect.objectContaining({ secure: true, sameSite: 'none' }),
    );
  });

  it('rejects a browser callback without the initiating browser state', async () => {
    const { controller, contexts, response } = setup();

    await expect(
      controller.browserLogin(
        'bot-1',
        { state: 'replayed-state' },
        request(undefined, 'https'),
        response,
      ),
    ).rejects.toThrow('Finance browser login state is invalid');
    expect(contexts.fromTelegramLogin).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
    expect(response.redirect).not.toHaveBeenCalled();
  });

  it('consumes browser login state so a callback cannot be replayed', async () => {
    const { controller, contexts, response } = setup();
    const state = 'single-use-browser-state';

    await controller.browserLogin(
      'bot-1',
      { state },
      request(`finance_browser_login_state=${state}`, 'https'),
      response,
    );

    expect(response.clearCookie).toHaveBeenCalledWith(
      'finance_browser_login_state',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matcher is intentionally untyped.
      expect.not.objectContaining({ maxAge: expect.anything() }),
    );
    expect(contexts.fromTelegramLogin).toHaveBeenCalledTimes(1);

    await expect(
      controller.browserLogin(
        'bot-1',
        { state },
        request(undefined, 'https'),
        response,
      ),
    ).rejects.toThrow('Finance browser login state is invalid');
    expect(contexts.fromTelegramLogin).toHaveBeenCalledTimes(1);
  });
});

import {
  GreeterAutomationEnvironment,
  GreeterJoinRequestStatus,
} from '@prisma/client';
import { createHmac } from 'crypto';
import { GreeterService } from './greeter.service';

describe('GreeterService callback fencing', () => {
  const bot = {
    id: 'bot',
    workspaceId: 'workspace',
    botTokenEncrypted: 'encrypted',
    botTokenIv: 'iv',
    botTokenAuthTag: 'tag',
  } as any;
  const callbackContext = (userId: number, data: string) =>
    ({
      bot,
      runtime: {},
      token: 'token',
      updateLogId: 'update',
      update: { callback_query: { id: 'query', data, from: { id: userId } } },
    }) as any;

  it('starts AFTER_START only from an actual start interaction', async () => {
    const users = {
      upsertFromUpdate: jest.fn().mockResolvedValue({ id: 'user' }),
    } as any;
    const automations = { enrollForTrigger: jest.fn() } as any;
    const service = new GreeterService(
      {} as any,
      users,
      {} as any,
      {} as any,
      automations,
      {} as any,
      {} as any,
    );

    await service.handle({
      bot,
      updateLogId: 'one',
      update: {
        message: { chat: { id: 44 }, from: { id: 44 }, text: 'hello' },
      },
    } as any);
    await service.handle({
      bot,
      updateLogId: 'two',
      update: {
        message: { chat: { id: 44 }, from: { id: 44 }, text: '/start source' },
      },
    } as any);

    expect(automations.enrollForTrigger).toHaveBeenCalledTimes(1);
    expect(automations.enrollForTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace',
        botIntegrationId: 'bot',
        telegramBotUserId: 'user',
        trigger: 'AFTER_START',
      }),
    );
  });

  it('routes the selected tester through TEST draft once per generation', async () => {
    const users = {
      upsertFromUpdate: jest.fn().mockResolvedValue({ id: 'tester' }),
    } as any;
    const automations = { enrollForTrigger: jest.fn() } as any;
    const testMode = {
      activeSession: jest.fn().mockResolvedValue({
        id: 'session',
        generation: 3,
        channelId: 'channel',
      }),
      claimStart: jest
        .fn()
        .mockResolvedValueOnce({ firstStart: true })
        .mockResolvedValueOnce({ firstStart: false }),
    } as any;
    const service = new GreeterService(
      {} as any,
      users,
      {} as any,
      {} as any,
      automations,
      {} as any,
      {} as any,
      testMode,
    );
    const context = {
      bot,
      updateLogId: 'test-start',
      update: {
        message: { chat: { id: 44 }, from: { id: 44 }, text: '/start' },
      },
    } as any;

    await service.handle(context);
    await service.handle(context);

    expect(users.upsertFromUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ trackProductionActivity: false }),
    );
    expect(automations.enrollForTrigger).toHaveBeenCalledTimes(1);
    expect(automations.enrollForTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: GreeterAutomationEnvironment.TEST,
        channelId: 'channel',
        runKey: 'TEST:session:3',
      }),
    );
  });

  it('persists a wrong SIMPLE_CHOICE attempt without approving', async () => {
    const join = {
      id: 'join',
      workspaceId: 'workspace',
      botIntegrationId: 'bot',
      telegramUserId: '44',
      status: GreeterJoinRequestStatus.PENDING_CAPTCHA,
      expiredAt: new Date(Date.now() + 60_000),
      callbackToken: 'callback',
      captchaAnswer: '4',
    };
    const prisma = {
      greeterJoinRequest: {
        findUnique: jest.fn().mockResolvedValue(join),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as any;
    const api = {
      answerCallbackQuery: jest.fn(),
      approveChatJoinRequest: jest.fn(),
    } as any;
    const service = new GreeterService(
      prisma,
      { upsertFromUpdate: jest.fn() } as any,
      api,
      { decrypt: jest.fn().mockReturnValue('token') } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await service.handle(callbackContext(44, 'g:callback:wrong'));
    expect(prisma.greeterJoinRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'join', status: GreeterJoinRequestStatus.PENDING_CAPTCHA },
      data: {
        captchaWrongAttempts: { increment: 1 },
        captchaFailedAt: expect.any(Date),
      },
    });
    expect(api.approveChatJoinRequest).not.toHaveBeenCalled();
    expect(api.answerCallbackQuery).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ text: 'Try again.' }),
    );
  });

  it('approves a correct choice, queues success, and fires the exact acquisition trigger', async () => {
    const answer = createHmac('sha256', 'callback')
      .update('4')
      .digest('base64url')
      .slice(0, 16);
    const base = {
      id: 'join',
      workspaceId: 'workspace',
      botIntegrationId: 'bot',
      telegramUserId: '44',
      telegramBotUserId: 'user',
      channelId: 'channel',
      status: GreeterJoinRequestStatus.PENDING_CAPTCHA,
      expiredAt: new Date(Date.now() + 60_000),
      callbackToken: 'callback',
      captchaAnswer: '4',
      expiryClaimOwner: null,
    };
    const detailed = {
      ...base,
      expiryClaimOwner: expect.anything(),
      captchaPassedAt: new Date(),
      captchaChatId: '900',
      channel: { telegramChatId: '-100', title: 'News', username: 'news' },
      telegramUser: {
        telegramChatId: '44',
        firstName: 'Ada',
        lastName: null,
        username: 'ada',
      },
      greeterChannel: { workspaceId: 'workspace', useGlobalConfig: true },
    };
    let approvalOwner: string | null = null;
    const updateMany = jest.fn().mockImplementation(async ({ data }: any) => {
      if (data.expiryClaimOwner) approvalOwner = data.expiryClaimOwner;
      return { count: 1 };
    });
    const prisma = {
      greeterJoinRequest: {
        findUnique: jest.fn().mockResolvedValue(base),
        updateMany,
        findFirst: jest.fn().mockImplementation(async () => ({
          ...detailed,
          expiryClaimOwner: approvalOwner,
        })),
        update: jest.fn(),
      },
    } as any;
    const api = {
      answerCallbackQuery: jest.fn(),
      approveChatJoinRequest: jest.fn(),
    } as any;
    const automations = { enrollForTrigger: jest.fn() } as any;
    const delivery = {
      enqueueSendMessage: jest
        .fn()
        .mockResolvedValue({ id: 'success-delivery' }),
    } as any;
    const service = new GreeterService(
      prisma,
      { upsertFromUpdate: jest.fn() } as any,
      api,
      { decrypt: jest.fn().mockReturnValue('token') } as any,
      automations,
      {
        effectiveConfig: jest.fn().mockResolvedValue({
          successMessage: 'Welcome **{{user.firstName}}**',
        }),
      } as any,
      delivery,
    );
    await service.handle(callbackContext(44, `g:callback:${answer}`));
    expect(api.approveChatJoinRequest).toHaveBeenCalledWith('token', {
      chat_id: '-100',
      user_id: '44',
    });
    expect(delivery.enqueueSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: '44',
        text: 'Welcome <b>Ada</b>',
        parseMode: 'HTML',
        idempotencyKey: 'greeter-success:join',
      }),
    );
    expect(automations.enrollForTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace',
        botIntegrationId: 'bot',
        telegramBotUserId: 'user',
        trigger: 'AFTER_CAPTCHA_SUCCESS',
        channelId: 'channel',
        joinRequestId: 'join',
      }),
    );
  });

  it('rejects the wrong callback user and treats a duplicate approved callback as inactive', async () => {
    const prisma = {
      greeterJoinRequest: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            workspaceId: 'workspace',
            botIntegrationId: 'bot',
            telegramUserId: '44',
            status: GreeterJoinRequestStatus.PENDING_CAPTCHA,
          })
          .mockResolvedValueOnce({
            workspaceId: 'workspace',
            botIntegrationId: 'bot',
            telegramUserId: '55',
            status: GreeterJoinRequestStatus.APPROVED,
          }),
        updateMany: jest.fn(),
      },
    } as any;
    const api = {
      answerCallbackQuery: jest.fn(),
      approveChatJoinRequest: jest.fn(),
    } as any;
    const service = new GreeterService(
      prisma,
      { upsertFromUpdate: jest.fn() } as any,
      api,
      { decrypt: jest.fn().mockReturnValue('token') } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await service.handle(callbackContext(55, 'g:token:ok'));
    await service.handle(callbackContext(55, 'g:token:ok'));
    expect(api.approveChatJoinRequest).not.toHaveBeenCalled();
    expect(prisma.greeterJoinRequest.updateMany).not.toHaveBeenCalled();
    expect(api.answerCallbackQuery).toHaveBeenCalledTimes(2);
  });
  it('uses user_chat_id and queues one durable CAPTCHA for a duplicate update', async () => {
    const configured = {
      id: 'gc',
      workspaceId: 'workspace',
      botIntegrationId: 'bot',
      channelId: 'channel',
      enabled: true,
      useGlobalConfig: true,
      channel: { id: 'channel', title: 'News', username: 'news' },
      config: null,
    };
    const join = {
      id: 'join',
      callbackToken: 'token',
      captchaChatId: '900',
      telegramBotUserId: 'user',
    };
    const prisma = {
      greeterChannel: { findFirst: jest.fn().mockResolvedValue(configured) },
      telegramChannelSourceAccess: {
        findUnique: jest.fn().mockResolvedValue({ canInviteUsers: true }),
      },
      greeterJoinRequest: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(join),
        create: jest.fn().mockResolvedValue(join),
        update: jest.fn(),
      },
    } as any;
    const delivery = {
      enqueueSendMessage: jest.fn().mockResolvedValue({ id: 'delivery' }),
    } as any;
    const service = new GreeterService(
      prisma,
      { upsertActor: jest.fn().mockResolvedValue({ id: 'user' }) } as any,
      {} as any,
      {} as any,
      {} as any,
      {
        effectiveConfig: jest.fn().mockResolvedValue({
          captchaEnabled: true,
          captchaType: 'BUTTON_CONFIRM',
          captchaMessage: 'Hi',
          confirmButtonText: 'Confirm',
          choicePrompt: 'Pick',
          timeoutMinutes: 30,
        }),
      } as any,
      delivery,
    );
    const context = {
      bot: { id: 'bot', workspaceId: 'workspace' },
      updateLogId: 'update',
      update: {
        chat_join_request: {
          chat: { id: -100 },
          from: { id: 44, first_name: 'Ada' },
          user_chat_id: 900,
          date: 1,
          invite_link: { invite_link: 'https://t.me/+private-secret' },
        },
      },
    } as any;
    await service.handle(context);
    await service.handle(context);
    expect(delivery.enqueueSendMessage).toHaveBeenCalledTimes(1);
    expect(delivery.enqueueSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: '900',
        idempotencyKey: 'greeter-captcha:join',
      }),
    );
    expect(prisma.greeterJoinRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ captchaDeliveryId: 'delivery' }),
      }),
    );
    expect(prisma.greeterJoinRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceInviteLink: expect.stringMatching(/^sha256:/),
        }),
      }),
    );
    expect(
      JSON.stringify(prisma.greeterJoinRequest.create.mock.calls),
    ).not.toContain('private-secret');
  });

  it('immediately approves when CAPTCHA is disabled without queuing a CAPTCHA delivery', async () => {
    const configured = {
      id: 'gc',
      workspaceId: 'workspace',
      botIntegrationId: 'bot',
      channelId: 'channel',
      enabled: true,
      useGlobalConfig: true,
      channel: {
        id: 'channel',
        telegramChatId: '-100',
        title: 'News',
        username: null,
      },
      config: null,
    };
    const created = {
      id: 'join',
      workspaceId: 'workspace',
      botIntegrationId: 'bot',
      telegramUserId: '44',
      telegramBotUserId: 'user',
      channelId: 'channel',
      status: GreeterJoinRequestStatus.PENDING_CAPTCHA,
      callbackToken: 'token',
      captchaAnswer: null,
      captchaChatId: '900',
      captchaPassedAt: null,
    };
    const detailed = {
      ...created,
      channel: configured.channel,
      telegramUser: { telegramChatId: '44', firstName: 'Ada' },
      greeterChannel: configured,
    };
    const prisma = {
      greeterChannel: { findFirst: jest.fn().mockResolvedValue(configured) },
      telegramChannelSourceAccess: {
        findUnique: jest.fn().mockResolvedValue({ canInviteUsers: true }),
      },
      greeterJoinRequest: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
        findFirst: jest.fn().mockResolvedValue(detailed),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
    } as any;
    const api = { approveChatJoinRequest: jest.fn() } as any;
    const automations = { enrollForTrigger: jest.fn() } as any;
    const delivery = { enqueueSendMessage: jest.fn() } as any;
    const configuration = {
      effectiveConfig: jest.fn().mockResolvedValue({
        captchaEnabled: false,
        captchaType: 'BUTTON_CONFIRM',
        timeoutMinutes: 30,
        successMessage: null,
      }),
    } as any;
    const service = new GreeterService(
      prisma,
      { upsertActor: jest.fn().mockResolvedValue({ id: 'user' }) } as any,
      api,
      { decrypt: jest.fn().mockReturnValue('token') } as any,
      automations,
      configuration,
      delivery,
    );
    await service.handle({
      bot,
      runtime: {} as any,
      token: 'token',
      updateLogId: 'update',
      update: {
        chat_join_request: {
          chat: { id: -100 },
          from: { id: 44 },
          user_chat_id: 900,
          date: 1,
        },
      },
    } as any);
    expect(api.approveChatJoinRequest).toHaveBeenCalledWith('token', {
      chat_id: '-100',
      user_id: '44',
    });
    expect(delivery.enqueueSendMessage).not.toHaveBeenCalled();
    expect(automations.enrollForTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'AFTER_CAPTCHA_SUCCESS',
        channelId: 'channel',
        joinRequestId: 'join',
      }),
    );
  });

  it('does not approve when the expiry worker already claimed the join request', async () => {
    const prisma = {
      greeterJoinRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'join',
          workspaceId: 'workspace',
          botIntegrationId: 'bot',
          telegramUserId: '44',
          status: GreeterJoinRequestStatus.PENDING_CAPTCHA,
          expiredAt: new Date(Date.now() + 60_000),
          callbackToken: 'callback',
          captchaAnswer: null,
          expiryClaimOwner: 'expiry-worker',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn(),
      },
    } as any;
    const api = {
      answerCallbackQuery: jest.fn(),
      approveChatJoinRequest: jest.fn(),
    } as any;
    const service = new GreeterService(
      prisma,
      { upsertFromUpdate: jest.fn().mockResolvedValue({ id: 'user' }) } as any,
      api,
      { decrypt: jest.fn().mockReturnValue('bot-token') } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.handle({
      bot: {
        id: 'bot',
        workspaceId: 'workspace',
        botTokenEncrypted: 'encrypted',
        botTokenIv: 'iv',
        botTokenAuthTag: 'tag',
      } as any,
      runtime: {} as any,
      token: 'bot-token',
      updateLogId: 'update',
      update: {
        update_id: 1,
        callback_query: {
          id: 'query',
          data: 'g:callback:ok',
          from: { id: 44 },
        },
      },
    });

    expect(api.approveChatJoinRequest).not.toHaveBeenCalled();
    expect(api.answerCallbackQuery).toHaveBeenCalledWith(
      'bot-token',
      expect.objectContaining({
        text: 'This verification is no longer active.',
      }),
    );
  });

  it('does not start CAPTCHA from a degraded permission snapshot', async () => {
    const prisma = {
      greeterChannel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'gc',
          workspaceId: 'workspace',
          botIntegrationId: 'bot',
          channelId: 'channel',
          enabled: true,
          permissionError: 'Telegram permissions could not be refreshed',
          channel: { id: 'channel', title: 'News' },
        }),
      },
      telegramChannelSourceAccess: {
        findUnique: jest.fn().mockResolvedValue({ canInviteUsers: true }),
      },
      greeterJoinRequest: { create: jest.fn() },
    } as any;
    const users = { upsertActor: jest.fn() } as any;
    const service = new GreeterService(
      prisma,
      users,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.handle({
      bot,
      runtime: {} as any,
      token: 'bot-token',
      updateLogId: 'update',
      update: {
        chat_join_request: {
          chat: { id: -100 },
          from: { id: 44 },
          user_chat_id: 900,
        },
      },
    });

    expect(users.upsertActor).not.toHaveBeenCalled();
    expect(prisma.greeterJoinRequest.create).not.toHaveBeenCalled();
  });
});

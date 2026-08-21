import { ForbiddenException } from '@nestjs/common';
import { FinanceConsumerSessionService } from './finance-consumer-session.service';

describe('FinanceConsumerSessionService', () => {
  const ttlSeconds = 60 * 60 * 24 * 30;
  const session = {
    profileId: 'profile-1',
    botIntegrationId: 'bot-1',
    telegramBotUserId: 'user-1',
    workspaceId: 'workspace-1',
    defaultCurrency: 'UAH',
  };

  function setup(ttl = ttlSeconds) {
    const prisma = {
      telegramBotIntegration: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ financeConsumerSessionTtlSeconds: ttl }),
      },
    };
    const config = {
      get: jest.fn().mockReturnValue(Buffer.alloc(32, 7).toString('base64')),
    };
    return {
      prisma,
      service: new FinanceConsumerSessionService(
        prisma as never,
        config as never,
      ),
    };
  }

  it('uses the bot TTL when issuing and accepts the cookie without a database lookup on verification', async () => {
    const { prisma, service } = setup(3600);
    const issued = await service.issue(session);
    expect(issued.ttlSeconds).toBe(3600);
    expect(
      service.fromRequest(
        {
          headers: { cookie: `finance_consumer_session=${issued.token}` },
        } as never,
        'bot-1',
      ),
    ).toEqual(session);
    expect(
      prisma.telegramBotIntegration.findUniqueOrThrow,
    ).toHaveBeenCalledTimes(1);
  });

  it('rejects a dashboard-shaped, expired, tampered, or cross-bot session', async () => {
    const { service } = setup();
    const valid = (await service.issue(session, new Date())).token;
    expect(() =>
      service.fromRequest(
        { headers: { cookie: `finance_consumer_session=${valid}x` } } as never,
        'bot-1',
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.fromRequest(
        { headers: { cookie: `finance_consumer_session=${valid}` } } as never,
        'another-bot',
      ),
    ).toThrow(ForbiddenException);
    const expired = (
      await service.issue(session, new Date('2020-01-01T00:00:00Z'))
    ).token;
    expect(() =>
      service.fromRequest(
        { headers: { cookie: `finance_consumer_session=${expired}` } } as never,
        'bot-1',
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.verify('eyJzdWIiOiJhZG1pbiJ9.signature', 'bot-1'),
    ).toThrow(ForbiddenException);
  });

  it('distinguishes a missing cookie from an invalid cookie for session bootstrap', () => {
    const { service } = setup();
    expect(service.inspectRequest({ headers: {} } as never, 'bot-1')).toEqual({
      authenticated: false,
      clearCookie: false,
    });
    expect(
      service.inspectRequest(
        {
          headers: { cookie: 'finance_consumer_session=invalid' },
        } as never,
        'bot-1',
      ),
    ).toEqual({ authenticated: false, clearCookie: true });
  });

  it('rejects a signing root key that is not exactly 32 bytes', () => {
    expect(
      () =>
        new FinanceConsumerSessionService(
          {} as never,
          {
            get: () => Buffer.alloc(31).toString('base64'),
          } as never,
        ),
    ).toThrow('BOT_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  });
});

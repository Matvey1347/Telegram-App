import { ForbiddenException } from '@nestjs/common';
import { FinanceConsumerSessionService } from './finance-consumer-session.service';

describe('FinanceConsumerSessionService', () => {
  const previousSecret = process.env.FINANCE_CONSUMER_SESSION_SECRET;
  beforeAll(() => {
    process.env.FINANCE_CONSUMER_SESSION_SECRET =
      '01234567890123456789012345678901';
  });
  afterAll(() => {
    if (previousSecret === undefined)
      delete process.env.FINANCE_CONSUMER_SESSION_SECRET;
    else process.env.FINANCE_CONSUMER_SESSION_SECRET = previousSecret;
  });
  const session = {
    profileId: 'profile-1',
    botIntegrationId: 'bot-1',
    telegramBotUserId: 'user-1',
    workspaceId: 'workspace-1',
    defaultCurrency: 'UAH',
  };

  it('accepts its own valid cookie without a database lookup', () => {
    const service = new FinanceConsumerSessionService();
    const token = service.issue(session);
    expect(
      service.fromRequest(
        { headers: { cookie: `finance_consumer_session=${token}` } } as never,
        'bot-1',
      ),
    ).toEqual(session);
  });

  it('rejects a dashboard-shaped, expired, tampered, or cross-bot session', () => {
    const service = new FinanceConsumerSessionService();
    const valid = service.issue(session, new Date());
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
    const expired = service.issue(session, new Date('2020-01-01T00:00:00Z'));
    expect(() =>
      service.fromRequest(
        { headers: { cookie: `finance_consumer_session=${expired}` } } as never,
        'bot-1',
      ),
    ).toThrow(ForbiddenException);
    expect(() => service.verify('eyJzdWIiOiJhZG1pbiJ9.signature')).toThrow(
      ForbiddenException,
    );
  });
});

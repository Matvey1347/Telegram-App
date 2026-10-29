import { ForbiddenException } from '@nestjs/common';
import { FinanceSessionService } from './finance-session.service';

const config = {
  sessionSigningKey: 'a-secure-finance-session-signing-key-32-chars',
  bootstrapSigningKey: 'a-secure-finance-bootstrap-key-with-32-chars',
};

describe('FinanceSessionService', () => {
  it('issues a bot-scoped session for a local Finance identity', () => {
    const service = new FinanceSessionService(config as never);
    const token = service.issue({
      financeBotId: 'finance-bot-1',
      financeTelegramUserId: 'local-user-1',
      profileId: 'profile-1',
    });
    expect(service.authenticate(`Bearer ${token}`, 'finance-bot-1')).toMatchObject({
      financeTelegramUserId: 'local-user-1',
      profileId: 'profile-1',
    });
    expect(() => service.authenticate(`Bearer ${token}`, 'other-bot')).toThrow(ForbiddenException);
  });

  it('requires a fresh signed bootstrap proof instead of trusting a Telegram id', () => {
    const service = new FinanceSessionService(config as never);
    const issuedAt = Date.now();
    const signature = service.bootstrapSignature(`finance-bot-1:12345:${issuedAt}`);
    expect(() => service.verifyBootstrap('finance-bot-1', '12345', issuedAt, signature)).not.toThrow();
    expect(() => service.verifyBootstrap('finance-bot-1', '54321', issuedAt, signature)).toThrow(
      ForbiddenException,
    );
  });

  it('allows Checkout only with an explicitly signed external web surface', () => {
    const service = new FinanceSessionService(config as never);
    const subject = { financeBotId: 'bot-1', financeTelegramUserId: 'user-1', profileId: 'profile-1' };
    const external = service.authenticate(`Bearer ${service.issue({ ...subject, surface: 'EXTERNAL_WEB' })}`);
    expect(() => service.assertExternalCheckout(external)).not.toThrow();
    const legacy = service.authenticate(`Bearer ${service.issue(subject)}`);
    expect(() => service.assertExternalCheckout(legacy)).toThrow(ForbiddenException);
  });
});

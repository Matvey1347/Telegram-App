import { ForbiddenException } from '@nestjs/common';
import { FinanceConsumerRequestService } from './finance-consumer-request.service';

describe('FinanceConsumerRequestService', () => {
  it('keeps unsafe routes behind the consumer header and bot-scoped session', () => {
    const sessions = {
      fromRequest: jest.fn().mockReturnValue({ profileId: 'profile-1' }),
    };
    const service = new FinanceConsumerRequestService(sessions as never);
    const untrusted = { method: 'POST', headers: {} } as never;
    expect(() => service.authenticate('bot-1', untrusted)).toThrow(
      ForbiddenException,
    );
    const trusted = {
      method: 'PATCH',
      headers: { 'x-finance-consumer-request': '1' },
    } as never;
    expect(service.authenticate('bot-1', trusted)).toEqual({
      profileId: 'profile-1',
    });
    expect(sessions.fromRequest).toHaveBeenCalledWith(trusted, 'bot-1');
  });

  it('can protect a pre-session unsafe endpoint with the same policy', () => {
    const service = new FinanceConsumerRequestService({} as never);
    expect(() =>
      service.assertMutation({ method: 'POST', headers: {} } as never),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.assertMutation({
        method: 'POST',
        headers: { 'x-finance-consumer-request': '1' },
      } as never),
    ).not.toThrow();
  });
});

import { HttpException } from '@nestjs/common';
import { PasswordResetRateLimitService } from './password-reset-rate-limit.service';

describe('PasswordResetRateLimitService', () => {
  let service: PasswordResetRateLimitService;

  beforeEach(() => {
    service = new PasswordResetRateLimitService();
  });

  it('limits forgot-password by normalized account across IP addresses', () => {
    service.checkForgot('10.0.0.1', 'Person@Example.test');
    service.checkForgot('10.0.0.2', ' person@example.TEST ');
    service.checkForgot('10.0.0.3', 'PERSON@example.test');

    expect(() =>
      service.checkForgot('10.0.0.4', 'person@example.test'),
    ).toThrow(HttpException);
  });

  it('limits forgot-password by IP across account names', () => {
    for (let index = 0; index < 5; index += 1) {
      service.checkForgot('10.0.0.1', `person-${index}@example.test`);
    }
    expect(() =>
      service.checkForgot('10.0.0.1', 'another@example.test'),
    ).toThrow(HttpException);
  });

  it('limits reset attempts by token without retaining the raw token', () => {
    for (let index = 0; index < 5; index += 1) {
      service.checkReset(`10.0.0.${index}`, 'raw-secret-token');
    }
    expect(() => service.checkReset('10.0.0.9', 'raw-secret-token')).toThrow(
      HttpException,
    );
    try {
      service.checkReset('10.0.0.9', 'raw-secret-token');
    } catch (error) {
      expect((error as HttpException).getResponse()).toEqual(
        expect.objectContaining({ code: 'AUTH_TOO_MANY_ATTEMPTS' }),
      );
    }
    expect(JSON.stringify(service)).not.toContain('raw-secret-token');
  });
});

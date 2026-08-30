import { ConfigService } from '@nestjs/config';
import { PasswordResetEmailService } from './password-reset-email.service';

describe('PasswordResetEmailService', () => {
  it('safely suppresses delivery without exposing a token in development', async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const service = new PasswordResetEmailService(
      config as unknown as ConfigService,
    );

    await expect(
      service.send('person@example.test', 'secret-reset-token'),
    ).resolves.toBeUndefined();
  });

  it('fails closed when production delivery is not configured', async () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'NODE_ENV' ? 'production' : undefined,
      ),
    };
    const service = new PasswordResetEmailService(
      config as unknown as ConfigService,
    );

    await expect(
      service.send('person@example.test', 'secret-reset-token'),
    ).rejects.toThrow('Password reset email delivery is not configured');
  });
});

import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { PasswordResetEmailService } from './password-reset-email.service';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

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

  it('sends Russian reset copy for a Russian user preference', async () => {
    const values: Record<string, string> = {
      SMTP_HOST: 'smtp.example.test',
      SMTP_USER: 'user',
      SMTP_PASSWORD: 'password',
      SMTP_FROM: 'Nexeloq <noreply@example.test>',
      FRONTEND_URL: 'https://app.example.test',
      SMTP_PORT: '587',
    };
    const config = {
      get: jest.fn((key: string) => values[key]),
    };
    const sendMail = jest.fn().mockResolvedValue(undefined);
    jest
      .mocked(nodemailer.createTransport)
      .mockReturnValue({ sendMail } as never);
    const service = new PasswordResetEmailService(
      config as unknown as ConfigService,
    );

    await service.send('person@example.test', 'secret-reset-token', 'ru');

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Сброс пароля Telegram System',
        text: expect.stringMatching(
          /reset-password\?token=secret-reset-token&locale=ru[\s\S]*Ссылка действует 60 минут/,
        ),
        html: expect.stringContaining('Сбросить пароль'),
      }),
    );
  });
});

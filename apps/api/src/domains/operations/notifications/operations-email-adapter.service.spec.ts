import nodemailer from 'nodemailer';
import { OperationsEmailAdapterService } from './operations-email-adapter.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('OperationsEmailAdapterService', () => {
  it('sends a notification using the configured SMTP adapter', async () => {
    const config: any = {
      get: (key: string) =>
        ({
          SMTP_HOST: 'smtp.example.test',
          SMTP_USER: 'user',
          SMTP_PASSWORD: 'secret',
          SMTP_FROM: 'Nexeloq <no-reply@example.test>',
          SMTP_PORT: '587',
          FRONTEND_URL: 'https://app.example.test',
        })[key],
    };
    const sendMail = jest.fn().mockResolvedValue(undefined);
    jest
      .mocked(nodemailer.createTransport)
      .mockReturnValue({ sendMail } as never);
    const adapter = new OperationsEmailAdapterService(config);
    await adapter.send({
      recipient: 'member@example.test',
      title: 'Weekly report',
      body: 'Coverage is 14 days',
      targetUrl: '/telegram-channels/channel/ai-posting',
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'member@example.test',
        subject: 'Weekly report',
        text: expect.stringContaining(
          'https://app.example.test/telegram-channels/channel/ai-posting',
        ),
      }),
    );
  });

  it('fails closed when SMTP is not configured', async () => {
    const adapter = new OperationsEmailAdapterService({
      get: () => undefined,
    } as any);
    await expect(
      adapter.send({
        recipient: 'member@example.test',
        title: 'Report',
        body: 'Summary',
        targetUrl: '/',
      }),
    ).rejects.toThrow('EMAIL_NOT_CONFIGURED');
  });
});

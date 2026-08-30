import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class PasswordResetEmailService {
  private readonly logger = new Logger(PasswordResetEmailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(recipient: string, rawToken: string): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASSWORD');
    const from = this.config.get<string>('SMTP_FROM')?.trim();
    const frontendUrl = this.config.get<string>('FRONTEND_URL')?.trim();

    if (!host || !user || !pass || !from || !frontendUrl) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new Error('Password reset email delivery is not configured');
      }
      this.logger.warn(
        'Password reset email suppressed because SMTP is not configured',
      );
      return;
    }

    const port = Number(this.config.get<string>('SMTP_PORT') || '587');
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('SMTP_PORT must be an integer between 1 and 65535');
    }

    const resetUrl = new URL('/reset-password', frontendUrl);
    resetUrl.searchParams.set('token', rawToken);
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transport.sendMail({
      from,
      to: recipient,
      subject: 'Reset your Telegram System password',
      text: `Reset your password using this link: ${resetUrl.toString()}\n\nThis link expires in 60 minutes and can be used once.`,
      html: `<p>Reset your password using the link below.</p><p><a href="${resetUrl.toString()}">Reset password</a></p><p>This link expires in 60 minutes and can be used once.</p>`,
    });
  }
}

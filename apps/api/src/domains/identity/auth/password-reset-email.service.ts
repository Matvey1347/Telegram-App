import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { normalizeAppLocale } from '@telegram-system/shared';
import { translateAuthOutput } from './i18n/auth-output';

@Injectable()
export class PasswordResetEmailService {
  private readonly logger = new Logger(PasswordResetEmailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(
    recipient: string,
    rawToken: string,
    locale?: string | null,
  ): Promise<void> {
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
    resetUrl.searchParams.set('locale', normalizeAppLocale(locale));
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    const subject = translateAuthOutput(locale, 'resetSubject');
    const intro = translateAuthOutput(locale, 'resetIntro');
    const action = translateAuthOutput(locale, 'resetAction');
    const expiry = translateAuthOutput(locale, 'resetExpiry');
    const url = resetUrl.toString();

    await transport.sendMail({
      from,
      to: recipient,
      subject,
      text: `${intro}\n${url}\n\n${expiry}`,
      html: `<p>${intro}</p><p><a href="${url}">${action}</a></p><p>${expiry}</p>`,
    });
  }
}

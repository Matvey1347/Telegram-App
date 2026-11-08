import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class OperationsEmailAdapterService {
  constructor(private readonly config: ConfigService) {}

  async send(input: {
    recipient: string;
    title: string;
    body: string;
    targetUrl: string;
  }) {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASSWORD');
    const from = this.config.get<string>('SMTP_FROM')?.trim();
    const frontendUrl = this.config.get<string>('FRONTEND_URL')?.trim();
    if (!host || !user || !pass || !from || !frontendUrl)
      throw new Error('EMAIL_NOT_CONFIGURED');
    const port = Number(this.config.get<string>('SMTP_PORT') || '587');
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('EMAIL_CONFIGURATION_INVALID');
    const url = new URL(input.targetUrl, frontendUrl).toString();
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transport.sendMail({
      from,
      to: input.recipient,
      subject: input.title.slice(0, 180),
      text: `${input.body}\n\n${url}`,
      html: `<p>${escapeHtml(input.body)}</p><p><a href="${escapeHtml(url)}">Open Nexeloq</a></p>`,
    });
  }
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );
}

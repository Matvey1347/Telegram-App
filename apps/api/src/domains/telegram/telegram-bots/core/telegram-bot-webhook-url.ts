import { BadRequestException } from '@nestjs/common';
import { TelegramBotRuntimeEnvironment } from '@prisma/client';

export function assertSafeTelegramWebhookBase(
  base: string,
  environment: TelegramBotRuntimeEnvironment,
) {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new BadRequestException(
      'Telegram bot webhook base URL must be an absolute HTTPS URL',
    );
  }
  if (url.protocol !== 'https:') {
    throw new BadRequestException(
      'Telegram bot webhook base URL must use HTTPS',
    );
  }
  if (environment !== TelegramBotRuntimeEnvironment.PRODUCTION) return;

  const host = url.hostname.toLowerCase();
  const localHost =
    host === 'localhost' || host === '::1' || host === '127.0.0.1';
  const developmentTunnelHost =
    host === 'ngrok.io' ||
    host.endsWith('.ngrok.io') ||
    host === 'ngrok-free.app' ||
    host.endsWith('.ngrok-free.app') ||
    host === 'trycloudflare.com' ||
    host.endsWith('.trycloudflare.com');
  if (localHost || developmentTunnelHost) {
    throw new BadRequestException(
      'Production Telegram webhooks cannot use localhost or development tunnel URLs',
    );
  }
}

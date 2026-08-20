import { Injectable } from '@nestjs/common';
import { sanitizeOperationalError } from '../../../../common/security/operational-error';
import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';
import { financeMiniAppUrl } from '../finance/finance-bot-chat-responder.service';

@Injectable()
export class TelegramBotRuntimeCheckService {
  constructor(private readonly botApi: TelegramBotApiClient) {}

  async presentation(token: string, botIntegrationId: string, isFinance: boolean) {
    const expectedUrl = isFinance ? financeMiniAppUrl(botIntegrationId) : null;
    if (!expectedUrl) {
      return {
        webApp: { status: 'NOT_CONFIGURED' as const, url: null, error: null },
        miniApp: {
          status: 'NOT_CONFIGURED' as const,
          expectedUrl: null,
          actualUrl: null,
          error: null,
        },
      };
    }
    const [webApp, menuButton] = await Promise.all([
      this.webApp(expectedUrl),
      this.botApi.getChatMenuButton(token),
    ]);
    const actualUrl =
      menuButton.type === 'web_app' ? menuButton.webAppUrl || null : null;
    const miniApp =
      actualUrl === expectedUrl
        ? { status: 'CONFIGURED' as const, expectedUrl, actualUrl, error: null }
        : actualUrl
          ? {
              status: 'ERROR' as const,
              expectedUrl,
              actualUrl,
              error: 'Telegram menu button points to another URL.',
            }
          : {
              status: 'NOT_CONFIGURED' as const,
              expectedUrl,
              actualUrl: null,
              error: 'Telegram menu button is not configured for this Mini App.',
            };
    return { webApp, miniApp };
  }

  private async webApp(url: string) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok
        ? { status: 'AVAILABLE' as const, url, error: null }
        : { status: 'ERROR' as const, url, error: `Web App returned HTTP ${response.status}.` };
    } catch (error) {
      return {
        status: 'ERROR' as const,
        url,
        error: sanitizeOperationalError(error, 'Web App is unavailable'),
      };
    }
  }
}

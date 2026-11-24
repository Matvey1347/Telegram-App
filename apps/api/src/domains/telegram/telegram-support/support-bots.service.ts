import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupportProduct } from '@telegram-system/shared';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolve4 } from 'node:dns/promises';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  isProductionEnvironment,
  publicApiOrigin,
} from '../../../config/deployment-config';
import { TelegramBotApiClient } from '../../../telegram/shared/bot/telegram-bot-api.client';

import { isTelegramUsername } from '../../../telegram/shared/imports/telegram-import.helpers';

export const SUPPORT_PRODUCTS = ['NEXELOQ', 'GROSHLY'] as const;
const prefixes = {
  NEXELOQ: 'TELEGRAM_SYSTEM_BOT',
  GROSHLY: 'FINANCE_BOT',
} as const;

/** An expired local tunnel may be replaced, but a live or remote owner wins. */
export async function isStaleLocalSupportWebhook(
  previous: string,
  next: string,
  resolve = resolve4,
) {
  let oldUrl: URL;
  let newUrl: URL;
  try {
    oldUrl = new URL(previous);
    newUrl = new URL(next);
  } catch {
    return false;
  }
  const quickTunnel = /^[a-z0-9-]+\.trycloudflare\.com$/i;
  if (oldUrl.protocol !== 'https:' || newUrl.protocol !== 'https:' ||
    !quickTunnel.test(oldUrl.hostname) || !quickTunnel.test(newUrl.hostname) ||
    oldUrl.hostname === newUrl.hostname || oldUrl.pathname !== newUrl.pathname) return false;
  try {
    await resolve(oldUrl.hostname);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOTFOUND';
  }
}

@Injectable()
export class SupportBotsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SupportBotsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly telegram: TelegramBotApiClient,
    private readonly db: PrismaService,
  ) {}

  private value(key: string) {
    return this.config.get<string>(key)?.trim() || undefined;
  }

  metadata(product: SupportProduct) {
    return {
      workspaceId:
        this.value(`${prefixes[product]}_DASHBOARD_WORKSPACE_ID`) ??
        this.value('TELEGRAM_SYSTEM_BOT_DASHBOARD_WORKSPACE_ID'),
      username:
        this.value(`${prefixes[product]}_SUPPORT_USERNAME`)?.replace(
          /^@/,
          '',
        ) ?? null,
    };
  }

  resolve(product: SupportProduct) {
    const { workspaceId, username } = this.metadata(product);
    const token = this.value(`${prefixes[product]}_SUPPORT_TOKEN`);
    if (!workspaceId || !username || !token) return null;
    const reservedKeys = [
      'TELEGRAM_SYSTEM_BOT_TOKEN',
      ...SUPPORT_PRODUCTS.flatMap((other) =>
        ['LOCAL', 'PRODUCTION'].map(
          (mode) => `${prefixes[other]}_${mode}_TOKEN`,
        ),
      ),
      ...SUPPORT_PRODUCTS.filter((other) => other !== product).map(
        (other) => `${prefixes[other]}_SUPPORT_TOKEN`,
      ),
    ];
    const botId = token.split(':')[0];
    if (!/^\d+$/.test(botId)) return null;
    const reserved = reservedKeys.some(
      (key) => this.value(key)?.split(':')[0] === botId,
    );
    if (reserved) return null;
    const secret =
      this.value(`${prefixes[product]}_SUPPORT_WEBHOOK_SECRET`) ??
      createHmac('sha256', token)
        .update(`support-webhook:${product}`)
        .digest('base64url');
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) return null;
    return { workspaceId, username, token, secret, botId };
  }

  publicUsername(product: SupportProduct, workspaceId: string) {
    const bot = this.resolve(product);
    return bot?.workspaceId === workspaceId && isTelegramUsername(bot.username)
      ? bot.username
      : null;
  }

  authenticate(product: SupportProduct, signature?: string) {
    const bot = this.resolve(product);
    const expected = Buffer.from(bot?.secret ?? '');
    const actual = Buffer.from(signature ?? '');
    if (
      !bot ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      throw new UnauthorizedException('Invalid support webhook');
    return bot;
  }

  onApplicationBootstrap() {
    const origin = publicApiOrigin();
    const owner = this.value('TELEGRAM_SUPPORT_WEBHOOK_OWNER');
    if (
      !origin ||
      !origin.startsWith('https://') ||
      owner === 'off' ||
      (!isProductionEnvironment() && owner !== 'local')
    )
      return;
    for (const product of SUPPORT_PRODUCTS) {
      void this.register(product, origin, owner === 'local' && !isProductionEnvironment()).catch(() =>
        this.logger.warn(`Could not register ${product} support webhook`),
      );
    }
  }

  private async register(product: SupportProduct, origin: string, replaceExpired: boolean) {
    const bot = this.resolve(product);
    if (!bot) return;
    const url = `${origin}/api/telegram-support/webhooks/${product}`;
    const [identity, existing, registered] = await Promise.all([
      this.telegram.getMe(bot.token),
      this.telegram.getWebhookInfo(bot.token),
      this.db.telegramBotRuntimeInstance.findFirst({
        where: { botId: bot.botId },
        select: { id: true },
      }),
    ]);
    if (registered)
      throw new Error('Support bot is already assigned to a regular runtime');
    if (identity.username?.toLowerCase() !== bot.username.toLowerCase())
      throw new Error('Support bot username mismatch');
    if (existing.url && existing.url !== url) {
      const stale = replaceExpired && typeof existing.url === 'string' &&
        await isStaleLocalSupportWebhook(existing.url, url);
      if (!stale || (await this.telegram.getWebhookInfo(bot.token)).url !== existing.url) {
        this.logger.warn(`${product} support webhook belongs to another endpoint`);
        return;
      }
    }
    await this.telegram.setWebhook(bot.token, url, bot.secret, ['message', 'message_reaction']);
  }
}

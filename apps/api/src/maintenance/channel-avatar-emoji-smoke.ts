import { parseTelegramCustomEmojiTokens } from '@api/telegram/shared/markup/telegram-custom-emoji-markup';
import { ChannelAvatarEmojiProcessorService } from '../domains/telegram/telegram-channels/channel-avatar-emoji-processor.service';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import {
  TelegramBotApiClient,
  TelegramBotApiError,
} from '@api/telegram/shared/bot/telegram-bot-api.client';
import {
  ChannelAvatarEmojiApi,
  AvatarEmojiApiError,
} from '@api/telegram/shared/emoji/channel-avatar-emoji-api';
import { TelegramSystemBotConfigService } from '../domains/telegram/telegram-system-bot/telegram-system-bot-config.service';
import { channelAvatarEmojiImage } from '../domains/telegram/telegram-channels/channel-avatar-emoji-image';
import { channelAvatarEmojiOwnedChannelWhere } from '../domains/telegram/telegram-channels/channel-avatar-emoji-ownership';
import type { AvatarEmojiMaintenanceOptions } from '../config/channel-avatar-emoji-maintenance';

/** Verifies LOCAL owner bindings and real Telegram emoji; no production changes or user sessions. */
export async function runAvatarEmojiSmoke(
  prisma: PrismaService,
  api: ChannelAvatarEmojiApi,
  bot: TelegramBotApiClient,
  system: TelegramSystemBotConfigService,
  config: ConfigService,
  options: AvatarEmojiMaintenanceOptions,
  processor?: ChannelAvatarEmojiProcessorService | null,
) {
  if (options.production || system.environment !== 'LOCAL' || !system.token)
    throw new AvatarEmojiApiError('Smoke requires LOCAL System Bot.');
  const channels = await prisma.telegramChannel.findMany({
    where: {
      ...channelAvatarEmojiOwnedChannelWhere(options.workspaceId),
      photoUrl: { not: null },
    },
    select: { id: true, photoUrl: true },
    orderBy: { id: 'asc' },
    take: 20,
  });
  const selected = channels
    .filter((channel) =>
      /^data:image\/(?:jpeg|png|webp);base64,/.test(channel.photoUrl ?? ''),
    )
    .slice(0, 2);
  if (!selected.length)
    throw new AvatarEmojiApiError(
      'No workspace-owned stored avatar is available for the smoke test.',
    );
  if (!options.execute)
    return {
      mode: 'smoke',
      dryRun: true,
      target: 'LOCAL',
      channels: selected.map((channel) => channel.id),
      ownerOnly: true,
    };
  const token = system.token;
  const owner = config.get<string>('TELEGRAM_AVATAR_EMOJI_OWNER_USER_ID')!;
  try {
    await bot.getChat(token, owner);
  } catch (error) {
    if (
      error instanceof TelegramBotApiError &&
      error.explicitRejected &&
      error.errorCode === 400
    )
      throw new AvatarEmojiApiError(
        'Owner must send /start to the selected LOCAL System Bot.',
        undefined,
        true,
        400,
      );
    throw error;
  }
  const webhookBefore = await bot.call<{
    url?: string;
    allowed_updates?: string[];
  }>(token, 'getWebhookInfo', {});
  const commandsBefore = await bot.call<unknown[]>(token, 'getMyCommands', {});
  const results: Array<Record<string, unknown>> = [];
  for (const channel of selected) {
    const source = Buffer.from(channel.photoUrl!.split(',')[1], 'base64');
    if (source.length > 5_000_000)
      throw new AvatarEmojiApiError('Stored avatar exceeds the smoke bound.');
    const image = await channelAvatarEmojiImage(source);
    if (!processor)
      throw new AvatarEmojiApiError(
        'LOCAL smoke requires the shared avatar processor.',
      );
    const binding = await processor.process(options.workspaceId, channel.id, {
      preparedImage: image,
      admit: true,
      scheduleRetry: false,
    });
    if (binding.status !== 'READY')
      throw new AvatarEmojiApiError('LOCAL avatar binding is not confirmed.');
    const saved = await prisma.telegramChannel.findFirst({
      where: { id: channel.id, workspaceId: options.workspaceId },
      select: {
        avatarEmojiStatus: true,
        avatarEmojiManual: true,
        avatarEmojiIconId: true,
        presentationIconId: true,
        avatarEmojiIcon: { select: { emoji: true } },
      },
    });
    const savedDocumentId = parseTelegramCustomEmojiTokens(
      saved?.avatarEmojiIcon?.emoji ?? '',
    )[0]?.documentId;
    const documentId = binding.customEmojiId ?? savedDocumentId;
    if (!documentId)
      throw new AvatarEmojiApiError('LOCAL avatar document ID is unavailable.');
    const documents = await bot.call<
      Array<{
        custom_emoji_id?: string;
        width?: number;
        height?: number;
        file_id: string;
        set_name?: string;
      }>
    >(token, 'getCustomEmojiStickers', {
      custom_emoji_ids: [documentId],
    });
    const document = documents.find(
      (item) => item.custom_emoji_id === documentId,
    );
    if (!document)
      throw new AvatarEmojiApiError('Telegram avatar document is unavailable.');
    const found = { customEmojiId: documentId, fileId: document.file_id };
    const name = document.set_name ?? api.packName(1);
    const file = await bot.getFile(token, found.fileId);
    if (!file.file_path)
      throw new AvatarEmojiApiError('Telegram avatar file is unavailable.');
    const downloaded = await bot.downloadFile(token, file.file_path, 256_000);
    const raw = await sharp(downloaded.bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) =>
      raw.data[(y * raw.info.width + x) * raw.info.channels + 3];
    const round =
      raw.info.width === 100 &&
      raw.info.height === 100 &&
      [
        [0, 0],
        [99, 0],
        [0, 99],
        [99, 99],
      ].every(([x, y]) => alpha(x, y) === 0) &&
      alpha(50, 50) > 0;
    const message = await bot.call<{
      message_id: number;
      entities?: Array<{ type: string; custom_emoji_id?: string }>;
    }>(token, 'sendMessage', {
      chat_id: owner,
      text: `Nexeloq LOCAL avatar emoji check\n<tg-emoji emoji-id="${found.customEmojiId}">📣</tg-emoji> Channel ${channel.id}`,
      parse_mode: 'HTML',
    });
    const entityAccepted =
      message.entities?.some(
        (entity) =>
          entity.type === 'custom_emoji' &&
          entity.custom_emoji_id === found.customEmojiId,
      ) ?? false;
    const databaseBindingVerified =
      saved?.avatarEmojiStatus === 'READY' &&
      !!saved.avatarEmojiIconId &&
      parseTelegramCustomEmojiTokens(saved.avatarEmojiIcon?.emoji ?? '')[0]
        ?.documentId === found.customEmojiId &&
      (saved.avatarEmojiManual ||
        saved.presentationIconId === saved.avatarEmojiIconId);
    const repeated = processor
      ? await processor.process(options.workspaceId, channel.id, {
          preparedImage: image,
          admit: true,
          scheduleRetry: false,
        })
      : null;
    results.push({
      databaseBindingVerified,
      repeatedImageReused:
        repeated?.status === 'READY' && repeated.createdDocument === false,

      channelId: channel.id,
      pack: name,
      documentId: found.customEmojiId,
      documentAvailable: documents.some(
        (doc) => doc.custom_emoji_id === found.customEmojiId,
      ),
      image100x100: raw.info.width === 100 && raw.info.height === 100,
      transparentRoundAvatar: round,
      messageId: message.message_id,
      customEmojiEntityAccepted: entityAccepted,
    });
  }
  const webhookAfter = await bot.call<{
    url?: string;
    allowed_updates?: string[];
  }>(token, 'getWebhookInfo', {});
  const commandsAfter = await bot.call<unknown[]>(token, 'getMyCommands', {});
  return {
    mode: 'smoke',
    dryRun: false,
    target: 'LOCAL',
    results,
    webhookUnchanged:
      webhookBefore.url === webhookAfter.url &&
      JSON.stringify(webhookBefore.allowed_updates) ===
        JSON.stringify(webhookAfter.allowed_updates),
    commandsUnchanged:
      JSON.stringify(commandsBefore) === JSON.stringify(commandsAfter),
    verified: results.every(
      (result) =>
        result.documentAvailable === true &&
        result.image100x100 === true &&
        result.transparentRoundAvatar === true &&
        result.customEmojiEntityAccepted === true &&
        result.databaseBindingVerified === true &&
        result.repeatedImageReused === true,
    ),
    note: 'Telegram accepted entity and downloaded image were checked; visual client rendering requires viewing these owner-chat messages.',
  };
}

import { Api, type TelegramClient } from 'telegram';
import { getInputMedia } from 'telegram/Utils';
import type { FileLike } from 'telegram/define';
import type { TelegramPostMediaItem } from '@telegram-system/shared';
import { normalizeTelegramPostMediaItems } from '@telegram-system/shared';
import { telegramHtmlToGramJsAlbumHtml } from '../markup/telegram-markup';
import { downloadTelegramPublishMotion } from './telegram-mtproto-publish-image';
import { withTelegramPublicationDeadline } from './telegram-publication-deadline';
import type {
  StoredTelegramChannelReference,
  TelegramScheduledMessage,
} from './telegram-mtproto.client';

export type TelegramPublishPostParams = {
  signal?: AbortSignal;
  apiId: string;
  apiHash: string;
  session: string;
  channelRef?: string;
  channel?: StoredTelegramChannelReference;
  html: string;
  textHtmlParts?: string[];
  scheduleAt?: Date | null;
  captionHtml?: string;
  followupHtmlParts?: string[];
  imageUrls: string[];
  mediaItems?: TelegramPostMediaItem[];
  onUploadProgress?: (progressPercent: number) => void;
  /** Admits the network side effect only after all local/media preparation. */
  beforeSend?: () => Promise<void>;
  replacement?: {
    messageIds: string[];
    validate: (messages: TelegramScheduledMessage[]) => void;
    beforeChange: () => Promise<void>;
    afterCancel?: () => Promise<void>;
  };
};

type ParsedText = { text: string; entities: Api.TypeMessageEntity[] };
type PublishDependencies = {
  create: (
    params: TelegramPublishPostParams,
    signal: AbortSignal,
  ) => Promise<TelegramClient>;
  close: (client: TelegramClient) => Promise<void>;
  resolve: (
    client: TelegramClient,
    channel: StoredTelegramChannelReference,
  ) => Promise<{ entity: unknown; peer: Api.TypeInputPeer }>;
  parse: (html: string) => ParsedText;
  downloadImage: (url: string, index: number) => Promise<FileLike>;
  sendText: (
    client: TelegramClient,
    entity: unknown,
    html: string,
    schedule?: number,
  ) => Promise<{ id: number } | null | undefined>;
  serialize: (
    message: Api.TypeMessage,
    isScheduled: boolean,
  ) => TelegramScheduledMessage;
};

/** Prepare the complete next post before changing any existing native schedule. */
export function publishTelegramPost(
  deps: PublishDependencies,
  params: TelegramPublishPostParams,
) {
  return withTelegramPublicationDeadline({
    timeoutMs: 60_000,
    signal: params.signal,
    scheduleAt: params.scheduleAt,
    create: (signal) => deps.create(params, signal),
    close: deps.close,
    run: async (client, checkpoint) => {
      const resolved = params.channel
        ? await deps.resolve(client, params.channel)
        : null;
      const entity = resolved
        ? resolved.entity
        : await client.getEntity(params.channelRef as string);
      checkpoint();
      const schedule = params.scheduleAt
        ? Math.floor(params.scheduleAt.getTime() / 1000)
        : undefined;
      const mediaItems = normalizeTelegramPostMediaItems(
        params.mediaItems,
        params.imageUrls,
      );
      const captionSourceHtml = params.captionHtml ?? params.html;
      const caption = mediaItems.length
        ? deps.parse(captionSourceHtml)
        : undefined;
      // Validate every rendered text part before cancellation, including parts
      // that will be sent after the media message.
      for (const part of mediaItems.length
        ? (params.followupHtmlParts ?? [])
        : (params.textHtmlParts ?? [params.html]))
        deps.parse(part);
      let files: FileLike[];
      let replacementPeer: Api.TypeInputPeer | undefined;
      if (params.replacement) {
        const ids = params.replacement.messageIds;
        if (
          !params.scheduleAt ||
          !ids.length ||
          new Set(ids).size !== ids.length ||
          ids.some(
            (id) => !/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)),
          )
        )
          throw new Error(
            'Native replacement requires unique scheduled IDs and a future schedule',
          );
        replacementPeer =
          resolved?.peer ?? (await client.getInputEntity(entity as never));
        const previous = await client.invoke(
          new Api.messages.GetScheduledMessages({
            peer: replacementPeer,
            id: ids.map(Number),
          }),
        );
        checkpoint();
        if (!('messages' in previous))
          throw new Error(
            'Native replacement scheduled messages are unavailable',
          );
        const byId = new Map(
          previous.messages.map((message) => [String(message.id), message]),
        );
        if (
          byId.size !== ids.length ||
          previous.messages.length !== ids.length ||
          ids.some((id) => !byId.has(id))
        )
          throw new Error(
            'Native replacement identity is incomplete; old schedule left unchanged',
          );
        const ordered = ids.map((id) => byId.get(id)!);
        params.replacement.validate(
          ordered.map((message) => deps.serialize(message, true)),
        );
        const oldMedia = ordered.filter(
          (message): message is Api.Message =>
            message instanceof Api.Message && Boolean(message.media),
        );
        if (oldMedia.length !== mediaItems.length)
          throw new Error(
            'Native replacement media count differs; old schedule left unchanged',
          );
        files = oldMedia.map((message, index) => {
          const media = message.media;
          const expected = mediaItems[index].kind;
          if (
            !(expected === 'PHOTO'
              ? media instanceof Api.MessageMediaPhoto
              : media instanceof Api.MessageMediaDocument)
          )
            throw new Error(
              'Native replacement media is unsupported; old schedule left unchanged',
            );
          const input = getInputMedia(media);
          if (
            !(
              input instanceof Api.InputMediaPhoto ||
              input instanceof Api.InputMediaDocument
            )
          )
            throw new Error(
              'Native replacement media reference is unavailable',
            );
          return input;
        });
      } else {
        files = await Promise.all(
          mediaItems.map((media, index) =>
            media.kind === 'PHOTO'
              ? deps.downloadImage(media.url, index)
              : downloadTelegramPublishMotion(
                  media.url,
                  index,
                  media.kind,
                  media.fileName,
                ),
          ),
        );
      }
      checkpoint();
      await params.beforeSend?.();
      checkpoint();
      if (params.replacement) {
        await params.replacement.beforeChange();
        checkpoint();
        await client.invoke(
          new Api.messages.DeleteScheduledMessages({
            peer: replacementPeer!,
            id: params.replacement.messageIds.map(Number),
          }),
        );
        await params.replacement.afterCancel?.();
        checkpoint();
      }
      const messageIds: string[] = [];
      if (files.length) {
        const peer = entity as Parameters<TelegramClient['sendFile']>[0];
        const result =
          files.length > 1
            ? await client.sendFile(peer, {
                file: files,
                caption: captionSourceHtml
                  ? [telegramHtmlToGramJsAlbumHtml(captionSourceHtml)]
                  : [''],
                parseMode: 'html',
                scheduleDate: schedule,
                progressCallback: (progress) =>
                  params.onUploadProgress?.(Math.round(progress * 100)),
              })
            : await client.sendFile(peer, {
                file: files[0],
                caption: caption!.text,
                formattingEntities: caption!.entities,
                parseMode: false,
                scheduleDate: schedule,
                progressCallback: (progress) =>
                  params.onUploadProgress?.(Math.round(progress * 100)),
              });
        const sentMessages = (
          Array.isArray(result) ? result : [result]
        ) as Array<{ id?: number }>;
        for (const message of sentMessages)
          if (message?.id != null) messageIds.push(String(message.id));
        for (const part of params.followupHtmlParts ?? []) {
          checkpoint();
          const message = await deps.sendText(client, entity, part, schedule);
          if (message?.id != null) messageIds.push(String(message.id));
        }
      } else {
        for (const part of params.textHtmlParts ?? [params.html]) {
          checkpoint();
          const message = await deps.sendText(client, entity, part, schedule);
          if (message?.id != null) messageIds.push(String(message.id));
        }
      }
      return messageIds;
    },
  });
}

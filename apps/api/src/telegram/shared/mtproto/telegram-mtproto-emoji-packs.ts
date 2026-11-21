import { BadRequestException } from '@nestjs/common';
import { Api } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';
import {
  normalizeTelegramCustomEmojiPackSource,
  parseTelegramCustomEmojiDocumentId,
} from '@api/telegram/shared/markup/telegram-custom-emoji-pack';
import { type ResolvedTelegramCustomEmojiPack } from './telegram-mtproto-client-types';
import type { TelegramMtprotoClient } from './telegram-mtproto.client';

type Dependencies = {
  closeClient: TelegramMtprotoClient['closeClient'];
  createClient: TelegramMtprotoClient['createClient'];
};

export class TelegramMtprotoEmojiPacks {
  constructor(private readonly context: Dependencies) {}

  async getCustomEmojiPack(params: {
    apiId: string;
    apiHash: string;
    session: string;
    source: string;
  }): Promise<ResolvedTelegramCustomEmojiPack> {
    const documentId = parseTelegramCustomEmojiDocumentId(params.source);
    const shortName = documentId
      ? null
      : normalizeTelegramCustomEmojiPackSource(params.source);
    const client = await this.context.createClient(params);
    try {
      let stickerSet: any;
      let requestedDocuments: any[] | null = null;
      if (documentId) {
        requestedDocuments = await client.invoke(
          new Api.messages.GetCustomEmojiDocuments({
            documentId: [returnBigInt(documentId)],
          }),
        );
        const attribute = requestedDocuments[0]?.attributes?.find(
          (item: any) => item?.className === 'DocumentAttributeCustomEmoji',
        );
        if (!attribute?.stickerset)
          throw new BadRequestException(
            'Telegram could not resolve this Custom Emoji document to a pack.',
          );
        stickerSet = attribute.stickerset;
      } else {
        stickerSet = new Api.InputStickerSetShortName({
          shortName: shortName!,
        });
      }
      const result: any = await client.invoke(
        new Api.messages.GetStickerSet({
          stickerset: stickerSet,
          hash: 0,
        }),
      );
      const set = result.set;
      // A post may reference one emoji from a huge pack. Only download that
      // document; GetStickerSet above is used for pack metadata.
      const sourceDocuments = requestedDocuments ?? result.documents ?? [];
      const documents = await Promise.all(
        sourceDocuments.map(async (document: any) => {
          const attributes = document.attributes ?? [];
          const sticker = attributes.find(
            (attribute: any) =>
              attribute?.className === 'DocumentAttributeCustomEmoji' ||
              attribute?.className === 'DocumentAttributeSticker',
          );
          const alt = String(sticker?.alt ?? '');
          const mimeType = document.mimeType ? String(document.mimeType) : null;
          const kind =
            mimeType === 'application/x-tgsticker'
              ? 'ANIMATED'
              : mimeType === 'video/webm'
                ? 'VIDEO'
                : 'STATIC';
          let originalAsset: Buffer | null = null;
          try {
            const downloaded = await client.downloadMedia(document, {});
            originalAsset = Buffer.isBuffer(downloaded)
              ? downloaded
              : downloaded
                ? Buffer.from(downloaded as any)
                : null;
            if (!originalAsset?.length) {
              throw new Error('Telegram returned an empty media payload');
            }
          } catch (error) {
            throw new BadRequestException(
              `Telegram could not download the original asset for Custom Emoji ${String(document.id)}: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
          }
          return {
            documentId: String(document.id),
            alt,
            mimeType,
            kind,
            isFree: Boolean(sticker?.free),
            needsRepainting: Boolean(sticker?.textColor),
            originalAsset,
          };
        }),
      );
      return {
        shortName: String(set?.shortName ?? shortName ?? documentId),
        title: String(set?.title ?? shortName ?? documentId),
        telegramSetId: set?.id == null ? null : String(set.id),
        documents: documents.filter((document) => document.alt),
      };
    } finally {
      await this.context.closeClient(client);
    }
  }
}

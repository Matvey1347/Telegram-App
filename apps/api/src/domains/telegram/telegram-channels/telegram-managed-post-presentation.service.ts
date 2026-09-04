import { Injectable } from '@nestjs/common';
import { parseTelegramHtml } from '../../../telegram/shared/telegram-html-parser';
import {
  requiresNativeTelegramRichMessage,
  telegramMarkupToHtml,
  telegramMarkupToRichHtml,
} from '../../../telegram/shared/telegram-markup';
import {
  BotMessageEntity,
  ManagedPostPublishRender,
  TELEGRAM_CAPTION_LIMIT,
  TELEGRAM_TEXT_MESSAGE_LIMIT,
  TelegramPostRenderingLimits,
} from './telegram-channels.internal';
import { TelegramManagedPostIdentityService } from './telegram-managed-post-identity.service';

@Injectable()
export class TelegramManagedPostPresentationService {
  constructor(
    private readonly identityService: TelegramManagedPostIdentityService,
  ) {}

  public resolveInternalPostLinksForPublish(
    workspaceId: string,
    currentPostId: string,
    text: string,
    currentScheduleAt?: Date,
  ) {
    return this.identityService.resolveInternalLinks({
      workspaceId,
      currentPostId,
      text,
      currentScheduleAt,
    });
  }

  public renderManagedPostText(
    text: string,
    imageUrls: string[],
    limits: TelegramPostRenderingLimits = {
      captionLengthMax: TELEGRAM_CAPTION_LIMIT,
      messageLengthMax: TELEGRAM_TEXT_MESSAGE_LIMIT,
    },
    longTextMode: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT' = 'IMAGES_THEN_TEXT',
  ): ManagedPostPublishRender {
    const html = telegramMarkupToHtml(text);
    const richHtml = requiresNativeTelegramRichMessage(text)
      ? [
          ...imageUrls.map(
            (url) =>
              `<img src="${url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"/>`,
          ),
          telegramMarkupToRichHtml(text),
        ].join('\n')
      : null;
    const [plainText] = parseTelegramHtml(html);
    let captionHtml = html;
    let followupHtmlParts: string[] = [];
    let textHtmlParts = [html];
    let publishMode = imageUrls.length ? 'IMAGE_WITH_CAPTION' : 'TEXT_ONLY';

    if (richHtml) publishMode = 'RICH_MESSAGE';

    if (
      !richHtml &&
      imageUrls.length &&
      plainText.length > limits.captionLengthMax
    ) {
      publishMode = longTextMode;
      if (longTextMode === 'CAPTION_THEN_TEXT') {
        const [caption, remainder] = this.splitTelegramMarkupOnce(
          text,
          limits.captionLengthMax,
        );
        captionHtml = telegramMarkupToHtml(caption);
        followupHtmlParts = this.splitTelegramMarkup(
          remainder,
          limits.messageLengthMax,
        ).map((part) => telegramMarkupToHtml(part));
      } else {
        captionHtml = '';
        followupHtmlParts = this.splitTelegramMarkup(
          text,
          limits.messageLengthMax,
        ).map((part) => telegramMarkupToHtml(part));
      }
    } else if (
      !richHtml &&
      !imageUrls.length &&
      plainText.length > limits.messageLengthMax
    ) {
      publishMode = 'TEXT_PARTS';
      textHtmlParts = this.splitTelegramMarkup(
        text,
        limits.messageLengthMax,
      ).map((part) => telegramMarkupToHtml(part));
    }

    return {
      html,
      richHtml,
      captionHtml,
      followupHtmlParts,
      textHtmlParts,
      publishMode,
    };
  }

  public sameImageUrls(left: string[], right: string[]) {
    return (
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  }

  public splitTelegramMarkup(rawText: string, maxPlainLength: number) {
    const parts: string[] = [];
    let remaining = rawText.trim();
    while (remaining) {
      const [current, next] = this.splitTelegramMarkupOnce(
        remaining,
        maxPlainLength,
      );
      parts.push(current);
      if (!next) break;
      remaining = next;
    }
    return parts;
  }

  public splitTelegramMarkupOnce(
    rawText: string,
    maxPlainLength: number,
  ): [string, string] {
    const html = telegramMarkupToHtml(rawText);
    const [plain] = parseTelegramHtml(html);
    if (plain.length <= maxPlainLength) return [rawText.trim(), ''];
    const boundaries = new Set<number>();
    for (const match of rawText.matchAll(/\n\s*\n/g)) {
      boundaries.add((match.index || 0) + match[0].length);
    }
    for (const match of rawText.matchAll(/[.!?…](?:["'»”)]*)\s+/g)) {
      boundaries.add((match.index || 0) + match[0].length);
    }
    for (const match of rawText.matchAll(/\n/g)) {
      boundaries.add((match.index || 0) + 1);
    }
    for (const match of rawText.matchAll(/\s+/g)) {
      boundaries.add((match.index || 0) + match[0].length);
    }
    const splitAt = [...boundaries]
      .sort((a, b) => b - a)
      .find((position) => {
        const candidate = rawText.slice(0, position).trimEnd();
        if (!candidate || !this.hasBalancedTelegramMarkup(candidate)) {
          return false;
        }
        const [plain] = parseTelegramHtml(telegramMarkupToHtml(candidate));
        return plain.length <= maxPlainLength;
      });
    const fallbackAt =
      splitAt ?? this.findHardTelegramMarkupSplit(rawText, maxPlainLength);
    if (!fallbackAt) return [rawText.trim(), ''];
    const currentRaw = rawText.slice(0, fallbackAt).trimEnd();
    const remainderRaw = rawText.slice(fallbackAt).trimStart();
    return [currentRaw, remainderRaw];
  }

  public findHardTelegramMarkupSplit(rawText: string, maxPlainLength: number) {
    for (
      let position = Math.min(rawText.length, maxPlainLength);
      position > 0;
      position -= 1
    ) {
      const candidate = rawText.slice(0, position).trimEnd();
      if (!candidate || !this.hasBalancedTelegramMarkup(candidate)) continue;
      const [plain] = parseTelegramHtml(telegramMarkupToHtml(candidate));
      if (plain.length <= maxPlainLength) return position;
    }
    return 0;
  }

  public toBotMessageEntity(entity: {
    className?: string;
    offset?: number;
    length?: number;
    url?: string;
    language?: string;
    documentId?: unknown;
  }): BotMessageEntity | null {
    const offset = entity.offset ?? 0;
    const length = entity.length ?? 0;
    const base = { offset, length };
    switch (entity.className) {
      case 'MessageEntityBold':
        return { ...base, type: 'bold' };
      case 'MessageEntityItalic':
        return { ...base, type: 'italic' };
      case 'MessageEntityUnderline':
        return { ...base, type: 'underline' };
      case 'MessageEntityStrike':
        return { ...base, type: 'strikethrough' };
      case 'MessageEntitySpoiler':
        return { ...base, type: 'spoiler' };
      case 'MessageEntityCode':
        return { ...base, type: 'code' };
      case 'MessageEntityPre':
        return {
          ...base,
          type: 'pre',
          ...(entity.language ? { language: entity.language } : {}),
        };
      case 'MessageEntityTextUrl':
        return entity.url
          ? { ...base, type: 'text_link', url: entity.url }
          : null;
      case 'MessageEntityBlockquote':
        return { ...base, type: 'blockquote' };
      case 'MessageEntityCustomEmoji':
        return entity.documentId
          ? {
              ...base,
              type: 'custom_emoji',
              custom_emoji_id: this.telegramDocumentId(entity.documentId),
            }
          : null;
      default:
        return null;
    }
  }

  private telegramDocumentId(value: unknown) {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'bigint') {
      return value.toString();
    }
    if (
      value &&
      typeof value === 'object' &&
      'toString' in value &&
      typeof value.toString === 'function'
    ) {
      return (value as { toString(radix?: number): string }).toString(10);
    }
    return '';
  }

  public hasBalancedTelegramMarkup(value: string) {
    if ((value.match(/```/g) || []).length % 2 !== 0) return false;
    const withoutFenced = value.replace(/```[\s\S]*?```/g, '');
    if ((withoutFenced.match(/`/g) || []).length % 2 !== 0) return false;
    return ['**', '__', '++', '~~', '||'].every((marker) => {
      let count = 0;
      let cursor = 0;
      while ((cursor = withoutFenced.indexOf(marker, cursor)) !== -1) {
        count += 1;
        cursor += marker.length;
      }
      return count % 2 === 0;
    });
  }
}

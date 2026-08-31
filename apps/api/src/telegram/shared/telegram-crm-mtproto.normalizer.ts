import { BadRequestException } from '@nestjs/common';
import { Api } from 'telegram';
import type {
  TelegramCrmMtprotoCheckpoint,
  TelegramCrmMtprotoMessage,
  TelegramCrmMtprotoPeer,
  TelegramCrmMtprotoUpdate,
} from './telegram-crm-mtproto.types';

const TELEGRAM_SERVICE_USER_ID = '777000';

export type TelegramCrmDialogCursor = {
  offsetDate: number;
  offsetId: number;
  offsetUserId?: string;
  offsetAccessHash?: string;
};

export function telegramLongString(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'object' && 'toString' in value) {
    const rendered = (value as { toString: () => string }).toString();
    return rendered === '[object Object]' ? '' : rendered;
  }
  return '';
}

function peerUserId(peer: Api.TypePeer | undefined) {
  return peer instanceof Api.PeerUser ? telegramLongString(peer.userId) : null;
}

export function parseTelegramCrmMessage(
  value: Api.TypeMessage,
): TelegramCrmMtprotoMessage | null {
  if (!(value instanceof Api.Message)) return null;
  const telegramUserId = peerUserId(value.peerId);
  if (!telegramUserId) return null;
  return {
    telegramMessageId: value.id,
    telegramUserId,
    direction: value.out ? 'OUTBOUND' : 'INBOUND',
    text: value.message || null,
    sentAt: new Date(value.date * 1_000),
    editedAt: value.editDate ? new Date(value.editDate * 1_000) : null,
    contentMetadata: value.media ? { mediaType: value.media.className } : null,
  };
}

export function parseTelegramCrmPeer(
  user: Api.User,
): TelegramCrmMtprotoPeer | null {
  const telegramUserId = telegramLongString(user.id);
  if (
    !telegramUserId ||
    telegramUserId === TELEGRAM_SERVICE_USER_ID ||
    user.bot ||
    user.self ||
    user.deleted ||
    user.support ||
    user.accessHash == null
  ) {
    return null;
  }
  return {
    telegramUserId,
    telegramAccessHash: telegramLongString(user.accessHash),
    username: user.username || null,
    firstName: user.firstName || null,
    lastName: user.lastName || null,
    photoUrl: user.username
      ? `https://t.me/i/userpic/320/${user.username}.jpg`
      : null,
  };
}

export function encodeTelegramCrmDialogCursor(cursor: TelegramCrmDialogCursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeTelegramCrmDialogCursor(
  value?: string | null,
): TelegramCrmDialogCursor {
  if (!value) return { offsetDate: 0, offsetId: 0 };
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<TelegramCrmDialogCursor>;
    if (
      !Number.isInteger(parsed.offsetDate) ||
      !Number.isInteger(parsed.offsetId)
    ) {
      throw new Error('invalid cursor');
    }
    return {
      offsetDate: parsed.offsetDate!,
      offsetId: parsed.offsetId!,
      ...(typeof parsed.offsetUserId === 'string'
        ? { offsetUserId: parsed.offsetUserId }
        : {}),
      ...(typeof parsed.offsetAccessHash === 'string'
        ? { offsetAccessHash: parsed.offsetAccessHash }
        : {}),
    };
  } catch {
    throw new BadRequestException('Invalid Telegram dialog cursor');
  }
}

export function telegramCrmCheckpoint(state: {
  pts: number;
  qts?: number;
  date: number;
  seq: number;
}): TelegramCrmMtprotoCheckpoint {
  return {
    pts: state.pts,
    qts: state.qts ?? 0,
    date: state.date,
    seq: state.seq,
  };
}

export function normalizeTelegramCrmUpdate(
  update: Api.TypeUpdate,
): TelegramCrmMtprotoUpdate | null {
  if (
    update instanceof Api.UpdateNewMessage ||
    update instanceof Api.UpdateEditMessage
  ) {
    const message = parseTelegramCrmMessage(update.message);
    if (!message) return null;
    return {
      type:
        update instanceof Api.UpdateNewMessage
          ? 'message.new'
          : 'message.edited',
      message,
      sequence: { pts: update.pts, ptsCount: update.ptsCount },
    };
  }
  if (
    update instanceof Api.UpdateReadHistoryInbox ||
    update instanceof Api.UpdateReadHistoryOutbox
  ) {
    const telegramUserId = peerUserId(update.peer);
    if (!telegramUserId) return null;
    return {
      type:
        update instanceof Api.UpdateReadHistoryInbox
          ? 'history.inboxRead'
          : 'history.outboxRead',
      telegramUserId,
      maxTelegramMessageId: update.maxId,
      stillUnreadCount:
        update instanceof Api.UpdateReadHistoryInbox
          ? update.stillUnreadCount
          : null,
      sequence: { pts: update.pts, ptsCount: update.ptsCount },
    };
  }
  if (update instanceof Api.UpdateUserName) {
    return {
      type: 'peer.metadata',
      telegramUserId: telegramLongString(update.userId),
      username: update.usernames.find((item) => item.active)?.username ?? null,
      firstName: update.firstName || null,
      lastName: update.lastName || null,
    };
  }
  return null;
}

export function normalizeTelegramCrmRaw(raw: unknown) {
  if (raw instanceof Api.UpdatesTooLong) {
    return [
      { type: 'sync.gap', reason: 'UPDATES_TOO_LONG' },
    ] satisfies TelegramCrmMtprotoUpdate[];
  }
  if (raw instanceof Api.UpdateShortMessage) {
    return [
      {
        type: 'message.new',
        message: {
          telegramMessageId: raw.id,
          telegramUserId: telegramLongString(raw.userId),
          direction: raw.out ? 'OUTBOUND' : 'INBOUND',
          text: raw.message || null,
          sentAt: new Date(raw.date * 1_000),
          editedAt: null,
          contentMetadata: null,
        },
        sequence: { pts: raw.pts, ptsCount: raw.ptsCount },
      },
    ] satisfies TelegramCrmMtprotoUpdate[];
  }
  if (raw instanceof Api.UpdateShort) {
    const update = normalizeTelegramCrmUpdate(raw.update);
    return update ? [update] : [];
  }
  if (raw instanceof Api.Updates || raw instanceof Api.UpdatesCombined) {
    return raw.updates
      .map((update) => normalizeTelegramCrmUpdate(update))
      .filter((update): update is TelegramCrmMtprotoUpdate => Boolean(update));
  }
  const update = normalizeTelegramCrmUpdate(raw as Api.TypeUpdate);
  return update ? [update] : [];
}

export function extractTelegramCrmSentMessage(
  result: Api.TypeUpdates,
  telegramUserId: string,
) {
  if (result instanceof Api.UpdateShortSentMessage) {
    return {
      telegramMessageId: result.id,
      telegramUserId,
      direction: 'OUTBOUND' as const,
      text: null,
      sentAt: new Date(result.date * 1_000),
      editedAt: null,
      contentMetadata: null,
    };
  }
  const updates = 'updates' in result ? result.updates : [];
  for (const update of updates) {
    if (update instanceof Api.UpdateNewMessage) {
      const message = parseTelegramCrmMessage(update.message);
      if (message) return message;
    }
  }
  return null;
}

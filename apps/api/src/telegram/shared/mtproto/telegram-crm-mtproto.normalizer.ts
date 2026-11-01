import { BadRequestException } from '@nestjs/common';
import { Api } from 'telegram';
import type {
  TelegramCrmMtprotoCheckpoint,
  TelegramCrmMtprotoMessage,
  TelegramCrmMtprotoPeer,
  TelegramCrmMtprotoUpdate,
} from '@api/telegram/shared/mtproto/telegram-crm-mtproto.types';

import {
  crmMessageMetadata,
  crmMessageReactions,
} from './telegram-crm-message-metadata';

import {
  filterCrmPrivatePeerUpdates,
  isCrmExcludedTelegramUser,
  rememberCrmExcludedTelegramUsers,
} from './telegram-crm-private-peer-policy';

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
    contentMetadata: crmMessageMetadata(value),
  };
}

export function parseTelegramCrmPeer(
  user: Api.User,
): TelegramCrmMtprotoPeer | null {
  const telegramUserId = telegramLongString(user.id);
  if (
    !telegramUserId ||
    isCrmExcludedTelegramUser(user) ||
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
    phone: user.phone ? `+${user.phone}` : null,
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
  if (update instanceof Api.UpdateNotifySettings) {
    if (update.peer instanceof Api.NotifyUsers)
      return { type: 'folders.changed' };
    if (
      update.peer instanceof Api.NotifyPeer &&
      update.peer.peer instanceof Api.PeerUser
    )
      return {
        type: 'folders.changed',
        telegramUserIds: [telegramLongString(update.peer.peer.userId)],
      };
    return null;
  }
  if (update instanceof Api.UpdateFolderPeers) {
    const telegramUserIds = update.folderPeers.flatMap((folder) =>
      folder.peer instanceof Api.PeerUser
        ? [telegramLongString(folder.peer.userId)]
        : [],
    );
    return {
      type: 'folders.changed',
      telegramUserIds,
      sequence: { pts: update.pts, ptsCount: update.ptsCount },
    };
  }
  if (
    update instanceof Api.UpdateDialogFilter ||
    update instanceof Api.UpdateDialogFilters ||
    update instanceof Api.UpdateDialogFilterOrder
  )
    return { type: 'folders.changed' };
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
  if (update instanceof Api.UpdateDeleteMessages) {
    return {
      type: 'message.deleted',
      telegramMessageIds: update.messages,
      sequence: { pts: update.pts, ptsCount: update.ptsCount },
    };
  }
  if (update instanceof Api.UpdateMessageReactions) {
    const telegramUserId = peerUserId(update.peer);
    return telegramUserId
      ? {
          type: 'message.reactions',
          telegramUserId,
          telegramMessageId: update.msgId,
          reactions: crmMessageReactions(update.reactions),
        }
      : null;
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

export function normalizeTelegramCrmRaw(
  raw: unknown,
  excluded = new Set<string>(),
) {
  const current =
    raw instanceof Api.Updates || raw instanceof Api.UpdatesCombined
      ? rememberCrmExcludedTelegramUsers(raw.users, excluded)
      : excluded;
  return filterCrmPrivatePeerUpdates(normalizeCrmRawUpdates(raw), current);
}

function normalizeCrmRawUpdates(raw: unknown) {
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
          contentMetadata: (() => {
            const metadata = crmMessageMetadata(
              new Api.Message({
                id: raw.id,
                peerId: new Api.PeerUser({ userId: raw.userId }),
                message: raw.message,
                date: raw.date,
                out: raw.out,
                entities: raw.entities,
                replyTo: raw.replyTo,
                fwdFrom: raw.fwdFrom,
                viaBotId: raw.viaBotId,
              }),
            );
            return metadata;
          })(),
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
      if (message?.telegramUserId === telegramUserId) return message;
    }
  }
  return null;
}

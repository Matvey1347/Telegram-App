import { parseCrmOutgoingText } from './telegram-crm-chat-text';
import { TelegramCrmChatActionTransport } from './telegram-crm-chat-actions';
import { TelegramCrmDialogFolders } from './telegram-crm-dialog-folders';
import { TelegramLeadChannelReader } from './telegram-lead-channel-reader';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Api, TelegramClient } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';
import {
  closeTelegramMtprotoSession,
  createTelegramMtprotoSession,
} from '@api/telegram/shared/mtproto/telegram-mtproto-session.factory';
import type {
  TelegramCrmMtprotoCheckpoint,
  TelegramCrmMtprotoCredentials,
  TelegramCrmMtprotoDialog,
  TelegramCrmMtprotoDifference,
  TelegramCrmMtprotoHandle,
  TelegramCrmMtprotoMessage,
  TelegramCrmMtprotoPeer,
  TelegramCrmMtprotoUpdate,
} from '@api/telegram/shared/mtproto/telegram-crm-mtproto.types';
import {
  decodeTelegramCrmDialogCursor,
  encodeTelegramCrmDialogCursor,
  extractTelegramCrmSentMessage,
  normalizeTelegramCrmRaw,
  normalizeTelegramCrmUpdate,
  parseTelegramCrmMessage,
  parseTelegramCrmPeer,
  telegramCrmCheckpoint,
  telegramLongString,
} from '@api/telegram/shared/mtproto/telegram-crm-mtproto.normalizer';

class GramJsTelegramCrmHandle implements TelegramCrmMtprotoHandle {
  private closePromise?: Promise<void>;
  private readonly dialogFolders: TelegramCrmDialogFolders;
  readonly leadDiscovery: TelegramLeadChannelReader;
  readonly chatActions: TelegramCrmChatActionTransport;

  constructor(private readonly client: TelegramClient) {
    this.chatActions = new TelegramCrmChatActionTransport(client);
    this.dialogFolders = new TelegramCrmDialogFolders(client);
    this.leadDiscovery = new TelegramLeadChannelReader(client);
  }

  async listPrivateDialogs({
    cursor,
    limit = 100,
  }: {
    cursor?: string | null;
    limit?: number;
  }) {
    const pageSize = Math.min(100, Math.max(1, limit));
    const offset = decodeTelegramCrmDialogCursor(cursor);
    const rows = await this.client.getDialogs({
      limit: pageSize,
      // GramJS treats even zero as an active date filter and then discards
      // every normal dialog whose message date is greater than zero.
      offsetDate: cursor ? offset.offsetDate : undefined,
      offsetId: offset.offsetId,
      offsetPeer:
        offset.offsetUserId && offset.offsetAccessHash
          ? new Api.InputPeerUser({
              userId: returnBigInt(offset.offsetUserId),
              accessHash: returnBigInt(offset.offsetAccessHash),
            })
          : undefined,
    });
    const loadedFolderFilters =
      await this.dialogFolders.getDialogFolderFilters();
    const dialogs: TelegramCrmMtprotoDialog[] = [];
    for (const dialog of rows) {
      const entity = dialog.entity;
      if (!(entity instanceof Api.User)) continue;
      const peer = parseTelegramCrmPeer(entity);
      if (!peer) continue;
      const lastMessage = dialog.message
        ? parseTelegramCrmMessage(dialog.message)
        : null;
      dialogs.push({
        peer,
        telegramDialogId: telegramLongString(dialog.id),
        unreadCount: Math.max(0, dialog.unreadCount || 0),
        lastMessage,
        folderIds: loadedFolderFilters
          .filter((filter) =>
            this.dialogFolders.matchesFolder(filter, dialog, entity),
          )
          .map((filter) => filter.folder.id),
      });
    }
    const last = rows.at(-1);
    const lastMessage = last?.message;
    const lastPeer =
      last?.entity instanceof Api.User
        ? parseTelegramCrmPeer(last.entity)
        : null;
    const exhausted = rows.length < pageSize;
    return {
      dialogs,
      folders: loadedFolderFilters.map((filter) => filter.folder),
      scanned: rows.length,
      total: rows.total ?? rows.length,
      exhausted,
      nextCursor:
        exhausted || !lastMessage
          ? null
          : encodeTelegramCrmDialogCursor({
              offsetDate: lastMessage.date,
              offsetId: lastMessage.id,
              ...(lastPeer
                ? {
                    offsetUserId: lastPeer.telegramUserId,
                    offsetAccessHash: lastPeer.telegramAccessHash,
                  }
                : {}),
            }),
    };
  }

  setDialogFolderMembership(
    input: Parameters<TelegramCrmDialogFolders['setDialogFolderMembership']>[0],
  ) {
    return this.dialogFolders.setDialogFolderMembership(input);
  }

  async getHistory(input: {
    telegramUserId: string;
    telegramAccessHash: string;
    beforeTelegramMessageId?: number | null;
    limit?: number;
  }) {
    const limit = Math.min(100, Math.max(1, input.limit ?? 50));
    const peer = this.inputPeer(input.telegramUserId, input.telegramAccessHash);
    const rows = await this.client.getMessages(peer, {
      limit,
      offsetId: input.beforeTelegramMessageId ?? 0,
    });
    const messages = rows
      .map((row) => parseTelegramCrmMessage(row as Api.TypeMessage))
      .filter((row): row is TelegramCrmMtprotoMessage => Boolean(row));
    const exhausted = rows.length < limit;
    const cursor = Math.min(
      ...rows
        .map((row) => row.id)
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    );
    if (
      !exhausted &&
      (!Number.isFinite(cursor) ||
        (input.beforeTelegramMessageId &&
          cursor >= input.beforeTelegramMessageId))
    )
      throw new BadRequestException('CRM_HISTORY_CURSOR_UNAVAILABLE');
    return {
      messages,
      exhausted,
      nextBeforeTelegramMessageId: exhausted ? null : cursor,
    };
  }

  async resolvePrivatePeer(input: {
    telegramUserId: string;
    username?: string | null;
  }) {
    let entity: Api.User | Api.Channel | Api.Chat;
    try {
      entity = (await this.client.getEntity(input.telegramUserId)) as
        | Api.User
        | Api.Channel
        | Api.Chat;
    } catch (error) {
      if (!input.username) throw error;
      entity = (await this.client.getEntity(input.username)) as
        | Api.User
        | Api.Channel
        | Api.Chat;
    }
    if (!(entity instanceof Api.User)) {
      throw new BadRequestException('Telegram peer is not a private user');
    }
    const peer = parseTelegramCrmPeer(entity);
    if (!peer) throw new BadRequestException('Telegram peer is not eligible');
    if (peer.telegramUserId !== input.telegramUserId) {
      throw new BadRequestException('Resolved Telegram peer ID does not match');
    }
    return peer;
  }

  async resolvePrivatePeerReference(reference: string) {
    const normalized = reference.trim();
    if (!normalized) throw new BadRequestException('Telegram user is required');
    const entity = (await this.client.getEntity(normalized)) as
      | Api.User
      | Api.Channel
      | Api.Chat;
    if (!(entity instanceof Api.User)) {
      throw new BadRequestException('Telegram peer is not a private user');
    }
    const peer = parseTelegramCrmPeer(entity);
    if (!peer) throw new BadRequestException('Telegram peer is not eligible');
    return {
      ...peer,
      // A public userpic URL exists only for usernames. Download the actual
      // profile photo so contacts resolved by phone receive their avatar too.
      photoUrl: (await this.profilePhotoDataUrl(entity)) ?? peer.photoUrl,
    };
  }

  private async profilePhotoDataUrl(entity: Api.User) {
    try {
      const photo = await this.client.downloadProfilePhoto(entity, {
        isBig: false,
      });
      if (!Buffer.isBuffer(photo) || photo.length === 0) return null;
      return `data:image/jpeg;base64,${photo.toString('base64')}`;
    } catch {
      return null;
    }
  }

  async sendText(input: {
    telegramUserId: string;
    telegramAccessHash: string;
    text: string;
    randomId: bigint;
    replyToTelegramMessageId?: number;
  }) {
    const [message, entities] = parseCrmOutgoingText(input.text);
    if (!message.trim() || message.length > 4096)
      throw new BadRequestException('INVALID_MESSAGE_LENGTH');
    if (
      input.replyToTelegramMessageId &&
      !(await this.chatActions.getMessage({
        ...input,
        telegramMessageId: input.replyToTelegramMessageId,
      }))
    )
      throw new BadRequestException('REPLY_MESSAGE_UNAVAILABLE');
    const result = await this.client.invoke(
      new Api.messages.SendMessage({
        peer: this.inputPeer(input.telegramUserId, input.telegramAccessHash),
        message,
        entities,
        ...(input.replyToTelegramMessageId
          ? {
              replyTo: new Api.InputReplyToMessage({
                replyToMsgId: input.replyToTelegramMessageId,
              }),
            }
          : {}),
        randomId: returnBigInt(input.randomId),
        noWebpage: false,
        silent: false,
      }),
    );
    const sentMessage = extractTelegramCrmSentMessage(
      result,
      input.telegramUserId,
    );
    if (!sentMessage)
      throw new Error('Telegram did not return the sent message');
    return sentMessage;
  }

  async markRead(input: {
    telegramUserId: string;
    telegramAccessHash: string;
    maxTelegramMessageId: number;
  }) {
    await this.client.invoke(
      new Api.messages.ReadHistory({
        peer: this.inputPeer(input.telegramUserId, input.telegramAccessHash),
        maxId: input.maxTelegramMessageId,
      }),
    );
  }

  async getState() {
    return telegramCrmCheckpoint(
      await this.client.invoke(new Api.updates.GetState()),
    );
  }

  async getDifference(
    from: TelegramCrmMtprotoCheckpoint,
  ): Promise<TelegramCrmMtprotoDifference> {
    const result = await this.client.invoke(
      new Api.updates.GetDifference({
        pts: from.pts,
        ptsLimit: 500,
        ptsTotalLimit: 500,
        qts: from.qts,
        qtsLimit: 500,
        date: from.date,
      }),
    );
    if (result instanceof Api.updates.DifferenceTooLong) {
      return {
        updates: [],
        peers: [],
        checkpoint: { ...from, pts: result.pts },
        final: false,
        tooLong: true,
      };
    }
    if (result instanceof Api.updates.DifferenceEmpty) {
      return {
        updates: [],
        peers: [],
        checkpoint: { ...from, date: result.date, seq: result.seq },
        final: true,
        tooLong: false,
      };
    }
    const state =
      result instanceof Api.updates.DifferenceSlice
        ? result.intermediateState
        : result.state;
    const newMessages = result.newMessages
      .map((message) => parseTelegramCrmMessage(message))
      .filter((message): message is TelegramCrmMtprotoMessage =>
        Boolean(message),
      )
      .map((message) => ({ type: 'message.new', message }) as const);
    const otherUpdates = result.otherUpdates
      .map((update) => normalizeTelegramCrmUpdate(update))
      .filter((update): update is TelegramCrmMtprotoUpdate => Boolean(update));
    const updates = [...newMessages, ...otherUpdates];
    const privateUserIds = new Set(
      updates.flatMap((update) => {
        if (update.type === 'message.new' || update.type === 'message.edited') {
          return [update.message.telegramUserId];
        }
        if (
          update.type === 'history.inboxRead' ||
          update.type === 'history.outboxRead'
        ) {
          return [update.telegramUserId];
        }
        return [];
      }),
    );
    return {
      updates,
      peers: result.users
        .filter((user): user is Api.User => user instanceof Api.User)
        .map((user) => parseTelegramCrmPeer(user))
        .filter((peer): peer is TelegramCrmMtprotoPeer =>
          Boolean(peer && privateUserIds.has(peer.telegramUserId)),
        ),
      checkpoint: telegramCrmCheckpoint(state),
      final: !(result instanceof Api.updates.DifferenceSlice),
      tooLong: false,
    };
  }

  onUpdate(
    handler: (update: TelegramCrmMtprotoUpdate) => void,
    onError?: (error: Error) => void,
  ) {
    const rawHandler = (raw: unknown) => {
      for (const update of normalizeTelegramCrmRaw(raw)) handler(update);
    };
    if (onError) {
      this.client.onError = (error) => {
        onError(error);
        return Promise.resolve();
      };
    }
    this.client.addEventHandler(rawHandler);
    return () => {
      this.client.removeEventHandler(rawHandler, undefined as never);
      if (onError) this.client.onError = () => Promise.resolve();
    };
  }

  close() {
    return (this.closePromise ??= closeTelegramMtprotoSession(this.client));
  }

  private inputPeer(telegramUserId: string, accessHash: string) {
    if (!/^\d+$/.test(telegramUserId) || !/^-?\d+$/.test(accessHash)) {
      throw new BadRequestException('Invalid Telegram private peer');
    }
    return new Api.InputPeerUser({
      userId: returnBigInt(telegramUserId),
      accessHash: returnBigInt(accessHash),
    });
  }
}

@Injectable()
export class TelegramCrmMtprotoAdapter {
  async open(
    credentials: TelegramCrmMtprotoCredentials,
    signal?: AbortSignal,
  ): Promise<TelegramCrmMtprotoHandle> {
    const client = await createTelegramMtprotoSession(credentials, signal);
    return new GramJsTelegramCrmHandle(client);
  }
}

export const telegramCrmMtprotoParsers = {
  parseMessage: parseTelegramCrmMessage,
  parsePeer: parseTelegramCrmPeer,
  normalizedUpdate: normalizeTelegramCrmUpdate,
};

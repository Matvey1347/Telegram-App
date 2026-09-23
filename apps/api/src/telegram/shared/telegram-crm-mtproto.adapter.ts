import { BadRequestException, Injectable } from '@nestjs/common';
import { Api, TelegramClient } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';
import {
  closeTelegramMtprotoSession,
  createTelegramMtprotoSession,
} from './telegram-mtproto-session.factory';
import type {
  TelegramCrmMtprotoCheckpoint,
  TelegramCrmMtprotoCredentials,
  TelegramCrmMtprotoDialog,
  TelegramCrmMtprotoDialogFolder,
  TelegramCrmMtprotoDifference,
  TelegramCrmMtprotoHandle,
  TelegramCrmMtprotoMessage,
  TelegramCrmMtprotoPeer,
  TelegramCrmMtprotoUpdate,
} from './telegram-crm-mtproto.types';
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
} from './telegram-crm-mtproto.normalizer';
import { telegramMarkupToHtml } from './telegram-markup';
import { parseTelegramHtml } from './telegram-html-parser';

type CrmDialogFolderFilter = {
  folder: TelegramCrmMtprotoDialogFolder;
  includeUserIds: Set<string>;
  excludeUserIds: Set<string>;
  contacts: boolean;
  nonContacts: boolean;
  bots: boolean;
  excludeMuted: boolean;
  excludeRead: boolean;
  excludeArchived: boolean;
};

function inputPeerUserIds(peers: Api.TypeInputPeer[]) {
  return new Set(
    peers.flatMap((peer) =>
      peer instanceof Api.InputPeerUser
        ? [telegramLongString(peer.userId)]
        : [],
    ),
  );
}

function isMutedDialog(dialog?: Api.Dialog) {
  if (!dialog || !(dialog.notifySettings instanceof Api.PeerNotifySettings)) {
    return false;
  }
  return Number(dialog.notifySettings.muteUntil ?? 0) > Date.now() / 1_000;
}

class GramJsTelegramCrmHandle implements TelegramCrmMtprotoHandle {
  private closePromise?: Promise<void>;
  private folderFilters?: Promise<CrmDialogFolderFilter[]>;

  constructor(private readonly client: TelegramClient) {}

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
    const loadedFolderFilters = await this.getDialogFolderFilters();
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
          .filter((filter) => this.matchesFolder(filter, dialog, entity))
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

  async setDialogFolderMembership(input: {
    folderId: number;
    telegramUserId: string;
    telegramAccessHash: string;
    included: boolean;
  }) {
    const response = await this.client.invoke(
      new Api.messages.GetDialogFilters(),
    );
    if (!(response instanceof Api.messages.DialogFilters)) {
      throw new Error('Telegram did not return the account folder filters');
    }
    const filter = response.filters.find(
      (item): item is Api.DialogFilter =>
        item instanceof Api.DialogFilter && Number(item.id) === input.folderId,
    );
    if (!filter) {
      throw new BadRequestException('Telegram folder is no longer available');
    }
    const peer = new Api.InputPeerUser({
      userId: returnBigInt(input.telegramUserId),
      accessHash: returnBigInt(input.telegramAccessHash),
    });
    const withoutPeer = (peers: Api.TypeInputPeer[]) =>
      peers.filter(
        (item) =>
          !(item instanceof Api.InputPeerUser) ||
          telegramLongString(item.userId) !== input.telegramUserId,
      );
    const includePeers = withoutPeer(filter.includePeers);
    const excludePeers = withoutPeer(filter.excludePeers);
    if (input.included) includePeers.push(peer);
    else excludePeers.push(peer);
    await this.client.invoke(
      new Api.messages.UpdateDialogFilter({
        id: input.folderId,
        filter: new Api.DialogFilter({
          id: filter.id,
          title: filter.title,
          emoticon: filter.emoticon,
          color: filter.color,
          pinnedPeers: filter.pinnedPeers,
          includePeers,
          excludePeers,
          contacts: filter.contacts,
          nonContacts: filter.nonContacts,
          groups: filter.groups,
          broadcasts: filter.broadcasts,
          bots: filter.bots,
          excludeMuted: filter.excludeMuted,
          excludeRead: filter.excludeRead,
          excludeArchived: filter.excludeArchived,
          titleNoanimate: filter.titleNoanimate,
        }),
      }),
    );
    this.folderFilters = undefined;
  }

  private getDialogFolderFilters() {
    return (this.folderFilters ??= this.loadDialogFolderFilters());
  }

  private async loadDialogFolderFilters(): Promise<CrmDialogFolderFilter[]> {
    const response = await this.client.invoke(
      new Api.messages.GetDialogFilters(),
    );
    if (!(response instanceof Api.messages.DialogFilters)) {
      throw new Error('Telegram did not return the account folder filters');
    }
    return response.filters.flatMap((filter) => {
      if (
        !(filter instanceof Api.DialogFilter) &&
        !(filter instanceof Api.DialogFilterChatlist)
      ) {
        return [];
      }
      const title =
        filter.title instanceof Api.TextWithEntities ? filter.title.text : '';
      if (!title.trim()) return [];
      const includeUserIds = inputPeerUserIds([
        ...filter.pinnedPeers,
        ...filter.includePeers,
      ]);
      const excludeUserIds =
        filter instanceof Api.DialogFilter
          ? inputPeerUserIds(filter.excludePeers)
          : new Set<string>();
      return [
        {
          folder: {
            id: Number(filter.id),
            title,
            emoticon: filter.emoticon ?? null,
            color: filter.color ?? null,
          },
          includeUserIds,
          excludeUserIds,
          contacts:
            filter instanceof Api.DialogFilter && Boolean(filter.contacts),
          nonContacts:
            filter instanceof Api.DialogFilter && Boolean(filter.nonContacts),
          bots: filter instanceof Api.DialogFilter && Boolean(filter.bots),
          excludeMuted:
            filter instanceof Api.DialogFilter && Boolean(filter.excludeMuted),
          excludeRead:
            filter instanceof Api.DialogFilter && Boolean(filter.excludeRead),
          excludeArchived:
            filter instanceof Api.DialogFilter &&
            Boolean(filter.excludeArchived),
        },
      ];
    });
  }

  private matchesFolder(
    filter: CrmDialogFolderFilter,
    dialog: { unreadCount?: number; archived?: boolean; dialog?: Api.Dialog },
    entity: Api.User,
  ) {
    const telegramUserId = telegramLongString(entity.id);
    if (filter.excludeUserIds.has(telegramUserId)) return false;
    const explicitlyIncluded = filter.includeUserIds.has(telegramUserId);
    const categoryIncluded =
      (filter.contacts && Boolean(entity.contact)) ||
      (filter.nonContacts && !entity.contact && !entity.bot) ||
      (filter.bots && Boolean(entity.bot));
    if (!explicitlyIncluded && !categoryIncluded) return false;
    if (filter.excludeRead && !dialog.unreadCount) return false;
    if (filter.excludeArchived && Boolean(dialog.archived)) return false;
    if (filter.excludeMuted && isMutedDialog(dialog.dialog)) return false;
    return true;
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
    return {
      messages,
      exhausted: rows.length < limit,
      nextBeforeTelegramMessageId:
        rows.length < limit || !messages.length
          ? null
          : Math.min(...messages.map((message) => message.telegramMessageId)),
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
    return peer;
  }

  async sendText(input: {
    telegramUserId: string;
    telegramAccessHash: string;
    text: string;
    randomId: bigint;
  }) {
    const [message, entities] = parseTelegramHtml(
      telegramMarkupToHtml(input.text),
    );
    const result = await this.client.invoke(
      new Api.messages.SendMessage({
        peer: this.inputPeer(input.telegramUserId, input.telegramAccessHash),
        message,
        entities,
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

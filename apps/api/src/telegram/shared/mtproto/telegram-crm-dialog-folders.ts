import { BadRequestException } from '@nestjs/common';
import { Api, TelegramClient } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';
import type { TelegramCrmMtprotoDialogFolder } from './telegram-crm-mtproto.types';
import { telegramLongString } from './telegram-crm-mtproto.normalizer';

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

/** Existing folder behavior extracted unchanged to keep the shared handle focused. */
export class TelegramCrmDialogFolders {
  private folderFilters?: Promise<CrmDialogFolderFilter[]>;
  constructor(private readonly client: TelegramClient) {}
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

  getDialogFolderFilters(refresh = false) {
    if (refresh) this.folderFilters = undefined;
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
            excludeRead:
              filter instanceof Api.DialogFilter && Boolean(filter.excludeRead),
            emojiPresentation: (() => {
              const entity =
                filter.title instanceof Api.TextWithEntities
                  ? filter.title.entities.find(
                      (value) =>
                        value instanceof Api.MessageEntityCustomEmoji &&
                        value.offset === 0,
                    )
                  : undefined;
              if (entity instanceof Api.MessageEntityCustomEmoji)
                return {
                  type: 'unicode' as const,
                  value: title.slice(
                    entity.offset,
                    entity.offset + entity.length,
                  ),
                  telegramCustomEmojiId: entity.documentId.toString(),
                };
              return filter.emoticon
                ? { type: 'unicode' as const, value: filter.emoticon }
                : null;
            })(),
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

  matchesFolder(
    filter: CrmDialogFolderFilter,
    dialog: { unreadCount?: number; archived?: boolean; dialog?: Api.Dialog },
    entity: Api.User,
    ignoreRead = false,
  ) {
    const telegramUserId = telegramLongString(entity.id);
    if (filter.excludeUserIds.has(telegramUserId)) return false;
    const explicitlyIncluded = filter.includeUserIds.has(telegramUserId);
    const categoryIncluded =
      (filter.contacts && Boolean(entity.contact)) ||
      (filter.nonContacts && !entity.contact && !entity.bot) ||
      (filter.bots && Boolean(entity.bot));
    if (!explicitlyIncluded && !categoryIncluded) return false;
    if (!ignoreRead && filter.excludeRead && !dialog.unreadCount) return false;
    if (filter.excludeArchived && Boolean(dialog.archived)) return false;
    if (filter.excludeMuted && isMutedDialog(dialog.dialog)) return false;
    return true;
  }
}

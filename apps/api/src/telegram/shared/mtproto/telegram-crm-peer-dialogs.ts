import { Api, TelegramClient } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';
import { TelegramCrmDialogFolders } from './telegram-crm-dialog-folders';
import {
  parseTelegramCrmPeer,
  telegramLongString,
} from './telegram-crm-mtproto.normalizer';
import type {
  TelegramCrmChatPeer,
  TelegramCrmMtprotoDialog,
} from './telegram-crm-mtproto.types';

/** Targeted folder metadata read; never fetches history or creates CRM contacts. */
export async function readCrmPeerDialogs(
  client: TelegramClient,
  folders: TelegramCrmDialogFolders,
  peers: TelegramCrmChatPeer[],
) {
  if (peers.length > 100) throw new Error('CRM_FOLDER_PEER_BATCH_LIMIT');
  const result = await client.invoke(
    new Api.messages.GetPeerDialogs({
      peers: peers.map(
        (peer) =>
          new Api.InputDialogPeer({
            peer: new Api.InputPeerUser({
              userId: returnBigInt(peer.telegramUserId),
              accessHash: returnBigInt(peer.telegramAccessHash),
            }),
          }),
      ),
    }),
  );
  if (!(result instanceof Api.messages.PeerDialogs))
    throw new Error('CRM_FOLDER_PEER_DIALOGS_UNAVAILABLE');
  const filters = await folders.getDialogFolderFilters();
  const users = new Map(
    result.users.flatMap((user) =>
      user instanceof Api.User
        ? [[telegramLongString(user.id), user] as const]
        : [],
    ),
  );
  const requested = new Map(
    peers.map((peer) => [peer.telegramUserId, peer.telegramAccessHash]),
  );
  const dialogs: TelegramCrmMtprotoDialog[] = result.dialogs.flatMap(
    (dialog) => {
      if (
        !(dialog instanceof Api.Dialog) ||
        !(dialog.peer instanceof Api.PeerUser)
      )
        return [];
      const userId = telegramLongString(dialog.peer.userId);
      const user = users.get(userId);
      if (user && user.accessHash == null && requested.has(userId))
        user.accessHash = returnBigInt(requested.get(userId)!);
      if (user?.min) throw new Error('CRM_FOLDER_PEER_DIALOGS_INCOMPLETE');
      const peer = user && parseTelegramCrmPeer(user);
      if (!user || !peer || !requested.has(userId)) return [];
      const state = {
        unreadCount: dialog.unreadCount,
        archived: Boolean(dialog.folderId),
        dialog,
      };
      return [
        {
          peer,
          telegramDialogId: userId,
          unreadCount: dialog.unreadCount,
          lastMessage: null,
          folderIds: filters
            .filter((filter) => folders.matchesFolder(filter, state, user))
            .map((filter) => filter.folder.id),
          folderMembershipIds: filters
            .filter((filter) =>
              folders.matchesFolder(filter, state, user, true),
            )
            .map((filter) => filter.folder.id),
        },
      ];
    },
  );
  if (dialogs.length !== requested.size)
    throw new Error('CRM_FOLDER_PEER_DIALOGS_INCOMPLETE');
  return { dialogs, folders: filters.map((filter) => filter.folder) };
}

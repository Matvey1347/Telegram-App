import { Api } from 'telegram';
import { readCrmPeerDialogs } from './telegram-crm-peer-dialogs';
import { TelegramCrmDialogFolders } from './telegram-crm-dialog-folders';
function fixture(hash?: number) {
  const user = new Api.User({
    id: 42 as never,
    accessHash: hash as never,
    contact: true,
  });
  const dialog = new Api.Dialog({
    peer: new Api.PeerUser({ userId: 42 as never }),
    topMessage: 1,
    readInboxMaxId: 1,
    readOutboxMaxId: 0,
    unreadCount: 0,
    unreadMentionsCount: 0,
    unreadReactionsCount: 0,
    notifySettings: new Api.PeerNotifySettings({}),
    pts: 1,
  });
  const folder = new Api.DialogFilter({
    id: 9,
    title: new Api.TextWithEntities({ text: 'Private', entities: [] }),
    contacts: true,
    excludeRead: true,
    pinnedPeers: [],
    includePeers: [],
    excludePeers: [],
  });
  const client = {
    invoke: jest
      .fn()
      .mockResolvedValueOnce(
        new Api.messages.PeerDialogs({
          dialogs: [dialog],
          messages: [],
          chats: [],
          users: [user],
          state: new Api.updates.State({
            pts: 1,
            qts: 0,
            date: 1,
            seq: 1,
            unreadCount: 0,
          }),
        }),
      )
      .mockResolvedValueOnce(
        new Api.messages.DialogFilters({ filters: [folder] }),
      ),
  };
  return { client, folders: new TelegramCrmDialogFolders(client as never) };
}
it('uses one targeted read with canonical read-independent membership and known hash fallback', async () => {
  const f = fixture();
  const result = await readCrmPeerDialogs(f.client as never, f.folders, [
    { telegramUserId: '42', telegramAccessHash: '420' },
  ]);
  expect(result.dialogs).toEqual([
    expect.objectContaining({ folderIds: [], folderMembershipIds: [9] }),
  ]);
  expect(f.client.invoke.mock.calls[0][0]).toBeInstanceOf(
    Api.messages.GetPeerDialogs,
  );
  expect(f.client.invoke).toHaveBeenCalledTimes(2);
});
it('rejects incomplete requested results rather than silently keeping stale memberships', async () => {
  const f = fixture(420);
  await expect(
    readCrmPeerDialogs(f.client as never, f.folders, [
      { telegramUserId: '99', telegramAccessHash: '990' },
    ]),
  ).rejects.toThrow('CRM_FOLDER_PEER_DIALOGS_INCOMPLETE');
});

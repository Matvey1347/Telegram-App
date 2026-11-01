import { Api, TelegramClient } from 'telegram';
import { TelegramCrmChatActionTransport } from './telegram-crm-chat-actions';

const peer = { telegramUserId: '765', telegramAccessHash: '9765' };
const dialog = (userId: string, unreadCount = 2, readInboxMaxId = 40) =>
  new Api.Dialog({
    peer: new Api.PeerUser({ userId: BigInt(userId) as never }),
    topMessage: 44,
    readInboxMaxId,
    readOutboxMaxId: 41,
    unreadCount,
    unreadMentionsCount: 0,
    unreadReactionsCount: 0,
    notifySettings: new Api.PeerNotifySettings({}),
  });
function setup(dialogs: Api.TypeDialog[]) {
  const invoke = jest
    .fn<Promise<Api.messages.PeerDialogs>, [Api.messages.GetPeerDialogs]>()
    .mockResolvedValue(
      new Api.messages.PeerDialogs({
        dialogs,
        messages: [],
        chats: [],
        users: [],
        state: new Api.updates.State({
          pts: 1,
          qts: 0,
          date: 1,
          seq: 1,
          unreadCount: 2,
        }),
      }),
    );
  return {
    invoke,
    actions: new TelegramCrmChatActionTransport({
      invoke,
    } as unknown as TelegramClient),
  };
}

describe('Telegram CRM targeted current dialog read state', () => {
  it('requests exactly one peer without a dialog scan and uses only its matched state', async () => {
    const { actions, invoke } = setup([
      dialog('999', 90, 9),
      dialog('765', 2, 40),
    ]);
    await expect(actions.getReadState(peer)).resolves.toEqual({
      pts: 1,
      topMessageId: 44,
      unreadCount: 2,
      readInboxMaxId: 40,
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    const request = invoke.mock.calls[0][0];
    expect(request).toBeInstanceOf(Api.messages.GetPeerDialogs);
    expect(request.peers).toHaveLength(1);
    const input = request.peers[0] as Api.InputDialogPeer;
    expect(input.peer).toBeInstanceOf(Api.InputPeerUser);
    expect((input.peer as Api.InputPeerUser).userId.toString()).toBe('765');
  });
  it.each(
    [[], [dialog('999')], [dialog('765', -1)], [dialog('765', 0, -1)]].map(
      (dialogs) => ({ dialogs }),
    ),
  )(
    'does not guess state from missing, foreign or malformed dialog $#',
    async ({ dialogs }) => {
      await expect(setup(dialogs).actions.getReadState(peer)).rejects.toThrow(
        'CHAT_DIALOG_READ_STATE_UNAVAILABLE',
      );
    },
  );
  it('accepts authoritative zero unread and propagates provider failure', async () => {
    const { actions, invoke } = setup([dialog('765', 0, 50)]);
    await expect(actions.getReadState(peer)).resolves.toEqual({
      pts: 1,
      topMessageId: 44,
      unreadCount: 0,
      readInboxMaxId: 50,
    });
    invoke.mockRejectedValueOnce(new Error('TIMEOUT'));
    await expect(actions.getReadState(peer)).rejects.toThrow('TIMEOUT');
  });
});

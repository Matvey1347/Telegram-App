import { TelegramMtprotoClient } from './telegram-mtproto.client';

describe('channel info read deadline', () => {
  it('closes a stalled metadata reader so it cannot retain the publishing account indefinitely', async () => {
    jest.useFakeTimers();
    const adapter = new TelegramMtprotoClient();
    const fakeClient = {} as never;
    jest.spyOn(adapter, 'createClient').mockResolvedValue(fakeClient);
    const close = jest.spyOn(adapter, 'closeClient').mockResolvedValue();
    jest.spyOn(adapter, 'resolveStoredChannel').mockImplementation(() => new Promise(() => undefined));
    try {
      const read = adapter.getPublicChannelInfo({ apiId: '1', apiHash: 'fixture', session: 'fixture', channel: { telegramChatId: '123' } });
      const rejected = expect(read).rejects.toThrow(/metadata/);
      await jest.advanceTimersByTimeAsync(30_001);
      await rejected;
      expect(close).toHaveBeenCalledWith(fakeClient);
    } finally { jest.useRealTimers(); }
  });
});

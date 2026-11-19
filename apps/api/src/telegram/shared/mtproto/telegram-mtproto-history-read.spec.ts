import { Api } from 'telegram';
import { TelegramMtprotoClient } from './telegram-mtproto.client';
import { readTelegramHistoryFromCutoff } from './telegram-history-cutoff';

const from = new Date('2026-11-01T00:00:00Z');
const recent = (id: number) => ({
  id,
  date: Math.floor(from.getTime() / 1000) + id,
  message: `Post ${id}`,
});
const old = { id: 1, date: Math.floor(from.getTime() / 1000) - 1 };
const credentials = {
  apiId: '1',
  apiHash: 'hash',
  session: 'session',
  channelRef: 'channel',
};
function transport() {
  const client = new TelegramMtprotoClient();
  const remote = {
    getEntity: jest.fn().mockResolvedValue({ id: 123 }),
    getInputEntity: jest.fn().mockResolvedValue({ id: 123 }),
    getMessages: jest.fn().mockResolvedValue([]),
    invoke: jest.fn().mockResolvedValue({ messages: [] }),
  };
  jest
    .spyOn(client as never, 'createClient' as never)
    .mockResolvedValue(remote as never);
  const close = jest
    .spyOn(client as never, 'closeClient' as never)
    .mockResolvedValue(undefined as never);
  return { client, remote, close };
}

describe('Telegram history completeness transport', () => {
  it('marks a history crossing the requested cutoff complete', async () => {
    const { client, remote } = transport();
    remote.getMessages.mockResolvedValue([recent(4), old]);
    const result = await client.getManagedPostMessages({
      ...credentials,
      publishedMessageIds: [],
      scheduledMessageIds: [],
      recentPublishedFrom: from,
    });
    expect(result.recentPublishedComplete).toBe(true);
    expect(result.recentPublished.map((message) => message.id)).toEqual(['4']);
  });

  it('marks an exhausted empty history complete but an unbounded preview incomplete', async () => {
    const { client } = transport();
    const input = {
      ...credentials,
      publishedMessageIds: [],
      scheduledMessageIds: [],
    };
    expect(
      (
        await client.getManagedPostMessages({
          ...input,
          recentPublishedFrom: from,
        })
      ).recentPublishedComplete,
    ).toBe(true);
    expect(
      (await client.getManagedPostMessages(input)).recentPublishedComplete,
    ).toBe(false);
  });

  it('does not prove absence when the 500-message limit is reached', async () => {
    const { client, remote } = transport();
    remote.getMessages.mockImplementation(
      (_entity: unknown, params: { limit: number; offsetId: number }) => {
        const start = params.offsetId || 1000;
        return Promise.resolve(
          Array.from({ length: params.limit }, (_, index) =>
            recent(start - index - 1),
          ),
        );
      },
    );
    const result = await client.getManagedPostMessages({
      ...credentials,
      publishedMessageIds: [],
      scheduledMessageIds: [],
      recentPublishedFrom: from,
    });
    expect(result.recentPublished).toHaveLength(500);
    expect(result.recentPublishedComplete).toBe(false);
  });

  it.each([{}, { messages: null }, { messages: [{}] }])(
    'rejects an incomplete scheduled queue response: %j',
    async (response) => {
      const { client, remote, close } = transport();
      remote.invoke.mockResolvedValue(response);
      await expect(client.getScheduledHistory(credentials)).rejects.toThrow(
        'complete scheduled queue',
      );
      expect(close).toHaveBeenCalled();
    },
  );

  it('rejects a sliced queue whose count exceeds returned messages', async () => {
    const { client, remote } = transport();
    remote.invoke.mockResolvedValue(
      new Api.messages.MessagesSlice({
        count: 2,
        messages: [],
        chats: [],
        users: [],
      }),
    );
    await expect(client.getScheduledHistory(credentials)).rejects.toThrow(
      'complete scheduled queue',
    );
  });

  it('accepts an explicitly empty complete scheduled queue', async () => {
    const { client } = transport();
    await expect(client.getScheduledHistory(credentials)).resolves.toEqual([]);
  });
});

describe('bounded history pagination completeness', () => {
  const options = {
    maxPostBackfillLimit: 500,
    pageSize: 2,
    toFiniteNumber: (value: unknown) =>
      typeof value === 'number' ? value : null,
    toTelegramDate: (value: unknown) =>
      typeof value === 'number' ? new Date(value * 1000) : null,
  };
  it('reports a short final page complete', async () => {
    const read = jest
      .fn()
      .mockResolvedValueOnce([recent(5), recent(4)])
      .mockResolvedValueOnce([recent(3)]);
    const onComplete = jest.fn();
    const rows = await readTelegramHistoryFromCutoff<ReturnType<typeof recent>>(
      read,
      { postsFrom: from, onComplete },
      options,
    );
    expect(rows.map((row) => row.id)).toEqual([5, 4, 3]);
    expect(onComplete).toHaveBeenCalledWith(true);
  });

  it('stops repeated pages without claiming a complete history', async () => {
    const read = jest.fn().mockResolvedValue([recent(5), recent(4)]);
    const onComplete = jest.fn();
    await readTelegramHistoryFromCutoff(
      read,
      { postsFrom: from, onComplete },
      options,
    );
    expect(read).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledWith(false);
  });
});

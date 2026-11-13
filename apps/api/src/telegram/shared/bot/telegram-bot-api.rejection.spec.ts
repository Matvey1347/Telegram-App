import {
  TelegramBotApiClient,
  TelegramBotApiError,
} from './telegram-bot-api.client';

describe('Telegram Bot API delivery outcome', () => {
  afterEach(() => jest.restoreAllMocks());

  it('retains a confirmed rate-limit rejection and Telegram retry deadline', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error_code: 429,
            description: 'Too Many Requests',
            parameters: { retry_after: 19 },
          }),
          { status: 429 },
        ),
      );
    await expect(
      new TelegramBotApiClient().sendMessage('test-token', {
        chat_id: 'channel',
        text: 'test',
      }),
    ).rejects.toMatchObject({
      kind: 'TRANSIENT',
      confirmedRejection: true,
      explicitRejected: true,
      errorCode: 429,
      retryAfterSeconds: 19,
    });
  });

  it('retains explicit authorization rejection without treating it as a transport timeout', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error_code: 401,
            description: 'Unauthorized',
          }),
          { status: 401 },
        ),
      );
    await expect(
      new TelegramBotApiClient().sendMessage('test-token', {
        chat_id: 'channel',
        text: 'test',
      }),
    ).rejects.toMatchObject({
      kind: 'PERMANENT',
      explicitRejected: true,
      errorCode: 401,
    });
  });

  it('leaves network timeouts ambiguous because Telegram may have accepted the send', async () => {
    const timeout = new DOMException('Request timed out', 'TimeoutError');
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(timeout);
    await expect(
      new TelegramBotApiClient().sendMessage('test-token', {
        chat_id: 'channel',
        text: 'test',
      }),
    ).rejects.toBe(timeout);
  });

  it('does not call an unstructured gateway failure a confirmed Telegram rejection', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ description: 'Gateway unavailable' }), {
          status: 502,
        }),
      );
    await expect(
      new TelegramBotApiClient().sendMessage('test-token', {
        chat_id: 'channel',
        text: 'test',
      }),
    ).rejects.toMatchObject({ kind: 'TRANSIENT', explicitRejected: false });
    expect(
      new TelegramBotApiError('synthetic', 'TRANSIENT').confirmedRejection,
    ).toBe(false);
  });
});

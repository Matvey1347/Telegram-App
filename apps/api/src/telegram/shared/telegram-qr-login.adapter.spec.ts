import { Api, TelegramClient } from 'telegram';
import { loginWithTelegramQr } from './telegram-qr-login.adapter';

function loginToken(token = Buffer.from('qr-token'), expires?: number) {
  return new Api.auth.LoginToken({
    token,
    expires: expires ?? Math.floor(Date.now() / 1000) + 30,
  });
}

function successToken() {
  return new Api.auth.LoginTokenSuccess({
    authorization: new Api.auth.Authorization({
      user: new Api.User({ id: 42 as never, firstName: 'Ada' }),
    }),
  });
}

function harness(results: Array<unknown>) {
  let handler: ((update: unknown) => void) | undefined;
  const client = {
    invoke: jest.fn(async () => {
      const next = results.shift();
      if (next instanceof Error) throw next;
      return next;
    }),
    _switchDC: jest.fn().mockResolvedValue(true),
    addEventHandler: jest.fn((next: (update: unknown) => void) => {
      handler = next;
    }),
    removeEventHandler: jest.fn(),
  } as unknown as TelegramClient;
  const closeClient = jest.fn().mockResolvedValue(undefined);
  const dependencies = {
    createClient: jest.fn().mockResolvedValue(client),
    closeClient,
    saveSession: jest.fn().mockReturnValue('saved-session'),
    getProfile: jest.fn().mockResolvedValue({
      id: '42',
      username: null,
      firstName: 'Ada',
      lastName: null,
      photoUrl: null,
      nameColor: null,
      capabilities: {
        isPremium: false,
        captionLengthMax: 1024,
        messageLengthMax: 4096,
        maxUploadFileSizeMb: 2000,
        supportsCustomEmoji: false,
        checkedAt: new Date().toISOString(),
        limitsSource: 'telegram_config' as const,
      },
    }),
  };
  return {
    client,
    dependencies,
    closeClient,
    emit: (value: unknown) => handler?.(value),
  };
}

describe('loginWithTelegramQr', () => {
  it('emits a base64url QR and completes after Telegram authorizes it', async () => {
    const test = harness([
      loginToken(Buffer.from([251, 255, 239])),
      successToken(),
    ]);
    const progress = jest.fn(() => test.emit(new Api.UpdateLoginToken()));

    await expect(
      loginWithTelegramQr(
        '123',
        'api-hash',
        new AbortController().signal,
        progress,
        test.dependencies,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'connected',
        session: 'saved-session',
      }),
    );
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'qr',
        loginUrl: 'tg://login?token=-__v',
        expiresAt: expect.any(Number),
      }),
    );
    expect(test.closeClient).toHaveBeenCalledTimes(1);
    expect(test.client.removeEventHandler).toHaveBeenCalled();
  });

  it('refreshes an expired token in the same request', async () => {
    const test = harness([
      loginToken(Buffer.from('first'), Math.floor(Date.now() / 1000)),
      loginToken(Buffer.from('second')),
    ]);
    const abort = new AbortController();
    const progress = jest.fn(() => {
      if (progress.mock.calls.length === 2) abort.abort();
    });

    await expect(
      loginWithTelegramQr(
        '123',
        'hash',
        abort.signal,
        progress,
        test.dependencies,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(progress).toHaveBeenCalledTimes(2);
    expect(test.closeClient).toHaveBeenCalled();
  });

  it('preserves a temporary session when DC import requires 2FA', async () => {
    const passwordNeeded = Object.assign(new Error('password needed'), {
      errorMessage: 'SESSION_PASSWORD_NEEDED',
    });
    const test = harness([
      new Api.auth.LoginTokenMigrateTo({ dcId: 4, token: Buffer.from('move') }),
      passwordNeeded,
    ]);

    await expect(
      loginWithTelegramQr(
        '123',
        'hash',
        new AbortController().signal,
        jest.fn(),
        test.dependencies,
      ),
    ).resolves.toEqual({
      status: 'needs_password',
      tempSession: 'saved-session',
    });
    expect(test.client._switchDC).toHaveBeenCalledWith(4);
    expect(test.closeClient).toHaveBeenCalledTimes(1);
  });

  it('closes the client and removes its update handler on abort', async () => {
    const test = harness([loginToken()]);
    const abort = new AbortController();
    const action = loginWithTelegramQr(
      '123',
      'hash',
      abort.signal,
      () => abort.abort(),
      test.dependencies,
    );

    await expect(action).rejects.toMatchObject({ name: 'AbortError' });
    expect(test.closeClient).toHaveBeenCalledTimes(2);
    expect(test.client.removeEventHandler).toHaveBeenCalled();
  });

  it('closes again after an aborted DC switch can revive the transport', async () => {
    const test = harness([
      new Api.auth.LoginTokenMigrateTo({ dcId: 4, token: Buffer.from('move') }),
    ]);
    const abort = new AbortController();
    (test.client._switchDC as jest.Mock).mockImplementation(async () => {
      abort.abort();
      return true;
    });

    await expect(
      loginWithTelegramQr(
        '123',
        'hash',
        abort.signal,
        jest.fn(),
        test.dependencies,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(test.closeClient).toHaveBeenCalledTimes(2);
  });
});

import { acquireTelegramMtprotoSessionLease } from './telegram-mtproto-session-lease';

describe('Telegram MTProto session lease', () => {
  it('serializes use of the same persisted session until the first client closes', async () => {
    const releaseFirst = await acquireTelegramMtprotoSessionLease('session-a');
    let enteredSecond = false;
    const second = acquireTelegramMtprotoSessionLease('session-a').then(
      (release) => {
        enteredSecond = true;
        return release;
      },
    );

    await Promise.resolve();
    expect(enteredSecond).toBe(false);
    releaseFirst();

    const releaseSecond = await second;
    expect(enteredSecond).toBe(true);
    releaseSecond();
  });

  it('does not block different sessions', async () => {
    const releaseFirst = await acquireTelegramMtprotoSessionLease('session-a');
    const releaseOther = await acquireTelegramMtprotoSessionLease('session-b');

    releaseOther();
    releaseFirst();
  });
  it('cancels a queued reader promptly without releasing the live predecessor', async () => {
    const releaseFirst =
      await acquireTelegramMtprotoSessionLease('cancelled-reader');
    const controller = new AbortController();
    const pending = acquireTelegramMtprotoSessionLease(
      'cancelled-reader',
      controller.signal,
    );
    const rejection = expect(pending).rejects.toThrow('reader timed out');
    controller.abort(new Error('reader timed out'));
    await rejection;

    let successorEntered = false;
    const successor = acquireTelegramMtprotoSessionLease(
      'cancelled-reader',
    ).then((release) => {
      successorEntered = true;
      return release;
    });
    // Flush promise-chain continuations: skipping the cancelled waiter must
    // never admit a successor before the original live transport closes.
    for (let index = 0; index < 10; index++) await Promise.resolve();
    expect(successorEntered).toBe(false);
    releaseFirst();
    const releaseSuccessor = await successor;
    expect(successorEntered).toBe(true);
    releaseSuccessor();
    releaseSuccessor();
    const releaseAfterCleanup =
      await acquireTelegramMtprotoSessionLease('cancelled-reader');
    releaseAfterCleanup();
  });

  it('rejects an already-aborted wait without inserting a turn or disturbing ownership', async () => {
    const controller = new AbortController();
    controller.abort(new Error('already cancelled'));
    await expect(
      acquireTelegramMtprotoSessionLease('already-aborted', controller.signal),
    ).rejects.toThrow('already cancelled');
    const release = await acquireTelegramMtprotoSessionLease('already-aborted');
    release();
    await expect(
      acquireTelegramMtprotoSessionLease(undefined, controller.signal),
    ).rejects.toThrow('already cancelled');
  });

  it('removes its abort listener after admission and keeps the lease until explicit close', async () => {
    const controller = new AbortController();
    const removeListener = jest.spyOn(controller.signal, 'removeEventListener');
    const release = await acquireTelegramMtprotoSessionLease(
      'listener-cleanup',
      controller.signal,
    );
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    controller.abort();
    let entered = false;
    const pending = acquireTelegramMtprotoSessionLease('listener-cleanup').then(
      (nextRelease) => {
        entered = true;
        return nextRelease;
      },
    );
    await Promise.resolve();
    expect(entered).toBe(false);
    release();
    (await pending)();
  });
});

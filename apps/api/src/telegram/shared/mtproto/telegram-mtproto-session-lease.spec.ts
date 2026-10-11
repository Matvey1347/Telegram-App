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
});

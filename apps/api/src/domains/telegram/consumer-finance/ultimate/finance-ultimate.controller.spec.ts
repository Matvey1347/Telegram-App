import { EventEmitter } from 'node:events';
import { FinanceUltimateController } from './finance-ultimate.controller';

describe('FinanceUltimateController message stream', () => {
  it('flushes start and text deltas before the final result', async () => {
    const session = {
      profileId: 'profile-1',
      botIntegrationId: 'bot-1',
      workspaceId: 'workspace-1',
      telegramBotUserId: 'user-1',
      defaultCurrency: 'PLN',
    };
    const requests = { authenticate: jest.fn().mockReturnValue(session) };
    const ultimate = {
      message: jest.fn(
        (
          _identity: unknown,
          _body: unknown,
          stream: { onMessageDelta: (delta: string) => void },
        ) => {
          stream.onMessageDelta('Hel');
          stream.onMessageDelta('lo');
          return Promise.resolve({ kind: 'ANSWER', message: 'Hello' });
        },
      ),
    };
    const controller = new FinanceUltimateController(
      requests as never,
      ultimate as never,
      {} as never,
    );
    const request = Object.assign(new EventEmitter(), {
      headers: { 'x-finance-consumer-request': '1' },
    });
    const writes: string[] = [];
    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: false,
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((value: string) => {
        writes.push(value);
        return true;
      }),
      end: jest.fn(function (this: { writableEnded: boolean }) {
        this.writableEnded = true;
      }),
    });

    await controller.message(
      'bot-1',
      request as never,
      { text: 'hello', history: [] },
      response as never,
    );

    expect(response.flushHeaders.mock.invocationCallOrder[0]).toBeLessThan(
      response.write.mock.invocationCallOrder[0],
    );
    expect(writes.map((line) => JSON.parse(line) as unknown)).toEqual([
      { type: 'start' },
      { type: 'delta', delta: 'Hel' },
      { type: 'delta', delta: 'lo' },
      { type: 'done', result: { kind: 'ANSWER', message: 'Hello' } },
    ]);
    expect(response.end).toHaveBeenCalledTimes(1);
  });
});

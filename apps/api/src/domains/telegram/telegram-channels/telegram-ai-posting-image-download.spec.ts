import { EventEmitter } from 'node:events';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { TelegramAiPostingSourceService } from './telegram-ai-posting-source.service';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('node:https', () => ({ request: jest.fn() }));

describe('AI Posting media downloads', () => {
  const service = new TelegramAiPostingSourceService({} as never);

  function reply(statusCode: number, location?: string) {
    return (
      _options: unknown,
      onResponse: (response: EventEmitter) => void,
    ) => {
      const response = Object.assign(new EventEmitter(), {
        statusCode,
        headers: { location },
        destroy: jest.fn(),
      });
      return Object.assign(new EventEmitter(), {
        setTimeout: jest.fn(),
        end: () =>
          queueMicrotask(() => {
            onResponse(response);
            if (statusCode === 200) {
              response.emit('data', Buffer.alloc(300));
              response.emit('end');
            }
          }),
      });
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(lookup)
      .mockImplementation(
        async () => [{ address: '93.184.216.34', family: 4 }] as never,
      );
  });

  it('reads an image behind a public HTTPS redirect', async () => {
    jest
      .mocked(request)
      .mockImplementationOnce(reply(302, 'https://cdn.example/photo') as never)
      .mockImplementationOnce(reply(200) as never);

    await expect(
      service.downloadImage('https://catalog.example/photo'),
    ).resolves.toHaveLength(300);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('rejects a redirected host that resolves to a private IP', async () => {
    jest
      .mocked(lookup)
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as never)
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }] as never);
    jest
      .mocked(request)
      .mockImplementationOnce(
        reply(302, 'https://private.example/photo') as never,
      );

    await expect(
      service.downloadImage('https://catalog.example/photo'),
    ).rejects.toThrow('AI_POSTING_SOURCE_HOST_BLOCKED');
    expect(request).toHaveBeenCalledTimes(1);
  });
});

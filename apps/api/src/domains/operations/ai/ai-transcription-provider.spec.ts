/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { AiProvider } from './ai-provider';
import { AiModelRegistry } from './ai-model-registry';

const registry = new AiModelRegistry();
const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'x-request-id': 'req_safe' },
  });

afterEach(() => jest.restoreAllMocks());
it('transcribes audio through the bounded provider with duration usage', async () => {
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      response({ text: 'Привіт', usage: { type: 'duration', seconds: 2.5 } }),
    );
  const provider = new AiProvider({ key: () => 'redacted' } as never, registry);
  const result = await provider.execute(
    '',
    {
      ...registry.category('TELEGRAM_POSTING_PLAN'),
      modelId: 'gpt-transcribe',
    },
    undefined,
    undefined,
    undefined,
    { mime: 'audio/wav', data: Buffer.from('audio') },
  );
  expect(result).toMatchObject({
    result: { reply: 'Привіт' },
    audioDurationSeconds: 2.5,
    errorCategory: null,
  });
  expect(fetch.mock.calls[0][0]).toBe(
    'https://api.openai.com/v1/audio/transcriptions',
  );
});
it('does not invent duration when the provider omits usage', async () => {
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(response({ text: 'Hello' }));
  const provider = new AiProvider({ key: () => 'redacted' } as never, registry);
  const result = await provider.execute(
    '',
    {
      ...registry.category('TELEGRAM_POSTING_PLAN'),
      modelId: 'gpt-transcribe',
    },
    undefined,
    undefined,
    undefined,
    { mime: 'audio/wav', data: Buffer.from('audio') },
  );
  expect(result.audioDurationSeconds).toBeNull();
});
it('uses the posting schema for an attached image and rejects an unsupported model', async () => {
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(response({ input_tokens: 20 }))
    .mockResolvedValueOnce(
      response({
        model: 'gpt-5.4-mini-2026-03-17',
        status: 'completed',
        usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
        output: [
          { content: [{ type: 'output_text', text: '{"reply":"A photo"}' }] },
        ],
      }),
    );
  const provider = new AiProvider({ key: () => 'redacted' } as never, registry);
  const image = {
    mime: 'image/jpeg' as const,
    data: Buffer.from([255, 216, 255, 1]),
  };
  const config = {
    ...registry.category('TELEGRAM_POSTING_PLAN'),
    modelId: 'gpt-5.4-mini-2026-03-17',
  };
  const result = await provider.execute(
    'Describe',
    config,
    undefined,
    undefined,
    image,
  );
  expect(result).toMatchObject({
    result: { reply: 'A photo' },
    errorCategory: null,
  });
  expect(
    JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string).input[0]
      .content[1].type,
  ).toBe('input_image');
  expect(
    (
      await provider.execute(
        'Describe',
        { ...config, modelId: 'gpt-6-luna' },
        undefined,
        undefined,
        image,
      )
    ).errorCategory,
  ).toBe('VISION_MODEL_UNSUPPORTED');
});

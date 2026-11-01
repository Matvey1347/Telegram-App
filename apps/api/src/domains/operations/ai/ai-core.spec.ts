/* In-memory transport/transaction mocks intentionally implement only exercised Prisma/fetch branches. */
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import { Prisma } from '@prisma/client';
import { AiModelRegistry } from './ai-model-registry';
import {
  budgetPeriods,
  parseUsage,
  priceUsage,
  reservationCost,
} from './ai-pricing';
import { AiLocalConcurrency } from './ai-local-concurrency';
import { AiProvider } from './ai-provider';

const registry = new AiModelRegistry();
const usage = {
  input_tokens: 1000,
  output_tokens: 100,
  input_tokens_details: { cached_tokens: 200, cache_write_tokens: 100 },
  output_tokens_details: { reasoning_tokens: 40 },
  total_tokens: 1100,
};
const completed = {
  model: 'gpt-6-luna',
  status: 'completed',
  usage,
  output: [
    {
      content: [
        {
          type: 'output_text',
          text: '{"classification":"ADVERTISEMENT","commercialIntent":true,"niche":"education","offerType":"course","hasContact":false,"relevance":"POSSIBLE","confidence":0.9,"risks":[],"evidence":[]}',
        },
      ],
    },
  ],
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'x-request-id': 'req_safe' },
  });

describe('internal AI registry, pricing and limits', () => {
  it('selects efficient classification and isolated support contracts with disabled defaults', () => {
    expect(registry.category('LEAD_AD_CLASSIFICATION').modelId).toBe(
      'gpt-6-luna',
    );
    expect(registry.category('SUPPORT_ASSISTANT')).toMatchObject({
      modelId: 'gpt-5.4-mini-2026-03-17',
      enabled: false,
      automaticEnabled: false,
    });
    expect(registry.models()).toHaveLength(2);
    expect(
      registry
        .models()
        .every((p) => p.version === 'openai-standard-2026-10-31'),
    ).toBe(true);
    expect(
      registry.validate('SUPPORT_ASSISTANT', {
        message: 'sales',
        rationale: '',
      }),
    ).toBe(false);
  });
  it('prices nonadditive cache writes and does not double count reasoning', () => {
    const parsed = parseUsage(usage)!;
    expect(priceUsage(registry.price('gpt-6-luna')!, parsed)?.toFixed(12)).toBe(
      '0.000134500000',
    );
    expect(
      priceUsage(registry.price('gpt-5.4-mini-2026-03-17')!, parsed),
    ).toBeNull();
    expect(
      reservationCost(registry.price('gpt-6-luna')!, 8000, 1000).eq(
        new Prisma.Decimal('0.0015'),
      ),
    ).toBe(true);
    expect(registry.price('arbitrary-model')).toBeUndefined();
  });
  it('rejects missing, inconsistent and extra billed usage without inventing zero', () => {
    expect(parseUsage(undefined)).toBeNull();
    expect(parseUsage({ ...usage, total_tokens: 0 })).toBeNull();
    expect(
      parseUsage({ ...usage, input_tokens_details: { cached_tokens: 1001 } }),
    ).toBeNull();
    expect(
      parseUsage({ ...usage, output_tokens_details: { audio_tokens: 1 } }),
    ).toBeNull();
  });
  it('uses UTC day and month boundaries including year rollover', () => {
    const periods = budgetPeriods(new Date('2026-12-31T23:59:59Z'));
    expect(periods.map((p) => p.periodEnd.toISOString())).toEqual([
      '2027-01-01T00:00:00.000Z',
      '2027-01-01T00:00:00.000Z',
    ]);
  });
  it('has one bounded process pool, no queue, and idempotent release', () => {
    const pool = new AiLocalConcurrency();
    const releases = Array.from({ length: 8 }, () => pool.acquire());
    expect(() => pool.acquire()).toThrow('AI_CAPACITY_EXHAUSTED');
    releases[0]();
    releases[0]();
    const release = pool.acquire();
    expect(() => pool.acquire()).toThrow();
    release();
    releases.slice(1).forEach((fn) => fn());
  });
});

describe('internal AI fixed Responses provider (mocked only)', () => {
  let fetchMock: jest.SpyInstance;
  const deployment = { key: () => 'server-secret' };
  const config = registry.category('LEAD_AD_CLASSIFICATION');
  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  it('does no idle requests and counts exact input before structured generation', async () => {
    const provider = new AiProvider(deployment as any, registry);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock
      .mockResolvedValueOnce(response({ input_tokens: 30 }))
      .mockResolvedValueOnce(response(completed));
    const result = await provider.execute(
      'private input',
      config,
      undefined,
      'Trusted server policy',
    );
    expect(result).toMatchObject({
      result: { classification: 'ADVERTISEMENT', confidence: 0.9 },
      errorCategory: null,
      usage: { inputTokens: 1000 },
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://api.openai.com/v1/responses/input_tokens',
      'https://api.openai.com/v1/responses',
    ]);
    const bodies = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(init.body) as Record<string, unknown>,
    );
    expect(bodies[0]).toEqual({
      model: bodies[1].model,
      input: bodies[1].input,
      instructions: bodies[1].instructions,
      tools: bodies[1].tools,
      reasoning: bodies[1].reasoning,
      text: bodies[1].text,
      truncation: bodies[1].truncation,
    });
    for (const key of [
      'store',
      'background',
      'service_tier',
      'max_output_tokens',
    ])
      expect(bodies[0]).not.toHaveProperty(key);
    expect(bodies[1]).toMatchObject({
      store: false,
      background: false,
      service_tier: 'default',
      tools: [],
      reasoning: { effort: 'none' },
      instructions: 'Trusted server policy',
    });
  });
  it.each([
    [400, 'TOKEN_COUNT_REQUEST_INVALID'],
    [401, 'TOKEN_COUNT_AUTHENTICATION_FAILED'],
    [403, 'TOKEN_COUNT_AUTHENTICATION_FAILED'],
    [404, 'TOKEN_COUNT_MODEL_UNAVAILABLE'],
    [429, 'TOKEN_COUNT_RATE_LIMITED'],
    [503, 'TOKEN_COUNT_UNAVAILABLE'],
  ])(
    'reports safe token-count failure %s without attempting generation',
    async (status, errorCategory) => {
      fetchMock.mockResolvedValue(
        response({ error: { message: 'private provider detail' } }, status),
      );
      const outcome = await new AiProvider(deployment as any, registry).execute(
        'text',
        config,
      );
      expect(outcome).toMatchObject({
        errorCategory,
        generationStarted: false,
        usage: null,
      });
      expect(JSON.stringify(outcome)).not.toContain('private provider detail');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it('refuses input over exact token cap before generation', async () => {
    fetchMock.mockResolvedValue(response({ input_tokens: 8001 }));
    expect(
      await new AiProvider(deployment as any, registry).execute('text', config),
    ).toMatchObject({
      generationStarted: false,
      errorCategory: 'INPUT_TOKEN_LIMIT',
      usage: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(['not-json', '{"reply":"wrong category"}'])(
    'preserves real billing on invalid output %s',
    async (text) => {
      fetchMock
        .mockResolvedValueOnce(response({ input_tokens: 5 }))
        .mockResolvedValueOnce(
          response({
            ...completed,
            output: [{ content: [{ type: 'output_text', text }] }],
          }),
        );
      const result = await new AiProvider(deployment as any, registry).execute(
        'text',
        config,
      );
      expect(result.usage?.inputTokens).toBe(1000);
      expect(result.errorCategory).toMatch(/^OUTPUT_/);
    },
  );
  it('does not echo provider errors and preserves missing usage as null', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ input_tokens: 5 }))
      .mockResolvedValueOnce(
        response({ error: { message: 'server-secret private input' } }, 500),
      );
    const result = await new AiProvider(deployment as any, registry).execute(
      'text',
      config,
    );
    expect(result).toMatchObject({
      generationStarted: true,
      usage: null,
      errorCategory: 'PROVIDER_UNAVAILABLE',
    });
    expect(JSON.stringify(result)).not.toContain('server-secret');
  });
  it('times out the whole count+generation flow without retry or refund claim', async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(response({ input_tokens: 5 }))
      .mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener(
              'abort',
              () => reject(new Error('secret')),
              { once: true },
            ),
          ),
      );
    const pending = new AiProvider(deployment as any, registry).execute(
      'text',
      config,
    );
    await jest.advanceTimersByTimeAsync(30001);
    expect(await pending).toMatchObject({
      errorCategory: 'TIMEOUT',
      generationStarted: true,
      usage: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('caller abort before sending has no generation', async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValue(new Error('aborted'));
    expect(
      await new AiProvider(deployment as any, registry).execute(
        'text',
        config,
        controller.signal,
      ),
    ).toMatchObject({ errorCategory: 'ABORTED', generationStarted: false });
  });
});

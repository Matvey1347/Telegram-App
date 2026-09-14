import { BadGatewayException } from '@nestjs/common';
import { requestFinanceStructuredResponse } from './finance-ai-responses.client';

describe('requestFinanceStructuredResponse', () => {
  const originalFetch = global.fetch;
  const input = {
    apiKey: 'test-key',
    model: 'gpt-5-mini',
    profileId: 'profile-1',
    content: [{ type: 'input_text', text: 'hello' }],
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['answer'],
      properties: { answer: { type: 'string' } },
    },
    schemaName: 'test_response',
    maxOutputTokens: 100,
    providerFailureMessage: 'Finance assistant request failed',
  };

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function response(status: number, body: Record<string, unknown>) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ 'x-request-id': `request-${status}` }),
      json: jest.fn().mockResolvedValue(body),
    } as unknown as Response;
  }

  it('retries one transient provider failure and returns the recovered response', async () => {
    const requestIds: string[] = [];
    let attempt = 0;
    const fetchMock = jest.fn(
      (_url: string | URL | Request, init?: RequestInit) => {
        requestIds.push(
          new Headers(init?.headers).get('X-Client-Request-Id') || '',
        );
        attempt += 1;
        return Promise.resolve(
          attempt === 1
            ? response(502, { error: { type: 'server_error' } })
            : response(200, { output_text: '{"answer":"ok"}' }),
        );
      },
    );
    global.fetch = fetchMock as never;

    await expect(requestFinanceStructuredResponse(input)).resolves.toEqual({
      text: '{"answer":"ok"}',
      usage: undefined,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestIds).toHaveLength(2);
    expect(requestIds.every((requestId) => requestId.length > 0)).toBe(true);
  });

  it('forwards structured output deltas and returns the completed usage', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"{\\"message\\":\\"Hel"}\n\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"lo\\"}"}\n\n' +
              'event: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":12,"output_tokens":3}}}\n\n' +
              'data: [DONE]\n\n',
          ),
        );
        controller.close();
      },
    });
    global.fetch = jest.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    ) as never;
    const deltas: string[] = [];

    await expect(
      requestFinanceStructuredResponse({
        ...input,
        onOutputTextDelta: (delta) => deltas.push(delta),
      }),
    ).resolves.toEqual({
      text: '{"message":"Hello"}',
      usage: { input_tokens: 12, output_tokens: 3 },
    });
    expect(deltas).toEqual(['{"message":"Hel', 'lo"}']);
    const calls = (global.fetch as jest.Mock).mock.calls as Array<
      [string, RequestInit]
    >;
    const requestBody = calls[0][1].body;
    expect(typeof requestBody).toBe('string');
    expect(JSON.parse(requestBody as string)).toMatchObject({
      stream: true,
    });
  });

  it('does not retry a rejected credential', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(response(401, { error: { type: 'invalid_request' } }));
    global.fetch = fetchMock as never;

    await expect(requestFinanceStructuredResponse(input)).rejects.toThrow(
      'Finance AI credential is invalid',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves provider diagnostics after the bounded retry fails', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      response(503, {
        error: { code: 'server_is_overloaded' },
      }),
    ) as never;

    try {
      await requestFinanceStructuredResponse(input);
      throw new Error('Expected the provider request to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BadGatewayException);
      expect((error as BadGatewayException).getResponse()).toMatchObject({
        code: 'FINANCE_AI_PROVIDER_ERROR',
        details: {
          providerStatus: 503,
          providerCode: 'server_is_overloaded',
          providerRequestId: 'request-503',
        },
      });
    }
  });
});

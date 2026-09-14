import { BadGatewayException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const RETRYABLE_PROVIDER_STATUSES = new Set([500, 502, 503, 504]);
const PROVIDER_RETRY_DELAY_MS = 250;

export type FinanceAiResponseUsage = {
  input_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens?: number;
};

type FinanceStructuredResponseInput = {
  apiKey: string;
  model: string;
  profileId: string;
  content: Array<Record<string, unknown>>;
  schema: Record<string, unknown>;
  schemaName: string;
  maxOutputTokens: number;
  instructions?: string;
  providerFailureMessage: string;
  onOutputTextDelta?: (delta: string) => void;
  signal?: AbortSignal;
};

export async function requestFinanceStructuredResponse(
  input: FinanceStructuredResponseInput,
) {
  const requestBody = JSON.stringify({
    model: input.model,
    store: false,
    max_output_tokens: input.maxOutputTokens,
    safety_identifier: createHash('sha256')
      .update(input.profileId)
      .digest('hex')
      .slice(0, 32),
    ...(input.instructions ? { instructions: input.instructions } : {}),
    input: [{ role: 'user', content: input.content }],
    text: {
      format: {
        type: 'json_schema',
        name: input.schemaName,
        strict: true,
        schema: input.schema,
      },
    },
    ...(input.onOutputTextDelta ? { stream: true } : {}),
  });

  let response: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'X-Client-Request-Id': randomUUID(),
      },
      body: requestBody,
      signal: input.signal
        ? AbortSignal.any([input.signal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
    });
    if (!RETRYABLE_PROVIDER_STATUSES.has(response.status) || attempt === 1) {
      break;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, PROVIDER_RETRY_DELAY_MS),
    );
  }

  if (response!.ok && input.onOutputTextDelta) {
    return readStreamingResponse(response!, input.onOutputTextDelta);
  }

  const body = (await response!.json().catch(() => ({}))) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    usage?: FinanceAiResponseUsage;
    error?: { code?: string; type?: string };
  };
  if (!response!.ok) {
    const providerRequestId = response!.headers.get('x-request-id');
    throw new BadGatewayException({
      message:
        response!.status === 401
          ? 'Finance AI credential is invalid'
          : input.providerFailureMessage,
      code: 'FINANCE_AI_PROVIDER_ERROR',
      details: {
        providerStatus: response!.status,
        providerCode: body.error?.code || body.error?.type || null,
        providerRequestId,
      },
    });
  }
  const text =
    body.output_text ||
    body.output
      ?.flatMap((item) => item.content || [])
      .find((item) => item.type === 'output_text')?.text;
  return { text, usage: body.usage };
}

async function readStreamingResponse(
  response: Response,
  onOutputTextDelta: (delta: string) => void,
) {
  if (!response.body) {
    throw new BadGatewayException('Finance AI returned an empty stream');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let text = '';
  let usage: FinanceAiResponseUsage | undefined;

  const consumeBlock = (block: string) => {
    const payload = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!payload || payload === '[DONE]') return;
    const event = JSON.parse(payload) as {
      type?: string;
      delta?: string;
      response?: { usage?: FinanceAiResponseUsage };
      error?: { message?: string };
    };
    if (event.type === 'response.output_text.delta' && event.delta) {
      text += event.delta;
      onOutputTextDelta(event.delta);
    } else if (event.type === 'response.completed') {
      usage = event.response?.usage;
    } else if (event.type === 'error' || event.type === 'response.failed') {
      throw new BadGatewayException(
        event.error?.message || 'Finance AI stream failed',
      );
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const blocks = pending.split(/\r?\n\r?\n/);
    pending = blocks.pop() || '';
    for (const block of blocks) consumeBlock(block);
    if (done) break;
  }
  if (pending.trim()) consumeBlock(pending);
  return { text, usage };
}

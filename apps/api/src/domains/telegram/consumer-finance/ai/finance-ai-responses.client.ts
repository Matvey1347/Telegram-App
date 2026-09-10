import { BadGatewayException } from '@nestjs/common';
import { createHash } from 'crypto';

export type FinanceAiResponseUsage = {
  input_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens?: number;
};

export async function requestFinanceStructuredResponse(input: {
  apiKey: string;
  model: string;
  profileId: string;
  content: Array<Record<string, unknown>>;
  schema: Record<string, unknown>;
  schemaName: string;
  maxOutputTokens: number;
  instructions?: string;
  providerFailureMessage: string;
}) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
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
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    usage?: FinanceAiResponseUsage;
  };
  if (!response.ok) {
    throw new BadGatewayException(
      response.status === 401
        ? 'Finance AI credential is invalid'
        : input.providerFailureMessage,
    );
  }
  const text =
    body.output_text ||
    body.output
      ?.flatMap((item) => item.content || [])
      .find((item) => item.type === 'output_text')?.text;
  return { text, usage: body.usage };
}

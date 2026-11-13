import { Injectable } from '@nestjs/common';
import type {
  AiCategoryConfiguration,
  AiTokenUsage,
} from '@telegram-system/shared';
import { AiDeploymentConfig } from './ai-deployment-config.service';
import { AiModelRegistry } from './ai-model-registry';
import { aiRecord, parseUsage } from './ai-pricing';

export type AiProviderOutcome = {
  result?: unknown;
  usage: AiTokenUsage | null;
  errorCategory: string | null;
  generationStarted: boolean;
  providerModel: string | null;
  providerRequestId: string | null;
};
const safeIdentifier = (value: unknown, max: number) =>
  typeof value === 'string' &&
  /^[A-Za-z0-9_.:-]+$/.test(value) &&
  value.length <= max
    ? value
    : null;

/** Bounded Responses transport. No retries, startup discovery or product imports. */
@Injectable()
export class AiProvider {
  constructor(
    private readonly deployment: AiDeploymentConfig,
    private readonly registry: AiModelRegistry,
  ) {}
  async execute(
    input: string,
    config: AiCategoryConfiguration,
    callerSignal?: AbortSignal,
    instructions?: string,
    image?: { mime: 'image/jpeg'; data: Buffer },
  ): Promise<AiProviderOutcome> {
    let generationStarted = false;
    const controller = new AbortController();
    const abort = () => controller.abort();
    callerSignal?.addEventListener('abort', abort, { once: true });
    if (callerSignal?.aborted) controller.abort();
    const timer = setTimeout(abort, config.timeoutMs);
    const empty = (errorCategory: string): AiProviderOutcome => ({
      usage: null,
      generationStarted,
      errorCategory,
      providerModel: null,
      providerRequestId: null,
    });
    try {
      if (controller.signal.aborted) return empty('ABORTED');
      if (
        Buffer.byteLength(input, 'utf8') +
          Buffer.byteLength(instructions ?? '', 'utf8') >
        256 * 1024
      )
        return empty('INPUT_TOO_LARGE');
      if (
        image &&
        !(
          (config.category === 'LEAD_AD_CLASSIFICATION' &&
            config.modelId === 'gpt-5.4-mini-2026-03-17') ||
          config.category === 'TELEGRAM_POSTING_IMAGE'
        )
      )
        return empty('VISION_MODEL_UNSUPPORTED');
      if (config.category === 'TELEGRAM_POSTING_IMAGE') {
        generationStarted = true;
        const suffix = image ? '/images/edits' : '/images/generations';
        const body = image
          ? this.imageEditBody(input, config.modelId, image)
          : {
              model: config.modelId,
              prompt: input,
              n: 1,
              size: '1024x1024',
              quality: 'medium',
              output_format: 'jpeg',
            };
        const response = await this.post(
          suffix,
          body,
          controller.signal,
          20 * 1024 * 1024,
        );
        const usage = parseUsage(response.body.usage);
        const items = Array.isArray(response.body.data)
          ? response.body.data
          : [];
        const encoded = aiRecord(items[0]).b64_json;
        const metadata = {
          usage,
          generationStarted,
          providerModel: config.modelId,
          providerRequestId: response.requestId,
        };
        if (!response.ok)
          return {
            ...metadata,
            errorCategory: `PROVIDER_${this.failure(response.status)}`,
          };
        if (
          typeof encoded !== 'string' ||
          encoded.length > 18 * 1024 * 1024 ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            encoded,
          )
        )
          return { ...metadata, errorCategory: 'IMAGE_OUTPUT_INVALID' };
        return {
          ...metadata,
          result: { imageBase64: encoded, contentType: 'image/jpeg' },
          errorCategory: null,
        };
      }
      const schema = this.registry.schema(config.category, Boolean(image));
      const payload = {
        model: config.modelId,
        input: image
          ? [
              {
                role: 'user',
                content: [
                  { type: 'input_text', text: input },
                  {
                    type: 'input_image',
                    image_url: `data:${image.mime};base64,${image.data.toString('base64')}`,
                    detail: 'high',
                  },
                ],
              },
            ]
          : input,
        ...(instructions ? { instructions } : {}),
        store: false,
        background: false,
        service_tier: 'default',
        tools: [],
        truncation: 'disabled',
        reasoning: { effort: 'none' },
        text: {
          format: {
            type: 'json_schema',
            name: schema.id,
            strict: true,
            schema: schema.jsonSchema,
          },
        },
        max_output_tokens: config.maxOutputTokens,
      };
      const counted = await this.post(
        '/input_tokens',
        {
          model: payload.model,
          input: payload.input,
          ...(instructions ? { instructions } : {}),
          tools: payload.tools,
          text: payload.text,
          reasoning: payload.reasoning,
          truncation: payload.truncation,
        },
        controller.signal,
      );
      if (!counted.ok)
        return empty(`TOKEN_COUNT_${this.failure(counted.status)}`);
      if (
        typeof counted.body.input_tokens !== 'number' ||
        !Number.isSafeInteger(counted.body.input_tokens) ||
        counted.body.input_tokens < 0
      )
        return empty('TOKEN_COUNT_INVALID');
      if (counted.body.input_tokens > config.maxInputTokens)
        return empty('INPUT_TOKEN_LIMIT');
      if (controller.signal.aborted) return empty('ABORTED');
      generationStarted = true;
      const response = await this.post('', payload, controller.signal);
      const usage = parseUsage(response.body.usage);
      const metadata = {
        usage,
        generationStarted,
        providerModel: safeIdentifier(response.body.model, 100),
        providerRequestId: response.requestId,
      };
      if (!response.ok)
        return {
          ...metadata,
          errorCategory: `PROVIDER_${this.failure(response.status)}`,
        };
      if (response.body.status !== 'completed')
        return { ...metadata, errorCategory: 'PROVIDER_INCOMPLETE' };
      const output = response.body.output;
      const content = Array.isArray(output)
        ? output.flatMap((entry: unknown) => {
            const value = aiRecord(entry).content;
            return Array.isArray(value) ? (value as unknown[]) : [];
          })
        : [];
      const texts = content.filter(
        (part: unknown) =>
          aiRecord(part).type === 'output_text' &&
          typeof aiRecord(part).text === 'string',
      );
      if (texts.length !== 1)
        return { ...metadata, errorCategory: 'OUTPUT_INVALID' };
      let result: unknown;
      try {
        result = JSON.parse(aiRecord(texts[0]).text as string) as unknown;
      } catch {
        return { ...metadata, errorCategory: 'OUTPUT_INVALID_JSON' };
      }
      if (!this.registry.validate(config.category, result, Boolean(image)))
        return { ...metadata, errorCategory: 'OUTPUT_SCHEMA_INVALID' };
      return { ...metadata, result, errorCategory: null };
    } catch {
      return empty(
        controller.signal.aborted
          ? callerSignal?.aborted
            ? 'ABORTED'
            : 'TIMEOUT'
          : 'PROVIDER_TRANSPORT',
      );
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', abort);
    }
  }
  private failure(status: number) {
    if (status === 401 || status === 403) return 'AUTHENTICATION_FAILED';
    if (status === 429) return 'RATE_LIMITED';
    if (status === 400 || status === 422) return 'REQUEST_INVALID';
    if (status === 404) return 'MODEL_UNAVAILABLE';
    return 'UNAVAILABLE';
  }
  private imageEditBody(
    prompt: string,
    model: string,
    image: { mime: 'image/jpeg'; data: Buffer },
  ) {
    const form = new FormData();
    form.set('model', model);
    form.set('prompt', prompt);
    form.set('n', '1');
    form.set('size', '1024x1024');
    form.set('quality', 'medium');
    form.set('output_format', 'jpeg');
    form.set(
      'image',
      new Blob([new Uint8Array(image.data)], { type: image.mime }),
      'reference.jpg',
    );
    return form;
  }
  private async post(
    suffix: string,
    body: unknown,
    signal: AbortSignal,
    maxBytes = 512 * 1024,
  ) {
    const response = await fetch(
      `https://api.openai.com/v1${suffix === '' ? '/responses' : suffix === '/input_tokens' ? `/responses${suffix}` : suffix}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.deployment.key()}`,
          ...(body instanceof FormData
            ? {}
            : { 'Content-Type': 'application/json' }),
        },
        body: body instanceof FormData ? body : JSON.stringify(body),
        signal,
      },
    );
    if (Number(response.headers.get('content-length') ?? 0) > maxBytes) {
      await response.body?.cancel();
      throw new Error('RESPONSE_TOO_LARGE');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('RESPONSE_EMPTY');
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) throw new Error('RESPONSE_TOO_LARGE');
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = aiRecord(
        JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
      );
    } catch {
      throw new Error('RESPONSE_INVALID');
    }
    return {
      ok: response.ok,
      status: response.status,
      body: parsed,
      requestId: safeIdentifier(response.headers.get('x-request-id'), 200),
    };
  }
}

import { AiDeploymentConfig } from './ai-deployment-config.service';
import { AiModelRegistry } from './ai-model-registry';
import { AiProvider } from './ai-provider';

describe('AiProvider image generation', () => {
  const registry = new AiModelRegistry();
  const provider = new AiProvider(
    { key: () => 'test-key' } as AiDeploymentConfig,
    registry,
  );
  afterEach(() => jest.restoreAllMocks());

  it('keeps image and text model choices isolated by AI category', () => {
    expect(
      registry.supports('TELEGRAM_POSTING_IMAGE', 'gpt-image-2.5-flare'),
    ).toBe(true);
    expect(
      registry.supports('TELEGRAM_POSTING_TEXT', 'gpt-image-2.5-flare'),
    ).toBe(false);
    expect(
      registry.supports('TELEGRAM_POSTING_IMAGE', 'gpt-5.4-mini-2026-03-17'),
    ).toBe(false);
  });

  it('returns generated image bytes and token usage through the OpenAI image route', async () => {
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from('image-bytes').toString('base64') }],
          usage: {
            input_tokens: 4,
            output_tokens: 40,
            total_tokens: 44,
            input_tokens_details: { text_tokens: 4, image_tokens: 0 },
            output_tokens_details: { image_tokens: 40 },
          },
        }),
        { status: 200, headers: { 'x-request-id': 'req-image-1' } },
      ),
    );
    const outcome = await provider.execute(
      'Draw an editorial illustration',
      registry.category('TELEGRAM_POSTING_IMAGE'),
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/images/generations',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(outcome).toMatchObject({
      generationStarted: true,
      errorCategory: null,
      providerModel: 'gpt-image-2.5-flare',
      usage: { inputTokens: 4, outputTokens: 40 },
      result: { contentType: 'image/jpeg' },
    });
    expect((outcome.result as { imageBase64: string }).imageBase64).toBe(
      Buffer.from('image-bytes').toString('base64'),
    );
  });

  it('rejects an invalid image payload instead of returning it to a post', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: 'not base64!' }] }), {
        status: 200,
      }),
    );
    const outcome = await provider.execute(
      'Draw an image',
      registry.category('TELEGRAM_POSTING_IMAGE'),
    );
    expect(outcome.errorCategory).toBe('IMAGE_OUTPUT_INVALID');
    expect(outcome.result).toBeUndefined();
  });
});

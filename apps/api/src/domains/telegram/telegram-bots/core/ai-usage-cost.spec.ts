import { priceAiUsage } from './ai-usage-cost';

describe('priceAiUsage', () => {
  it('prices regular, cached, and output tokens with the persisted catalog snapshot', () => {
    expect(priceAiUsage('gpt-5-mini', { inputTokens: 1_000_000, cachedInputTokens: 200_000, outputTokens: 100_000 })).toMatchObject({ estimatedCostMicros: 405_000, inputPriceMicrosPerMillion: 250_000, cachedInputPriceMicrosPerMillion: 25_000, outputPriceMicrosPerMillion: 2_000_000, pricingVersion: 'openai-2026-08-22' });
  });

  it('uses audio token rates for transcription and marks unknown models unpriced', () => {
    expect(priceAiUsage('gpt-4o-mini-transcribe', { inputAudioTokens: 1_000, outputAudioTokens: 10 })).toMatchObject({ estimatedCostMicros: 1_300 });
    expect(priceAiUsage('future-model', { inputTokens: 100 })).toMatchObject({ estimatedCostMicros: null, pricingVersion: null });
  });
});

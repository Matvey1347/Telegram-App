export const AI_MODEL_POLICY = {
  FINANCE_EXTRACTION: 'gpt-5-mini',
  VOICE_TRANSCRIPTION: 'gpt-4o-mini-transcribe',
} as const;

const PRICING_VERSION = 'openai-2026-08-22';
const prices: Record<string, { input: number; cached: number; output: number }> = {
  'gpt-5-mini': { input: 250_000, cached: 25_000, output: 2_000_000 },
  'gpt-4o-mini-transcribe': { input: 1_250_000, cached: 0, output: 5_000_000 },
};

export type AiTokenUsage = {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  inputAudioTokens?: number;
  outputAudioTokens?: number;
};

export function priceAiUsage(model: string, usage: AiTokenUsage) {
  const price = prices[model];
  if (!price) return { ...usage, pricingVersion: null, estimatedCostMicros: null, inputPriceMicrosPerMillion: null, cachedInputPriceMicrosPerMillion: null, outputPriceMicrosPerMillion: null };
  const cached = Math.min(usage.cachedInputTokens || 0, usage.inputTokens || 0);
  const regularInput = Math.max(0, (usage.inputTokens || 0) - cached);
  const billableInput = usage.inputAudioTokens ?? regularInput;
  const billableOutput = usage.outputAudioTokens ?? (usage.outputTokens || 0);
  const estimatedCostMicros = Math.round((billableInput * price.input + cached * price.cached + billableOutput * price.output) / 1_000_000);
  return { ...usage, pricingVersion: PRICING_VERSION, estimatedCostMicros, inputPriceMicrosPerMillion: price.input, cachedInputPriceMicrosPerMillion: price.cached, outputPriceMicrosPerMillion: price.output };
}

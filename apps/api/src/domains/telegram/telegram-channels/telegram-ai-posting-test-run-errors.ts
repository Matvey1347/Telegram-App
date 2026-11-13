import { BadGatewayException } from '@nestjs/common';

type RunOperation = {
  operationId: string;
  [key: string]: unknown;
};
type ParsedAiResponse = {
  title?: unknown;
  text?: unknown;
  imagePrompt?: unknown;
  approved?: unknown;
  reasons?: unknown;
  [key: string]: unknown;
};

export function telegramAiPostingOperationFromError<T extends RunOperation>(
  error: unknown,
): T | null {
  if (!(error instanceof BadGatewayException)) return null;
  const response = error.getResponse();
  if (!response || typeof response !== 'object' || !('operation' in response))
    return null;
  const operation = (response as { operation?: RunOperation }).operation;
  return operation && typeof operation.operationId === 'string'
    ? (operation as T)
    : null;
}

export function parseTelegramAiPostingJson(
  value: string,
): ParsedAiResponse | null {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const parsed: unknown = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as ParsedAiResponse)
      : null;
  } catch {
    return null;
  }
}

export function telegramAiPostingTestRunErrorCode(error: unknown): string {
  if (error instanceof BadGatewayException) {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object') {
      const value = response as { code?: unknown; message?: unknown };
      if (typeof value.code === 'string') return value.code;
      if (typeof value.message === 'string') return value.message;
    }
  }
  return 'AI_POSTING_GENERATION_FAILED';
}

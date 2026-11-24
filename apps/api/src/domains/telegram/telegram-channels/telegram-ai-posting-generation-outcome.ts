import { BadGatewayException, HttpException } from '@nestjs/common';
import type { TelegramAiPostingOperationContext } from '@telegram-system/shared';
import { Prisma } from '@prisma/client';
import type { TelegramAiPostingSourceService } from './telegram-ai-posting-source.service';

import { MAX_TELEGRAM_AI_POSTING_BATCH_SIZE } from '@telegram-system/shared';

export type TelegramAiPostingRunOperation = TelegramAiPostingOperationContext & {
  stage: string;
  publicationIndex?: number;
  attempt: number;
  operationId: string;
  category: string;
  model: string;
  status: string;
  actualCost: string | null;
  pricingStatus: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export function telegramAiPostingSourceDiagnosticsFromError(error: unknown) {
  return error &&
    typeof error === 'object' &&
    'sourceDiagnostics' in error &&
    Array.isArray((error as { sourceDiagnostics?: unknown }).sourceDiagnostics)
    ? (
        error as {
          sourceDiagnostics: Awaited<
            ReturnType<TelegramAiPostingSourceService['collect']>
          >['sourceDiagnostics'];
        }
      ).sourceDiagnostics
    : [];
}

export function telegramAiPostingRunCosts(
  operations: TelegramAiPostingRunOperation[],
) {
  const sum = (stage: string): Prisma.Decimal | null => {
    const matching = operations.filter((op) => op.stage === stage);
    if (
      matching.some(
        (op) => op.actualCost === null && op.pricingStatus !== 'NOT_SENT',
      )
    )
      return null;
    return matching.reduce(
      (total, op) =>
        total.add(op.actualCost ?? (op.pricingStatus === 'NOT_SENT' ? 0 : 0)),
      new Prisma.Decimal(0),
    );
  };
  return {
    planning: sum('planning'),
    text: sum('text'),
    image: sum('image'),
    review: sum('review'),
  };
}
export function telegramAiPostingGenerationErrorCode(error: unknown) {
  let candidate = 'AI_POSTING_GENERATION_FAILED';
  if (error instanceof HttpException) {
    const response = error.getResponse();
    candidate =
      typeof response === 'string'
        ? response
        : ((response as any).code ??
          (response as any).message ??
          'AI_POSTING_GENERATION_FAILED');
  }
  if (typeof candidate === 'string' && /^[A-Z0-9_]{1,100}$/.test(candidate))
    return candidate;
  return 'AI_POSTING_GENERATION_FAILED';
}

export function telegramAiPostingGenerationErrorReasons(
  error: unknown,
): string[] {
  if (!(error instanceof BadGatewayException)) return [];
  const response = error.getResponse();
  if (!response || typeof response !== 'object' || !('reasons' in response))
    return [];
  const reasons = (response as { reasons?: unknown }).reasons;
  return Array.isArray(reasons)
    ? reasons
        .filter((reason): reason is string => typeof reason === 'string')
        .slice(0, 8)
    : [];
}

export function telegramAiPostingGenerationFailures(error: unknown) {
  if (error instanceof BadGatewayException) {
    const response = error.getResponse();
    if (response && typeof response === 'object' && 'failures' in response) {
      const failures = (response as { failures?: unknown }).failures;
      if (Array.isArray(failures))
        return failures
          .filter(
            (failure): failure is Record<string, unknown> =>
              Boolean(failure) && typeof failure === 'object',
          )
          .slice(0, MAX_TELEGRAM_AI_POSTING_BATCH_SIZE)
          .map((failure) => ({
            ...(typeof failure.publicationIndex === 'number' &&
              Number.isInteger(failure.publicationIndex) &&
              failure.publicationIndex >= 0 &&
              failure.publicationIndex < MAX_TELEGRAM_AI_POSTING_BATCH_SIZE
              ? { publicationIndex: failure.publicationIndex }
              : {}),
            ...(typeof failure.topic === 'string'
              ? { topic: failure.topic.slice(0, 200) }
              : {}),
            ...(failure.imageMode === 'found' || failure.imageMode === 'ai'
              ? { imageMode: failure.imageMode }
              : {}),
            ...(failure.editorialAssignment && typeof failure.editorialAssignment === 'object' &&
              !Array.isArray(failure.editorialAssignment) ? {
                editorialAssignment: Object.fromEntries(Object.entries(failure.editorialAssignment)
                  .filter(([key, value]) => ['sphereId', 'rubricId', 'lengthId'].includes(key) && typeof value === 'string')),
              } : {}),
            code:
              typeof failure.code === 'string'
                ? failure.code.slice(0, 100)
                : 'AI_POSTING_GENERATION_FAILED',
            ...(Array.isArray(failure.reasons)
              ? {
                  reasons: failure.reasons
                    .filter(
                      (reason): reason is string => typeof reason === 'string',
                    )
                    .slice(0, 8),
                }
              : {}),
          }));
    }
  }
  return [
    {
      code: telegramAiPostingGenerationErrorCode(error),
      message: telegramAiPostingGenerationErrorCode(error),
      ...(telegramAiPostingGenerationErrorReasons(error).length
        ? { reasons: telegramAiPostingGenerationErrorReasons(error) }
        : {}),
    },
  ];
}

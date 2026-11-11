import type { Prisma } from '@prisma/client';
import type { TelegramAiPostingSourceDiagnostic } from './telegram-ai-posting-source.service';

export function decodeAiPostingRunPublications(value: unknown) {
  if (Array.isArray(value))
    return { publications: value as unknown[], sourceDiagnostics: undefined };
  if (value && typeof value === 'object') {
    const stored = value as {
      items?: unknown;
      sourceDiagnostics?: unknown;
    };
    return {
      publications: Array.isArray(stored.items)
        ? (stored.items as unknown[])
        : [],
      sourceDiagnostics: Array.isArray(stored.sourceDiagnostics)
        ? (stored.sourceDiagnostics as TelegramAiPostingSourceDiagnostic[])
        : undefined,
    };
  }
  return { publications: [], sourceDiagnostics: undefined };
}

export function encodeAiPostingRunPublications(
  publications: unknown[],
  sourceDiagnostics?: TelegramAiPostingSourceDiagnostic[],
): Prisma.InputJsonObject {
  return {
    items: publications,
    ...(sourceDiagnostics
      ? {
          sourceDiagnostics,
        }
      : {}),
  } as Prisma.InputJsonObject;
}

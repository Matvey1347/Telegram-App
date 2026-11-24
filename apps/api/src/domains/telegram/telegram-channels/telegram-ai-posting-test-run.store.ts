import { ConflictException } from '@nestjs/common';
import type { TelegramAiPostingImageSearch, TelegramAiPostingOperationContext } from '@telegram-system/shared';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import {
  decodeAiPostingRunPublications,
  encodeAiPostingRunPublications,
} from './telegram-ai-posting-run-data';

export type TelegramAiPostingTestRunOperation = TelegramAiPostingOperationContext & {
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
export type TestPublication = {
  visualDirection?: string;
  publicationIndex?: number;
  topic: string;
  title: string;
  text: string;
  imagePrompt: string;
  imageSearchQuery?: string;
  mediaMode?: 'found' | 'ai' | 'hybrid';
  mediaSearch?: TelegramAiPostingImageSearch;
  mediaPreference?: { id: string; name: string } | null;
  imageUrl: string | null;
  imageFingerprint?: string | null;
  imageVisualFingerprint?: string | null;
  imageOriginalUrl?: string | null;
  imagePreviewUrl?: string | null;
  imageSourceId: string | null;
  mediaReadiness?: 'READY' | 'MISSING' | 'FAILED';
  mediaFailureCode?: string;
  imageCostUnknown?: boolean;
  ownerEdited?: boolean;
  format: string;
  category: string;
  editorialMetadata?: {
    sphere: { id: string; name: string; emoji: string; tier: string } | null;
    rubric: { id: string; name: string; emoji: string } | null;
    length: { id: string; name: string; emoji: string; minCharacters?: number; maxCharacters?: number | null } | null;
  };
  reviewNotes: string[];
  costs: Record<string, string | null>;
  operations: TelegramAiPostingTestRunOperation[];
  ideaSources: unknown[];
  status: string;
  rejectionReason: string | null;
  savedPostId: string | null;
};

export async function writeTelegramAiPostingTestRun(
  prisma: PrismaService,
  id: string,
  workspaceId: string,
  version: number,
  publications: TestPublication[],
  operations: TelegramAiPostingTestRunOperation[],
  status: string,
  sourceDiagnostics: ReturnType<
    typeof decodeAiPostingRunPublications
  >['sourceDiagnostics'],
  failures?: unknown[],
) {
  const cost = (stage: string): Prisma.Decimal | null => {
    const matching = operations.filter(
      (operation) => operation.stage === stage,
    );
    if (
      matching.some(
        (operation) =>
          operation.actualCost === null &&
          operation.pricingStatus !== 'NOT_SENT',
      )
    )
      return null;
    return matching.reduce(
      (total, operation) => total.add(operation.actualCost ?? 0),
      new Prisma.Decimal(0),
    );
  };
  const changed = await prisma.telegramAiPostingTestRun.updateMany({
    where: { id, workspaceId, version },
    data: {
      publications: encodeAiPostingRunPublications(
        publications,
        sourceDiagnostics,
      ),
      operations: operations,
      ...(failures ? { failures: failures as Prisma.InputJsonArray } : {}),
      planningCost: cost('planning'),
      textCost: cost('text'),
      imageCost: publications.some((item) => item.imageCostUnknown)
        ? null
        : cost('image'),
      reviewCost: cost('review'),
      status,
      version: { increment: 1 },
    },
  });
  if (!changed.count)
    throw new ConflictException('AI_POSTING_TEST_RUN_CHANGED');
}

export function addKnownCost(
  current: string | null,
  next: string | null,
  pricingStatus: string,
) {
  if (current === null || (next === null && pricingStatus !== 'NOT_SENT'))
    return null;
  return new Prisma.Decimal(current).add(next ?? 0).toString();
}

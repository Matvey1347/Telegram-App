import { PrismaService } from '../../../prisma/prisma.service';
import {
  decodeAiPostingRunPublications,
  encodeAiPostingRunPublications,
} from './telegram-ai-posting-run-data';

export async function markTelegramAiPostingRunForReview(
  prisma: PrismaService,
  workspaceId: string,
  runId: string,
) {
  const testRun = await prisma.telegramAiPostingTestRun.findFirst({
    where: { id: runId, workspaceId },
    select: { publications: true },
  });
  if (!testRun) return false;
  const decoded = decodeAiPostingRunPublications(testRun.publications);
  await prisma.telegramAiPostingTestRun.updateMany({
    where: { id: runId, workspaceId },
    data: {
      publications: encodeAiPostingRunPublications(
        decoded.publications.map((value) =>
          value && typeof value === 'object' && !Array.isArray(value)
            ? { ...(value as Record<string, unknown>), reviewQueue: true }
            : value,
        ),
        decoded.sourceDiagnostics,
      ),
    },
  });
  return true;
}

import type { TelegramLeadCandidate } from '@prisma/client';
import type { LeadCandidateView, LeadContact } from '@telegram-system/shared';
export function leadCandidateSummary(
  row: TelegramLeadCandidate & {
    _count?: { observations: number };
    observations?: Array<{
      source: { id: string; title: string; url: string | null; username?: string | null };
    }>;
  },
  sources?: Array<{ id: string; title: string; url: string | null; username?: string | null }>,
): LeadCandidateView {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    niche: row.niche,
    offerType: row.offerType,
    contacts: row.contacts as unknown as LeadContact[],
    riskStatus: row.riskStatus as LeadCandidateView['riskStatus'],
    risks: row.risks as unknown as string[],
    reviewStatus: row.reviewStatus as LeadCandidateView['reviewStatus'],
    contactId: row.contactId,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    sources: sources ?? [
      ...new Map(
        (row.observations ?? []).map((item) => [item.source.id, item.source]),
      ).values(),
    ],
    observations: [],
    hasMoreObservations: Boolean(
      row._count?.observations ?? row.observations?.length,
    ),
    aliases: [],
    reviewHistory:
      row.reviewHistory as unknown as LeadCandidateView['reviewHistory'],
  };
}

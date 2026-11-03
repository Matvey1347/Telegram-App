import type { LeadRiskStatus, LeadReviewStatus, LeadMonitoringState } from './telegram-lead-discovery';
export type LeadSourceInput = {
  type: 'TELEGRAM_CHANNEL' | 'MANUAL_IMPORT'; reference: string; title?: string; accountId?: string;
  processingReference: string; allowOwnChannel?: boolean;
};
export type LeadSourcePatch = { monitoringState?: LeadMonitoringState; processingReference?: string; accountId?: string | null; allowOwnChannel?: boolean };
export type LeadSourceImportPreview = {
  rows: Array<{ reference: string; normalizedKey: string | null; error: string | null; existingId: string | null }>;
  validCount: number;
};
export type LeadMaterialInput = { externalMessageId: string; text: string; publishedAt: string; messageUrl?: string; deleted?: boolean };
export type LeadIngestResult = { received: number; changed: number; unchanged: number; filtered: number; gap: boolean; historyFenceLost?: boolean; blockedSourceIds?: string[] };
export type LeadCandidateReviewInput = {
  revision: number; action: 'APPROVE' | 'REJECT' | 'LINK' | 'CREATE_CLIENT' | 'MERGE';
  contactId?: string; mergeIntoId?: string; displayName?: string;
  confirmedContactIndexes?: number[]; riskStatus?: LeadRiskStatus;
};
export type LeadCandidateListFilter = { cursor?: string; limit?: number; search?: string; reviewStatus?: LeadReviewStatus; riskStatus?: LeadRiskStatus; sourceId?: string };
export type LeadSourceListFilter = { cursor?: string; limit?: number; search?: string; status?: string };
export type LeadFeedFilter = { cursor?: string; limit?: number; sourceId?: string; classification?: string; reviewStatus?: LeadReviewStatus; riskStatus?: LeadRiskStatus };
export type LeadAnalysisResult = {
  analyzed: number; extracted: number; skipped: number; unknown: number; failed: number;
  failures?: Array<{ observationId: string; stage: 'classification' | 'extraction'; code: string }>;
};

export type LeadSourceImportResult = { created: number; existing: number; errors: Array<{ reference: string; error: string }> };
export type LeadScanResult = LeadIngestResult & { hasMore: boolean; nextBeforeId: number | null };
export type LeadExport = { fileName: string; mimeType: string; contentBase64: string; truncated: boolean };

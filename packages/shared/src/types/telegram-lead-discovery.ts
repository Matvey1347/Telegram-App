import type { LeadPreparationSummary } from './telegram-lead-qualification';
import type { AiOperationView } from './ai-usage';
export const LEAD_SOURCE_TYPES = ['TELEGRAM_CHANNEL', 'MANUAL_IMPORT', 'APPROVED_EXTERNAL_SOURCE'] as const;
export type LeadSourceType = typeof LEAD_SOURCE_TYPES[number];
export type LeadMonitoringState = 'ACTIVE' | 'PAUSED' | 'DISABLED' | 'ACCESS_LOST';
export type LeadSourceStatus = LeadMonitoringState | 'LOW_YIELD' | 'NO_ADS_30D' | 'INSUFFICIENT_COVERAGE';
export const LEAD_AD_CLASSES = ['ADVERTISEMENT', 'MUTUAL_PROMOTION', 'ORGANIC_CONTENT', 'UNKNOWN'] as const;
export type LeadAdClass = typeof LEAD_AD_CLASSES[number];
export type LeadRiskStatus = 'SUSPICIOUS' | 'NEEDS_REVIEW' | 'REJECTED' | 'ACCEPTABLE';
export type LeadReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'MERGED';
export type LeadContact = {
  type: 'TELEGRAM' | 'INSTAGRAM' | 'WEBSITE' | 'PUBLIC_BUSINESS_CONTACT';
  value: string;
  role: 'ADVERTISED_DESTINATION' | 'ADVERTISER' | 'SALES_CONTACT' | 'AGENCY' | 'UNKNOWN';
  evidence: string;
  confirmed?: boolean;
};
export type LeadClassification = {
  classification: LeadAdClass; commercialIntent: boolean; niche: string; offerType: string;
  hasContact: boolean; relevance: 'RELEVANT' | 'POSSIBLE' | 'NOT_RELEVANT' | 'UNKNOWN';
  confidence: number; risks: string[]; evidence: string[];
};
export type LeadExtraction = { projectName: string; productName: string; contacts: LeadContact[]; warnings: string[] };
export type LeadSourceMetrics = {
  observedPosts: number; advertisements: number; uniqueCandidates: number; confirmedContacts: number;
  confirmedLeads: number; qualifiedLeads: number; rejectedCandidates: number; rejectedMaterials: number;
};
export type LeadSourceView = {
  id: string; workspaceId: string; type: LeadSourceType; normalizedKey: string;
  channelId: string | null; username: string | null; title: string; url: string | null;
  accountId: string | null; accessType: string; addedVia: string; processingReference: string;
  allowOwnChannel: boolean; monitoringState: LeadMonitoringState; status: LeadSourceStatus;
  createdAt: string; lastObservedAt: string | null; lastAdAt: string | null;
  coverageFrom: string | null; coverageTo: string | null; coverageState: string;
  lastErrorCode: string | null; metrics: LeadSourceMetrics;
  priority: number | null; priorityStatus: 'RANKED' | 'INSUFFICIENT_DATA';
};
export type LeadObservationView = {
  id: string; sourceId: string; sourceTitle: string; externalMessageId: string;
  messageUrl: string | null; publishedAt: string; observedAt: string; expiresAt: string;
  text: string; links: string[]; contentHash: string; originalStatus: 'OBSERVED' | 'DELETED' | 'ACCESS_LOST' | 'UNKNOWN';
  processingStatus: string; classificationVersion: string | null; classification: LeadClassification | null;
  extraction: LeadExtraction | null; candidateId: string | null; reviewStatus: LeadReviewStatus;
  classificationOperation: AiOperationView | null; extractionOperation: AiOperationView | null;
};
export type LeadCandidateView = {
  preparation?: LeadPreparationSummary;
  id: string; workspaceId: string; title: string; niche: string; offerType: string;
  contacts: LeadContact[]; riskStatus: LeadRiskStatus; risks: string[]; reviewStatus: LeadReviewStatus;
  contactId: string | null; revision: number; createdAt: string; expiresAt: string;
  sources: Array<{ id: string; title: string; url: string | null }>;
  observations: LeadObservationView[]; hasMoreObservations: boolean;
  aliases: Array<{ id: string; title: string; reason: string }>;
  reviewHistory: Array<{ at: string; action: string; actorUserId: string }>;
};
export type LeadPage<T> = { items: T[]; hasMore: boolean; nextCursor: string | null };
export type LeadDiscoveryConfig = {
  enabled: boolean; canManage: boolean; canReview: boolean; canAnalyze: boolean;
  maxSources: number; maxPostsPerDay: number; maxSourceImport: number; maxMaterialBatch: number;
};
export type LeadAccountView = { id: string; label: string; live: boolean };
export type LeadAvailableChannel = { channelId: string; username: string | null; title: string; url: string | null; isOwn: boolean; eligibleForSelection: boolean };

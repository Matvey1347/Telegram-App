import type {
  LeadPreparationView,
  LeadQualificationView,
  LeadCandidateDraftView,
} from "@telegram-system/shared";
export const scorePolicy = {
  version: "review-v1",
  weights: {
    relevance: 25,
    thematicFit: 25,
    confirmedContact: 15,
    commercialOffer: 10,
    evidence: 10,
    freshness: 10,
    repeatedEvidence: 5,
  },
  highRiskPenalty: 40,
  mediumRiskPenalty: 20,
  qualifiedThreshold: 60,
  highPriorityThreshold: 80,
};
export function qualificationFixture(): LeadQualificationView {
  return {
    id: "qualification-1",
    candidateId: "candidate-1",
    operationId: "qualify-op",
    status: "READY",
    contextVersion: "context-1",
    policyVersion: "review-v1",
    createdAt: "2026-11-01T09:00:00Z",
    expiresAt: "2026-11-08T09:00:00Z",
    operation: null,
    output: {
      relevance: "HIGH",
      thematicFit: "HIGH",
      advertiserIdentity: "CONFIRMED",
      evidenceQuality: "STRONG",
      recommendedOffer:
        "Relevant educational channels; ask for a current package quote.",
      reasons: [
        {
          observationId: "observation-1",
          quote: "Public business offer 1",
          reason: "Explicit educational offer",
        },
      ],
      riskSignals: [],
      missingFacts: ["Package quote"],
    },
    score: {
      status: "SCORED",
      relevance: 90,
      evidenceQuality: 85,
      riskLevel: "RISK_LOW",
      overall: 82,
      priority: "HIGH",
      recommendation: "QUALIFIED",
      factors: [
        {
          key: "confirmedContact",
          earned: 15,
          maximum: 15,
          explanation: "A public sales contact was verified.",
        },
      ],
    },
  };
}
export function candidateDraftFixture(): LeadCandidateDraftView {
  return {
    id: "draft-1",
    candidateId: "candidate-1",
    authorUserId: "operator-1",
    operationId: "draft-op",
    category: "SALES_FIRST_DRAFT",
    status: "READY",
    text: "Вітаю! Побачив вашу освітню програму. Можу надіслати деталі пакетного розміщення?",
    tone: "NATURAL",
    language: "uk",
    output: null,
    warnings: [],
    evidenceIds: ["observation-1"],
    contextVersion: "context-1",
    revision: 1,
    approvedAt: null,
    createdAt: "2026-11-01T09:01:00Z",
    expiresAt: "2026-11-08T09:01:00Z",
    operation: null,
    canEdit: true,
    canCopy: false,
  };
}
export function preparationFixture(): LeadPreparationView {
  return {
    candidateId: "candidate-1",
    workflowState: "NEW",
    policy: scorePolicy,
    enabled: true,
    blockedReason: null,
    canQualify: true,
    canGenerateDraft: false,
    canReview: true,
    qualification: null,
    drafts: [],
    products: [],
    riskAcknowledgedAt: null,
    qualificationDecision: null,
  };
}

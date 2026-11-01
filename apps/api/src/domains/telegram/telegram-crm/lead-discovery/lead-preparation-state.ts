import { copilotHash } from '../telegram-crm-copilot-context.service';
import type { TelegramLeadCandidate } from '@prisma/client';
import type {
  LeadQualificationView,
  LeadWorkflowState,
} from '@telegram-system/shared';
export function leadPreparationWorkflow(
  candidate: Pick<
    TelegramLeadCandidate,
    | 'contactId'
    | 'reviewStatus'
    | 'riskStatus'
    | 'qualificationDecision'
    | 'qualificationContextVersion'
    | 'qualificationReviewedAt'
    | 'riskAcknowledgedAt'
  >,
  qualification: LeadQualificationView | null,
): LeadWorkflowState {
  if (
    candidate.reviewStatus === 'REJECTED' ||
    candidate.riskStatus === 'REJECTED'
  )
    return 'REJECTED';
  if (candidate.contactId) return 'LINKED';
  if (
    candidate.riskStatus === 'SUSPICIOUS' ||
    (qualification?.status === 'READY' &&
      qualification?.score?.riskLevel === 'RISK_HIGH')
  )
    return 'SUSPICIOUS';
  if (
    qualification?.status === 'READY' &&
    candidate.qualificationContextVersion === qualification.contextVersion &&
    candidate.reviewStatus === 'APPROVED' &&
    candidate.qualificationReviewedAt !== null &&
    candidate.qualificationReviewedAt >= new Date(qualification.createdAt)
  ) {
    if (candidate.qualificationDecision === 'QUALIFIED') return 'QUALIFIED';
    if (candidate.qualificationDecision === 'LOW_RELEVANCE')
      return 'LOW_RELEVANCE';
  }
  return qualification || candidate.reviewStatus === 'APPROVED'
    ? 'NEEDS_REVIEW'
    : 'NEW';
}

export function leadHumanQualificationFresh(
  candidate: Pick<
    TelegramLeadCandidate,
    | 'qualificationDecision'
    | 'qualificationContextVersion'
    | 'qualificationReviewedAt'
    | 'riskAcknowledgedAt'
    | 'reviewStatus'
    | 'riskStatus'
  >,
  qualification: {
    contextVersion: string;
    createdAt: Date;
    score: unknown;
  } | null,
) {
  if (
    !qualification ||
    candidate.reviewStatus !== 'APPROVED' ||
    candidate.qualificationDecision !== 'QUALIFIED' ||
    candidate.qualificationContextVersion !== qualification.contextVersion ||
    !candidate.qualificationReviewedAt ||
    candidate.qualificationReviewedAt < qualification.createdAt
  )
    return false;
  const score = qualification.score as { riskLevel?: string };
  return (
    !(
      score.riskLevel === 'RISK_HIGH' || candidate.riskStatus === 'SUSPICIOUS'
    ) ||
    Boolean(
      candidate.riskAcknowledgedAt &&
      candidate.riskAcknowledgedAt >= qualification.createdAt,
    )
  );
}

export function leadDraftApprovalHash(
  text: string,
  revision: number,
  contextVersion: string,
  candidate: Pick<
    TelegramLeadCandidate,
    'qualificationDecision' | 'qualificationReviewedAt' | 'riskAcknowledgedAt'
  >,
  qualificationId: string,
) {
  return copilotHash([
    text,
    revision,
    contextVersion,
    qualificationId,
    candidate.qualificationDecision,
    candidate.qualificationReviewedAt,
    candidate.riskAcknowledgedAt,
  ]);
}

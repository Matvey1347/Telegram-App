import { BadRequestException } from '@nestjs/common';
import type { LeadClassification } from '@telegram-system/shared';

const MAX_OPTIONS = 100;
const MAX_SPAN_LENGTH = 180;
export type LeadEvidenceOption = { id: string; text: string };

/** Preserve every source character, split only at Unicode code-point boundaries. */
export function leadClassificationSource(text: string) {
  const characters = Array.from(text);
  const options: LeadEvidenceOption[] = [];
  let cursor = 0;
  while (cursor < characters.length && options.length < MAX_OPTIONS) {
    let span = '';
    while (
      cursor < characters.length &&
      span.length + characters[cursor].length <= MAX_SPAN_LENGTH
    )
      span += characters[cursor++];
    options.push({ id: `e${options.length + 1}`, text: span });
  }
  return { options, truncated: cursor < characters.length };
}

/** Provider IDs never become evidence: only the server's original substrings do. */
export function mapLeadClassificationEvidence(
  output: LeadClassification,
  options: LeadEvidenceOption[],
) {
  const byId = new Map(options.map((option) => [option.id, option.text]));
  if (
    ['ADVERTISEMENT', 'MUTUAL_PROMOTION'].includes(output.classification) &&
    !output.evidence?.length
  )
    throw new BadRequestException('LEAD_CLASSIFICATION_EVIDENCE_REQUIRED');
  if (
    !Array.isArray(output.evidence) ||
    output.evidence.some((id) => !byId.get(id)?.trim())
  )
    throw new BadRequestException('LEAD_CLASSIFICATION_EVIDENCE_ID_INVALID');
  return {
    ...output,
    evidence: [...new Set(output.evidence)].map((id) => byId.get(id)!),
  };
}

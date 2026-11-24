import { HttpException } from '@nestjs/common';

export function classifyAutopilotError(error: unknown) {
  const response = error instanceof HttpException ? error.getResponse() : null;
  const responseCode = response && typeof response === 'object' && 'code' in response
    ? response.code : null;
  const candidate = typeof responseCode === 'string' ? responseCode
    : error instanceof Error ? error.message : '';
  if (/BUDGET|QUOTA|LIMIT/i.test(candidate)) return 'AI_BUDGET_OR_QUOTA';
  if (/AI_GATEWAY|AI_API|AI_AUTOMATIC_DISABLED|AI_DISABLED|AI_CAPACITY_EXHAUSTED|BAD_GATEWAY|TIMEOUT/i.test(candidate))
    return 'AI_API_UNAVAILABLE';
  if (/IMAGE/i.test(candidate)) return 'IMAGE_GENERATION_FAILED';
  if (/GENERATION|TEXT|CAPTION|REVIEW|TOPIC|AI_POSTING_NO_DRAFTS/i.test(candidate))
    return 'GENERATION_FAILED';
  if (/TELEGRAM|PUBLISH/i.test(candidate)) return 'PUBLICATION_FAILED';
  if (/PLANNER|SLOT|SCHEDULE/i.test(candidate)) return 'PLANNING_FAILED';
  return 'AUTOPILOT_STAGE_FAILED';
}

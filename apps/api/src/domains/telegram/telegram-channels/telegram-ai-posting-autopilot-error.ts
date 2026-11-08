export function classifyAutopilotError(error: unknown) {
  const candidate = error instanceof Error ? error.message : '';
  if (/BUDGET|QUOTA|LIMIT/i.test(candidate)) return 'AI_BUDGET_OR_QUOTA';
  if (/AI_GATEWAY|AI_API|BAD_GATEWAY|TIMEOUT/i.test(candidate))
    return 'AI_API_UNAVAILABLE';
  if (/IMAGE/i.test(candidate)) return 'IMAGE_GENERATION_FAILED';
  if (/GENERATION|TEXT|REVIEW|TOPIC|AI_POSTING_NO_DRAFTS/i.test(candidate))
    return 'GENERATION_FAILED';
  if (/TELEGRAM|PUBLISH/i.test(candidate)) return 'PUBLICATION_FAILED';
  if (/PLANNER|SLOT|SCHEDULE/i.test(candidate)) return 'PLANNING_FAILED';
  return 'AUTOPILOT_STAGE_FAILED';
}

import type { TelegramLeadSource } from '@prisma/client';
const IDENTITY_ERRORS = new Set([
  'LEAD_SOURCE_IDENTITY_CHANGED',
  'LEAD_RESOLVED_CHANNEL_NOT_APPROVED',
]);
export function leadIdentityUnverified(
  source: Pick<TelegramLeadSource, 'lastErrorCode'>,
) {
  return IDENTITY_ERRORS.has(source.lastErrorCode ?? '');
}
export function leadReferenceUnavailable(
  source: Pick<TelegramLeadSource, 'monitoringState' | 'lastErrorCode'>,
) {
  return (
    source.monitoringState === 'ACCESS_LOST' || leadIdentityUnverified(source)
  );
}

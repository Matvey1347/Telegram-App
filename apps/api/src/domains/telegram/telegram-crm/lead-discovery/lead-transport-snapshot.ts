import type { TelegramLeadSource } from '@prisma/client';
export type LeadTransportSnapshot = Pick<
  TelegramLeadSource,
  'accountId' | 'channelId' | 'processingReference' | 'monitoringActorUserId'
> & { sourceVersion?: string };
export function leadTransportSnapshot(
  source: LeadTransportSnapshot & { updatedAt?: Date },
  withVersion = false,
): LeadTransportSnapshot {
  return {
    accountId: source.accountId,
    channelId: source.channelId,
    processingReference: source.processingReference,
    monitoringActorUserId: source.monitoringActorUserId,
    ...(withVersion && source.updatedAt
      ? { sourceVersion: source.updatedAt.toISOString() }
      : {}),
  };
}
export function leadTransportMatches(
  source: (LeadTransportSnapshot & { updatedAt?: Date }) | undefined,
  expected?: LeadTransportSnapshot,
) {
  return (
    !expected ||
    Boolean(
      source &&
      source.accountId === expected.accountId &&
      source.channelId === expected.channelId &&
      source.processingReference === expected.processingReference &&
      source.monitoringActorUserId === expected.monitoringActorUserId &&
      (!expected.sourceVersion ||
        source.updatedAt?.toISOString() === expected.sourceVersion),
    )
  );
}

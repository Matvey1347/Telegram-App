import {
  Prisma,
  TelegramAdSaleStatus,
  TelegramAdvertiserLifecycleStage,
  TelegramAdvertiserStatus,
  TelegramCrmContactStage,
} from '@prisma/client';

const LEGACY_ACTIVE_DEAL_STATUSES = [
  TelegramAdSaleStatus.RESERVED,
  TelegramAdSaleStatus.CONFIRMED,
  TelegramAdSaleStatus.IN_PROGRESS,
];

export function legacyAdvertiserStatus(
  stage: TelegramCrmContactStage,
  hasActiveDeal = false,
): TelegramAdvertiserStatus {
  if (stage === TelegramCrmContactStage.ANOTHER)
    return TelegramAdvertiserStatus.INACTIVE;
  if (stage === TelegramCrmContactStage.LOST)
    return TelegramAdvertiserStatus.LOST;
  if (hasActiveDeal) return TelegramAdvertiserStatus.ACTIVE;
  return TelegramAdvertiserStatus.LEAD;
}

export function legacyAdvertiserLifecycleStage(
  stage: TelegramCrmContactStage,
): TelegramAdvertiserLifecycleStage {
  switch (stage) {
    case TelegramCrmContactStage.CUSTOMER:
      return TelegramAdvertiserLifecycleStage.CUSTOMER;
    case TelegramCrmContactStage.LOST:
      return TelegramAdvertiserLifecycleStage.CHURNED;
    case TelegramCrmContactStage.ANOTHER:
      return TelegramAdvertiserLifecycleStage.NEW;
    case TelegramCrmContactStage.LEAD:
      return TelegramAdvertiserLifecycleStage.CONTACTED;
    default:
      return TelegramAdvertiserLifecycleStage.NEW;
  }
}

export function stageFromLegacyAdvertiser(input: {
  status?: TelegramAdvertiserStatus;
  lifecycleStage?: TelegramAdvertiserLifecycleStage;
}): TelegramCrmContactStage | undefined {
  if (input.status === TelegramAdvertiserStatus.ARCHIVED)
    return TelegramCrmContactStage.ANOTHER;
  if (
    input.status === TelegramAdvertiserStatus.LOST ||
    input.status === TelegramAdvertiserStatus.BLOCKED ||
    input.lifecycleStage === TelegramAdvertiserLifecycleStage.CHURNED
  ) {
    return TelegramCrmContactStage.LOST;
  }
  if (
    input.lifecycleStage === TelegramAdvertiserLifecycleStage.CUSTOMER ||
    input.lifecycleStage === TelegramAdvertiserLifecycleStage.REPEAT_CUSTOMER
  ) {
    return TelegramCrmContactStage.CUSTOMER;
  }
  if (input.lifecycleStage === TelegramAdvertiserLifecycleStage.QUALIFIED)
    return TelegramCrmContactStage.LEAD;
  if (
    input.lifecycleStage === TelegramAdvertiserLifecycleStage.REACTIVATION ||
    input.status === TelegramAdvertiserStatus.INACTIVE
  ) {
    return TelegramCrmContactStage.LEAD;
  }
  if (
    input.lifecycleStage === TelegramAdvertiserLifecycleStage.CONTACTED ||
    input.status === TelegramAdvertiserStatus.ACTIVE
  ) {
    return TelegramCrmContactStage.LEAD;
  }
  if (
    input.lifecycleStage === TelegramAdvertiserLifecycleStage.NEW ||
    input.status === TelegramAdvertiserStatus.LEAD
  ) {
    return TelegramCrmContactStage.NEW;
  }
  return undefined;
}

export function legacyAdvertiserFilter(input: {
  status?: TelegramAdvertiserStatus;
  lifecycleStage?: TelegramAdvertiserLifecycleStage;
}): Prisma.TelegramAdvertiserWhereInput {
  const conditions: Prisma.TelegramAdvertiserWhereInput[] = [];
  const lifecycleStage = input.lifecycleStage
    ? stageFromLegacyAdvertiser({ lifecycleStage: input.lifecycleStage })
    : undefined;
  if (lifecycleStage) conditions.push({ stage: lifecycleStage });
  switch (input.status) {
    case TelegramAdvertiserStatus.ACTIVE:
      conditions.push({
        stage: {
          notIn: [
            TelegramCrmContactStage.LOST,
            TelegramCrmContactStage.ANOTHER,
          ],
        },
        sales: { some: { status: { in: LEGACY_ACTIVE_DEAL_STATUSES } } },
      });
      break;
    case TelegramAdvertiserStatus.INACTIVE:
      conditions.push({ stage: TelegramCrmContactStage.LEAD });
      break;
    case TelegramAdvertiserStatus.LOST:
    case TelegramAdvertiserStatus.BLOCKED:
      conditions.push({ stage: TelegramCrmContactStage.LOST });
      break;
    case TelegramAdvertiserStatus.ARCHIVED:
      conditions.push({ stage: TelegramCrmContactStage.ANOTHER });
      break;
    case TelegramAdvertiserStatus.LEAD:
      conditions.push({
        stage: {
          in: [
            TelegramCrmContactStage.NEW,
            TelegramCrmContactStage.LEAD,
            TelegramCrmContactStage.CUSTOMER,
          ],
        },
        sales: { none: { status: { in: LEGACY_ACTIVE_DEAL_STATUSES } } },
      });
      break;
  }
  return conditions.length ? { AND: conditions } : {};
}

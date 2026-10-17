import { ConflictException } from '@nestjs/common';

type Status = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

export function assertFinanceSavingsMovementStatus(
  kind: 'ALLOCATE' | 'RELEASE',
  status: Status,
) {
  const allowed =
    kind === 'ALLOCATE'
      ? status === 'ACTIVE'
      : status === 'ACTIVE' || status === 'COMPLETED';
  if (!allowed)
    throw new ConflictException(
      kind === 'ALLOCATE'
        ? 'Only active savings goals accept allocations'
        : 'Archived savings goals cannot release allocations',
    );
}

export function assertFinanceSavingsReallocationStatus(
  source: Status,
  destination: Status,
) {
  if (destination !== 'ACTIVE')
    throw new ConflictException('Reallocation destination must be active');
  if (source === 'ARCHIVED')
    throw new ConflictException(
      'Archived savings goals cannot release allocations',
    );
}

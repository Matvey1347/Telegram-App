import { ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalized(item)]),
    );
  return value;
}

export function financeRequestFingerprint(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(normalized(value)))
    .digest('hex');
}

export function assertFinanceIdempotency(
  storedFingerprint: string,
  requestFingerprint: string,
) {
  if (storedFingerprint !== requestFingerprint)
    throw new ConflictException(
      'Idempotency key was already used for a different request',
    );
}

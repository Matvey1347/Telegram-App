import { ConflictException } from '@nestjs/common';
import {
  assertFinanceIdempotency,
  financeRequestFingerprint,
} from './finance-asset-idempotency';

describe('finance asset idempotency', () => {
  it('uses a stable key-order-independent request fingerprint', () => {
    expect(financeRequestFingerprint({ amount: '10', accountId: 'a' })).toBe(
      financeRequestFingerprint({ accountId: 'a', amount: '10' }),
    );
  });

  it('rejects reuse of a key for a different request', () => {
    expect(() => assertFinanceIdempotency('stored', 'different')).toThrow(
      ConflictException,
    );
  });
});

import {
  assertFinanceSavingsMovementStatus,
  assertFinanceSavingsReallocationStatus,
} from './finance-savings-rules';

describe('finance savings movement rules', () => {
  it('allows completed goals to release and reallocate out before archive', () => {
    expect(() =>
      assertFinanceSavingsMovementStatus('RELEASE', 'COMPLETED'),
    ).not.toThrow();
    expect(() =>
      assertFinanceSavingsReallocationStatus('COMPLETED', 'ACTIVE'),
    ).not.toThrow();
  });

  it('does not allow new allocation into a completed goal', () => {
    expect(() =>
      assertFinanceSavingsMovementStatus('ALLOCATE', 'COMPLETED'),
    ).toThrow();
    expect(() =>
      assertFinanceSavingsReallocationStatus('ACTIVE', 'COMPLETED'),
    ).toThrow();
  });
});

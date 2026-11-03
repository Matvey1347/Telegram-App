import {
  isLeadManualRecovery,
  leadRecoverySources,
  leadRecoverySourceAllowed,
} from './lead-recovery-mode';
describe('lead recovery mode', () => {
  it.each([undefined, '', 'normal'])(
    'retains ordinary recovery for %s',
    (value) => {
      expect(isLeadManualRecovery({ get: () => value } as never)).toBe(false);
    },
  );
  it('disables automatic recovery only in explicit manual mode', () => {
    expect(isLeadManualRecovery({ get: () => 'manual' } as never)).toBe(true);
  });
  it('fails closed on a misspelled mode', () => {
    expect(() =>
      isLeadManualRecovery({ get: () => 'Manual' } as never),
    ).toThrow('LEAD_RECOVERY_MODE_INVALID');
  });
  it('prevents a local process from draining a remote database', () => {
    const config = {
      get: (key: string) =>
        key === 'DATABASE_URL' ? 'postgresql://example.org/db' : undefined,
    };
    expect(isLeadManualRecovery(config as never)).toBe(true);
    const railway = {
      get: (key: string) =>
        key === 'DATABASE_URL'
          ? 'postgresql://example.org/db'
          : key === 'RAILWAY_ENVIRONMENT_ID'
            ? 'production'
            : undefined,
    };
    expect(isLeadManualRecovery(railway as never)).toBe(false);
  });
  it('limits automatic recovery to explicitly configured source ids', () => {
    const config = {
      get: (key: string) =>
        key === 'INTERNAL_LEAD_DISCOVERY_SOURCE_ALLOWLIST'
          ? 'source-a,source-b'
          : undefined,
    };
    expect(leadRecoverySources(config as never)).toEqual([
      'source-a',
      'source-b',
    ]);
    expect(leadRecoverySourceAllowed(config as never, 'source-a')).toBe(true);
    expect(leadRecoverySourceAllowed(config as never, 'source-c')).toBe(false);
    expect(() => leadRecoverySources({ get: () => '' } as never)).toThrow(
      'LEAD_SOURCE_ALLOWLIST_INVALID',
    );
  });
});

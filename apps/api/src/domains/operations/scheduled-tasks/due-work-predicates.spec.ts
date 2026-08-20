/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  adDeletionReadyWhere,
  greeterAutomationDueWhere,
  greeterBroadcastDispatchableWhere,
  managedPostIdentityReadyWhere,
} from './due-work-predicates';

const now = new Date('2026-08-18T08:00:00.000Z');

describe('due-work predicate parity', () => {
  it('does not treat every published unverified managed post as repair work', () => {
    expect(managedPostIdentityReadyWhere(now)).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({
            status: 'PUBLISHED',
            lastTelegramSyncNote:
              'Published Telegram identity verified; dependent scheduled-link repair pending.',
          }),
        ]),
      }),
    );
  });

  it('dispatches processing broadcasts only for materialization or retryable pending recipients', () => {
    expect(greeterBroadcastDispatchableWhere(now)).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({
            status: 'PROCESSING',
            OR: expect.arrayContaining([
              { recipients: { none: {} } },
              expect.objectContaining({ recipients: expect.any(Object) }),
            ]),
          }),
        ]),
      }),
    );
  });

  it('does not keep terminal broadcasts due', () => {
    const predicate = greeterBroadcastDispatchableWhere(now);
    const serialized = JSON.stringify(predicate);

    expect(serialized).toContain('SCHEDULED');
    expect(serialized).toContain('PROCESSING');
    expect(serialized).not.toContain('COMPLETED');
    expect(serialized).not.toContain('FAILED');
    expect(serialized).not.toContain('CANCELLED');
  });

  it('requires automation repair work to be due', () => {
    expect(greeterAutomationDueWhere(now)).toEqual({
      status: 'PENDING',
      dueAt: { lte: now },
    });
  });

  it('excludes ad deletions until their persisted retry backoff expires', () => {
    expect(adDeletionReadyWhere(now)).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          { lastDeletionAttemptAt: null },
          expect.objectContaining({
            lastDeletionAttemptAt: expect.any(Object),
          }),
        ]),
      }),
    );
  });

  it('does not keep terminal ad placements due', () => {
    const serialized = JSON.stringify(adDeletionReadyWhere(now));

    expect(serialized).toContain('PUBLISHED');
    expect(serialized).not.toContain('COMPLETED');
    expect(serialized).not.toContain('CANCELLED');
  });
});

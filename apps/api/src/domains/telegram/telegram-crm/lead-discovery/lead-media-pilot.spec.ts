/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import {
  runMediaPilot,
  type PilotPorts,
  type PilotPost,
  type PilotResult,
} from './lead-media-pilot';

const post = (overrides: Partial<PilotPost> = {}): PilotPost => ({
  workspaceId: 'workspace',
  sourceId: 'source',
  observationId: 'observation',
  messageId: 1,
  bindingRevision: 1,
  contentHash: 'hash',
  caption: 'Реклама @verified_target',
  textEntitiesComplete: true,
  ...overrides,
});

function harness() {
  const ledger = new Map<string, PilotResult | 'RUNNING' | 'UNKNOWN'>();
  const candidates = new Set<string>();
  const ports: PilotPorts = {
    authorize: jest.fn(async () => {}),
    readMedia: jest.fn(async () => ({
      data: Buffer.from([0xff, 0xd8, 0xff, 0]),
      mime: 'image/jpeg',
    })),
    analyze: jest.fn(async () => ({
      classification: 'ADVERTISEMENT' as const,
      projectName: 'Image project',
      contacts: ['@image_project'],
      evidence: 'Advertising offer',
      confidence: 0.95,
    })),
    reserve: jest.fn(async (key) => {
      const existing = ledger.get(key);
      if (existing && typeof existing === 'object')
        return { state: 'COMPLETE' as const, result: existing };
      if (existing) return { state: 'BLOCKED' as const };
      ledger.set(key, 'RUNNING');
      return { state: 'NEW' as const };
    }),
    complete: jest.fn(async (key, result) => {
      ledger.set(key, result);
    }),
    uncertain: jest.fn(async (key) => {
      ledger.set(key, 'UNKNOWN');
    }),
    cancelBeforeDispatch: jest.fn(async (key) => {
      ledger.delete(key);
    }),
    upsertReviewCandidate: jest.fn(async (key) => {
      candidates.add(key);
    }),
  };
  return { ports, ledger, candidates };
}

describe('bounded media pilot with controlled adapters', () => {
  it('creates a provisional candidate and replays the result without another provider call', async () => {
    const h = harness();
    expect(
      (await runMediaPilot([post()], h.ports, 2000)).results[0].decision,
    ).toBe('REVIEW_CANDIDATE');
    await runMediaPilot([post()], h.ports, 2000);
    expect(h.ports.analyze).toHaveBeenCalledTimes(1);
    expect(h.ports.readMedia).toHaveBeenCalledTimes(1);
    expect(h.candidates.size).toBe(1);
  });
  it('never creates a candidate from uncertain OCR', async () => {
    const h = harness();
    (h.ports.analyze as jest.Mock).mockResolvedValue({
      classification: 'ADVERTISEMENT',
      projectName: 'Maybe',
      contacts: ['@x'],
      evidence: 'unclear text',
      confidence: 0.2,
    });
    const r = await runMediaPilot(
      [post(), post({ observationId: 'b', caption: 'ordinary post' })],
      h.ports,
      2000,
    );
    expect(r.results.map((x) => x.decision)).toEqual([
      'NEEDS_MEDIA_REVIEW',
      'NEEDS_MEDIA_REVIEW',
    ]);
    expect(h.candidates.size).toBe(0);
  });
  it('extracts a literal caption contact using the shared validator', async () => {
    const h = harness();
    const result = await runMediaPilot(
      [post({ caption: 'Реклама @verified_target, пишите @contact_user' })],
      h.ports,
      2000,
    );
    expect(result.results[0].contacts).toEqual([
      expect.objectContaining({
        value: '@contact_user',
        type: 'TELEGRAM',
        role: 'SALES_CONTACT',
      }),
    ]);
  });
  it('stops missing entities before media or provider and rejects unsupported bytes', async () => {
    const h = harness();
    expect(
      (
        await runMediaPilot(
          [post({ textEntitiesComplete: false })],
          h.ports,
          2000,
        )
      ).results[0].decision,
    ).toBe('NEEDS_METADATA');
    (h.ports.readMedia as jest.Mock).mockResolvedValue({
      data: Buffer.from('not an image'),
      mime: 'image/jpeg',
    });
    await expect(runMediaPilot([post()], h.ports, 2000)).rejects.toThrow(
      'UNSUPPORTED_MEDIA',
    );
    expect(h.ports.analyze).not.toHaveBeenCalled();
    expect(h.ports.cancelBeforeDispatch).toHaveBeenCalledTimes(1);
  });
  it('blocks replay after uncertain provider dispatch and rejects cross-workspace batches', async () => {
    const h = harness();
    (h.ports.analyze as jest.Mock).mockRejectedValue(new Error('timeout'));
    await expect(runMediaPilot([post()], h.ports, 2000)).rejects.toThrow(
      'timeout',
    );
    expect((await runMediaPilot([post()], h.ports, 2000)).blocked).toBe(1);
    expect(h.ports.analyze).toHaveBeenCalledTimes(1);
    await expect(
      runMediaPilot(
        [post(), post({ observationId: 'b', workspaceId: 'other' })],
        h.ports,
        2000,
      ),
    ).rejects.toThrow('INVALID_MEDIA_PILOT');
  });
  it('rechecks permissions before dispatch and does not consume a provider call after revocation', async () => {
    const h = harness();
    (h.ports.authorize as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('revoked'));
    await expect(runMediaPilot([post()], h.ports, 2000)).rejects.toThrow(
      'revoked',
    );
    expect(h.ports.analyze).not.toHaveBeenCalled();
  });
  it('honors a refused budget reservation and enforces the batch and byte ceilings', async () => {
    const h = harness();
    (h.ports.reserve as jest.Mock).mockResolvedValue({ state: 'BLOCKED' });
    expect((await runMediaPilot([post()], h.ports, 2000)).blocked).toBe(1);
    expect(h.ports.readMedia).not.toHaveBeenCalled();
    await expect(
      runMediaPilot(
        Array.from({ length: 31 }, (_, i) =>
          post({ observationId: String(i) }),
        ),
        h.ports,
        2000,
      ),
    ).rejects.toThrow('INVALID_MEDIA_PILOT');
    (h.ports.reserve as jest.Mock).mockResolvedValue({ state: 'NEW' });
    (h.ports.readMedia as jest.Mock).mockResolvedValue({
      data: Buffer.alloc(5 * 1024 * 1024 + 1),
      mime: 'image/jpeg',
    });
    await expect(runMediaPilot([post()], h.ports, 2000)).rejects.toThrow(
      'UNSUPPORTED_MEDIA',
    );
    expect(h.ports.analyze).not.toHaveBeenCalled();
  });
  it('allows an image-only project without a verified caption target', async () => {
    const h = harness();
    await runMediaPilot([post()], h.ports, 2000);
    const result = await runMediaPilot(
      [post({ caption: 'обычная подпись' })],
      h.ports,
      2000,
    );
    expect(result.results[0]).toMatchObject({
      decision: 'REVIEW_CANDIDATE',
      vision: { projectName: 'Image project', contacts: ['@image_project'] },
      reviewRequired: true,
    });
    expect(h.candidates.size).toBe(1);
    expect(h.ports.analyze).toHaveBeenCalledTimes(1);
  });
});

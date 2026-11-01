import { copilotProcessingGranted } from './telegram-crm-copilot-processing-policy';
const now = new Date('2026-10-31T12:00:00.000Z');
const record = {
  workspaceId: 'workspace',
  contactIds: ['contact'],
  reference: 'policy:reviewed-source',
  notesAllowed: false,
  expiresAt: '2026-11-30T00:00:00.000Z',
};
const allows = (
  raw: unknown,
  workspace = 'workspace',
  contact: string | null = 'contact',
  notes = false,
  ref: string | undefined = record.reference,
) => copilotProcessingGranted(raw, workspace, contact, notes, ref, now);
describe('verified deployment processing-grant scope', () => {
  it('accepts an exact reviewed workspace/contact/source reference without notes', () => {
    expect(allows(JSON.stringify([record]))).toBe(true);
    expect(
      allows(
        JSON.stringify([record]),
        'workspace',
        'contact',
        false,
        undefined,
      ),
    ).toBe(true);
  });
  it('allows every current or future contact only within an explicitly granted workspace', () => {
    const workspaceGrant = {
      workspaceId: 'workspace',
      scope: 'WORKSPACE',
      reference: 'policy:business-crm',
      notesAllowed: false,
      expiresAt: record.expiresAt,
    };
    const raw = JSON.stringify([workspaceGrant]);
    expect(
      allows(raw, 'workspace', 'new-contact', false, workspaceGrant.reference),
    ).toBe(true);
    expect(
      allows(
        raw,
        'another-workspace',
        'new-contact',
        false,
        workspaceGrant.reference,
      ),
    ).toBe(false);
    expect(
      allows(raw, 'workspace', 'new-contact', true, workspaceGrant.reference),
    ).toBe(false);
    expect(
      allows(raw, 'workspace', null, false, workspaceGrant.reference),
    ).toBe(false);
  });
  it.each([
    undefined,
    '',
    'true',
    '{}',
    '[]',
    '[',
    JSON.stringify([{ ...record, contactIds: ['*'] }]),
    JSON.stringify([{ ...record, notesAllowed: 'true' }]),
    JSON.stringify([{ ...record, expiresAt: 'never' }]),
    ' '.repeat(65537),
  ])('fails closed for absent/malformed policy %#', (raw) => {
    expect(allows(raw)).toBe(false);
  });
  it('does not equate a plausible attestation with approved source processing', () => {
    expect(
      allows(
        JSON.stringify([record]),
        'workspace',
        'contact',
        false,
        'policy:invented',
      ),
    ).toBe(false);
    expect(allows(JSON.stringify([record]), 'foreign-workspace')).toBe(false);
    expect(
      allows(JSON.stringify([record]), 'workspace', 'foreign-contact'),
    ).toBe(false);
    expect(allows(JSON.stringify([record]), 'workspace', null)).toBe(false);
  });
  it('requires explicit notes scope and current expiry', () => {
    expect(allows(JSON.stringify([record]), 'workspace', 'contact', true)).toBe(
      false,
    );
    expect(
      allows(
        JSON.stringify([{ ...record, notesAllowed: true }]),
        'workspace',
        'contact',
        true,
      ),
    ).toBe(true);
    expect(
      allows(JSON.stringify([{ ...record, expiresAt: now.toISOString() }])),
    ).toBe(false);
  });
});

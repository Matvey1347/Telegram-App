/** Reviewed deployment policy records, separate from provider credentials and AI budgets. */
type ProcessingGrant = {
  workspaceId: string;
  contactIds?: string[];
  scope?: 'WORKSPACE';
  reference: string;
  notesAllowed: boolean;
  expiresAt: string;
};
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const grant = (value: unknown): value is ProcessingGrant => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    identifier(row.workspaceId) &&
    (row.scope === undefined || row.scope === 'WORKSPACE') &&
    (row.scope === 'WORKSPACE'
      ? row.contactIds === undefined
      : Array.isArray(row.contactIds) &&
        row.contactIds.length > 0 &&
        row.contactIds.length <= 100 &&
        row.contactIds.every(identifier)) &&
    typeof row.reference === 'string' &&
    /^(consent|policy):[A-Za-z0-9_.-]{1,80}$/.test(row.reference) &&
    typeof row.notesAllowed === 'boolean' &&
    typeof row.expiresAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.expiresAt) &&
    Number.isFinite(Date.parse(row.expiresAt)) &&
    new Date(row.expiresAt).toISOString() === row.expiresAt
  );
};

/** Fail closed: a checkbox or plausible evidence reference is never an approval record. */
export function copilotProcessingGranted(
  raw: unknown,
  workspaceId: string,
  contactId: string | null,
  includeNotes: boolean,
  reference?: string,
  now = new Date(),
): boolean {
  return (
    copilotProcessingReference(
      raw,
      workspaceId,
      contactId,
      includeNotes,
      reference,
      now,
    ) !== null
  );
}

/** An explicit workspace grant covers existing and future CRM contacts in that workspace. */
export function copilotProcessingReference(
  raw: unknown,
  workspaceId: string,
  contactId: string | null,
  includeNotes: boolean,
  reference?: string,
  now = new Date(),
): string | null {
  if (
    !contactId ||
    typeof raw !== 'string' ||
    Buffer.byteLength(raw, 'utf8') > 64 * 1024
  )
    return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length > 100 || !parsed.every(grant))
    return null;
  const matching = parsed.find(
    (row) =>
      row.workspaceId === workspaceId &&
      (row.scope === 'WORKSPACE' || row.contactIds?.includes(contactId)) &&
      (!includeNotes || row.notesAllowed) &&
      (reference === undefined || row.reference === reference) &&
      Date.parse(row.expiresAt) > now.getTime(),
  );
  return matching?.reference ?? null;
}

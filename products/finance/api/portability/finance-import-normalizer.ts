type TimelineRow = {
  investmentRef?: unknown;
  occurredAt?: unknown;
  valuedAt?: unknown;
};

type InvestmentRow = {
  ref?: unknown;
  status?: unknown;
  startedAt?: unknown;
  closedAt?: unknown;
};

export type NormalizedFinanceImport = {
  input: unknown;
  warnings: string[];
};

/**
 * Repairs timeline boundaries that can be derived without changing financial
 * events. The strict validator still owns every structural and semantic check.
 */
export function normalizeFinanceImportDocument(
  input: unknown,
): NormalizedFinanceImport {
  if (!isRecord(input)) return { input, warnings: [] };
  const normalized = structuredClone(input);
  if (!isRecord(normalized.data)) return { input: normalized, warnings: [] };

  const investments = Array.isArray(normalized.data.investments)
    ? (normalized.data.investments as InvestmentRow[])
    : [];
  const cashFlows = Array.isArray(normalized.data.investmentCashFlows)
    ? (normalized.data.investmentCashFlows as TimelineRow[])
    : [];
  const valuations = Array.isArray(normalized.data.investmentValuations)
    ? (normalized.data.investmentValuations as TimelineRow[])
    : [];
  const eventTimes = new Map<string, number[]>();

  for (const row of cashFlows) {
    addEventTime(eventTimes, row.investmentRef, row.occurredAt);
  }
  for (const row of valuations) {
    addEventTime(eventTimes, row.investmentRef, row.valuedAt);
  }

  const warnings: string[] = [];
  for (const investment of investments) {
    if (typeof investment.ref !== 'string') continue;
    const history = eventTimes.get(investment.ref) ?? [];
    const startedAt = parseInstant(investment.startedAt);
    if (startedAt === null) continue;

    const earliest = history.length
      ? Math.min(startedAt, ...history)
      : startedAt;
    if (earliest < startedAt) {
      investment.startedAt = new Date(earliest).toISOString();
      warnings.push(
        `Investment ${investment.ref}: startedAt was moved to the earliest imported cash flow or valuation.`,
      );
    }

    const closedAt = parseInstant(investment.closedAt);
    const hasRepairableClosingBoundary =
      investment.status === 'CLOSED' ||
      (investment.status === 'ARCHIVED' && closedAt !== null);
    if (!hasRepairableClosingBoundary) continue;
    const latest = history.length ? Math.max(earliest, ...history) : earliest;
    if (closedAt === null || closedAt < latest) {
      investment.closedAt = new Date(latest).toISOString();
      warnings.push(
        `Investment ${investment.ref}: closedAt was set to the latest imported cash flow or valuation.`,
      );
    }
  }

  return { input: normalized, warnings };
}

function addEventTime(
  target: Map<string, number[]>,
  investmentRef: unknown,
  value: unknown,
) {
  if (typeof investmentRef !== 'string') return;
  const timestamp = parseInstant(value);
  if (timestamp === null) return;
  const values = target.get(investmentRef) ?? [];
  values.push(timestamp);
  target.set(investmentRef, values);
}

function parseInstant(value: unknown) {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

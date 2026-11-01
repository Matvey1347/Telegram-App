#!/usr/bin/env node
/** Opt-in staging harness. Defaults to offline dataset validation; no OpenAI client. */
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const datasetPath = fileURLToPath(new URL('../docs/qa/ai-sales-copilot/evaluation-scenarios.json', import.meta.url));
const args = process.argv.slice(2);
const arg = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const dataset = JSON.parse(await readFile(datasetPath, 'utf8'));
if (dataset.scenarios.length < 40 || new Set(dataset.scenarios.map(s => s.id)).size !== dataset.scenarios.length) {
  throw new Error('Invalid evaluation dataset');
}
if (!args.includes('--live')) {
  process.stdout.write(`${dataset.scenarios.length} synthetic evaluation scenarios validated offline. No network requests.\n`);
  process.stdout.write('Live evaluation requires --live --mapping <approved-staging-fixtures.json> --output <private-report.json> --limit <1..48>, staging URL/token and explicit cost acknowledgement.\n');
  process.exit(0);
}

const base = process.env.CRM_COPILOT_BENCHMARK_BASE_URL;
const token = process.env.CRM_COPILOT_BENCHMARK_TOKEN;
const workspaceId = process.env.CRM_COPILOT_BENCHMARK_WORKSPACE_ID;
const acknowledgement = process.env.CRM_COPILOT_BENCHMARK_ALLOW_PAID;
const mappingPath = arg('--mapping');
const outputPath = arg('--output');
const limit = Number(arg('--limit'));
if (!base || !token || !workspaceId || !mappingPath || !outputPath || acknowledgement !== 'APPROVED_SYNTHETIC_STAGING_AND_PAID_CALLS' || !Number.isInteger(limit) || limit < 1 || limit > dataset.scenarios.length) {
  throw new Error('Live benchmark setup incomplete; no request was made');
}
const url = new URL(base);
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
  !(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || (url.protocol === 'https:' && /(^|[.-])staging([.-]|$)/.test(url.hostname)))) {
  throw new Error('Only explicit local/staging API origins are accepted');
}
const mapping = JSON.parse(await readFile(mappingPath, 'utf8'));
if (mapping.syntheticDataApproved !== true || mapping.workspaceId !== workspaceId) {
  throw new Error('Mapping must attest approved synthetic data and selected workspace');
}
const cases = dataset.scenarios.filter(s => mapping.cases?.[s.id]).slice(0, limit);
if (cases.length !== limit) throw new Error('Insufficient mapped, seeded staging scenarios');
const report = { version: dataset.version, startedAt: new Date().toISOString(), modelQualityApproved: false, cases: [] };
// Serial calls, no retries or fallback models. Every call uses CRM -> existing Gateway
// admission/ledger; this script never contacts OpenAI directly or sends Telegram.
for (const scenario of cases) {
  const fixture = mapping.cases[scenario.id];
  if (!fixture.conversationId || !/^(consent|policy):[A-Za-z0-9_.-]{1,80}$/.test(fixture.processingReference ?? '') || !Array.isArray(fixture.productIds) || fixture.productIds.length > 5) {
    throw new Error(`Invalid seeded fixture: ${scenario.id}`);
  }
  const endpoint = new URL(`${url.pathname.replace(/\/$/, '')}/telegram-crm/conversations/${encodeURIComponent(fixture.conversationId)}/copilot/generate`, url.origin);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Workspace-Id': workspaceId },
    body: JSON.stringify({
      operationId: `${new Date().toISOString().slice(0, 10)}:${randomUUID()}`,
      category: scenario.category, tone: scenario.tone, language: scenario.language,
      productIds: fixture.productIds, includeNotes: fixture.includeNotes === true,
      processingBasis: fixture.processingBasis ?? 'APPROVED_BUSINESS_PROCESSING',
      processingReference: fixture.processingReference, sourceAcknowledged: true,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  // Report contains synthetic generated output only; never print credentials/body.
  const body = await response.json();
  report.cases.push({ id: scenario.id, status: response.status, draft: response.ok ? body : null,
    error: response.ok ? null : 'CRM_REQUEST_REJECTED', criteria: scenario.criteria,
    humanScores: Object.fromEntries(scenario.humanRubric.map(k => [k, null])) });
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(`${scenario.id}: HTTP ${response.status}; evaluate private report against rubric.\n`);
  if (!response.ok || ['UNKNOWN', 'FAILED'].includes(body.status) || body.operation?.pricingStatus === 'UNKNOWN' || body.operation?.pricingStatus === 'UNPRICED') break;
}
process.stdout.write('No automatic approval or send occurred. Human quality review remains required.\n');

/** Opt-in assistant latency probe. It records AI usage and may create a draft proposal. */
const baseUrl = process.env.FINANCE_AI_BENCH_URL;
const botId = process.env.FINANCE_AI_BENCH_BOT_ID;
const cookie = process.env.FINANCE_AI_BENCH_COOKIE;
const prompt = process.env.FINANCE_AI_BENCH_PROMPT || 'What changed in my finances this month?';
const samples = Number(process.env.FINANCE_AI_BENCH_SAMPLES || 5);
if (!baseUrl || !botId || !cookie) throw new Error('Set FINANCE_AI_BENCH_URL, FINANCE_AI_BENCH_BOT_ID and FINANCE_AI_BENCH_COOKIE');
if (!Number.isInteger(samples) || samples < 1 || samples > 50) throw new Error('FINANCE_AI_BENCH_SAMPLES must be 1..50');
const target = new URL(baseUrl);
if (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname)))
  throw new Error('FINANCE_AI_BENCH_URL must use HTTPS, except localhost');

function percentile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.ceil(sorted.length * ratio) - 1];
}

async function one() {
  const started = performance.now();
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/finance-bots/${encodeURIComponent(botId)}/ultimate/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Finance-Consumer-Request': '1', Cookie: cookie },
    body: JSON.stringify({ text: prompt, history: [] }),
    signal: AbortSignal.timeout(45_000),
  });
  const headersMs = performance.now() - started;
  if (!response.ok || !response.body) throw new Error(`Assistant HTTP ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let firstEventMs = null;
  let firstDeltaMs = null;
  let timing = null;
  let resultKind = null;
  const consume = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    firstEventMs ??= performance.now() - started;
    if (event.type === 'delta') firstDeltaMs ??= performance.now() - started;
    if (event.type === 'timing') timing = event;
    if (event.type === 'done') resultKind = event.result?.kind;
    if (event.type === 'error') throw new Error(`Assistant stream error: ${event.code || 'unknown'}`);
  };
  while (true) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || '';
    for (const line of lines) consume(line);
    if (done) break;
  }
  if (pending.trim()) consume(pending);
  if (!resultKind) throw new Error('Assistant stream ended without a result');
  return { headersMs, firstEventMs, firstDeltaMs, totalMs: performance.now() - started,
    contextMs: timing?.contextMs ?? null, modelMs: timing?.modelMs ?? null,
    proposalMs: timing?.proposalMs ?? null, resultKind };
}

const rows = [];
for (let index = 0; index < samples; index += 1) rows.push(await one());
const metrics = ['headersMs', 'firstEventMs', 'firstDeltaMs', 'contextMs', 'modelMs', 'proposalMs', 'totalMs'];
process.stdout.write(`${JSON.stringify({ samples, resultKinds: rows.map(row => row.resultKind),
  latencyMs: Object.fromEntries(metrics.map(metric => [metric, { p50: percentile(rows.map(row => row[metric]), 0.5), p95: percentile(rows.map(row => row[metric]), 0.95) }])),
  note: 'No ledger proposal is confirmed. AI usage and draft proposals may be persisted and provider cost accrues. Use a question prompt on a disposable staging profile.' }, null, 2)}\n`);

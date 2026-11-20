import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./ai-lead-qualification-benchmark.mjs', import.meta.url));
test('benchmark defaults to offline synthetic validation without credentials', () => {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /60 synthetic/);
  assert.match(result.stdout, /No network requests/);
});
test('live mode fails before networking when cost acknowledgement and fixtures are absent', () => {
  const result = spawnSync(process.execPath, [script, '--live'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /setup incomplete; no request was made/);
});

import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const run = (args, env) => new Promise(resolve => {
  const child = spawn(process.execPath, [script, ...args], { env: { PATH: process.env.PATH, ...env } });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  child.on('close', code => resolve({ code, stdout, stderr }));
});
test('production origin is rejected before any benchmark request', async () => {
  const result = await run(['--live', '--mapping', 'unused.json', '--output', 'unused-report.json', '--limit', '1'], {
    CRM_LEAD_BENCHMARK_BASE_URL: 'https://production.example.invalid', CRM_LEAD_BENCHMARK_TOKEN: 'synthetic-token',
    CRM_LEAD_BENCHMARK_WORKSPACE_ID: 'synthetic-workspace', CRM_LEAD_BENCHMARK_ALLOW_PAID: 'APPROVED_SYNTHETIC_STAGING_AND_PAID_CALLS',
  });
  assert.notEqual(result.code, 0); assert.match(result.stderr, /Only explicit local\/staging/);
});
test('mock staging run calls only explicit qualification and stops on UNKNOWN without approval, draft or send', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lead-qualification-benchmark-'));
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, body: JSON.parse(body) });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ qualification: { status: 'UNKNOWN', operation: { pricingStatus: 'UNKNOWN' } }, drafts: [] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const mapping = join(dir, 'mapping.json'), report = join(dir, 'report.json');
    await writeFile(mapping, JSON.stringify({ syntheticDataApproved: true, workspaceId: 'synthetic-workspace', cases: {
      psychologist: { candidateId: 'synthetic-a', productIds: ['permitted-product'] },
      'online-course': { candidateId: 'synthetic-b', productIds: ['permitted-product'] },
    } }));
    const result = await run(['--live', '--mapping', mapping, '--output', report, '--limit', '2'], {
      CRM_LEAD_BENCHMARK_BASE_URL: `http://127.0.0.1:${server.address().port}/api`, CRM_LEAD_BENCHMARK_TOKEN: 'synthetic-token',
      CRM_LEAD_BENCHMARK_WORKSPACE_ID: 'synthetic-workspace', CRM_LEAD_BENCHMARK_ALLOW_PAID: 'APPROVED_SYNTHETIC_STAGING_AND_PAID_CALLS',
    });
    assert.equal(result.code, 0, result.stderr); assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/telegram-crm/lead-discovery/candidates/synthetic-a/qualify');
    assert.match(requests[0].body.operationId, /^\d{4}-\d{2}-\d{2}:[0-9a-f-]{36}$/);
    assert.deepEqual(requests[0].body.productIds, ['permitted-product']);
    assert.equal(JSON.parse(await readFile(report, 'utf8')).modelQualityApproved, false);
    assert.equal((await stat(report)).mode & 0o777, 0o600);
  } finally {
    await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true });
  }
});

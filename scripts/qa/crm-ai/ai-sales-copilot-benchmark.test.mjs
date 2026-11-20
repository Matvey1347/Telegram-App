import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./ai-sales-copilot-benchmark.mjs', import.meta.url));
test('benchmark defaults to offline synthetic validation without credentials', () => {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /48 synthetic/);
  assert.match(result.stdout, /No network requests/);
});
test('live mode fails before networking when cost acknowledgement and fixtures are absent', () => {
  const result = spawnSync(process.execPath, [script, '--live'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /setup incomplete; no request was made/);
});

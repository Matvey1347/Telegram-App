import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

for (const name of ['ai-lead-qualification-benchmark', 'ai-sales-copilot-benchmark']) {
  test(`${name} keeps its documented top-level CLI`, () => {
    const canonical = fileURLToPath(new URL(`./${name}.mjs`, import.meta.url));
    const legacy = fileURLToPath(new URL(`../../${name}.mjs`, import.meta.url));
    const options = { cwd: tmpdir(), encoding: 'utf8', env: { PATH: process.env.PATH } };

    const before = spawnSync(process.execPath, [canonical], options);
    const after = spawnSync(process.execPath, [legacy], options);
    assert.equal(before.status, 0, before.stderr);
    assert.equal(after.status, 0, after.stderr);
    assert.equal(after.stdout, before.stdout);

    const incompleteLive = spawnSync(process.execPath, [legacy, '--live'], options);
    assert.equal(incompleteLive.status, 1);
    assert.match(incompleteLive.stderr, /setup incomplete; no request was made/);
  });
}

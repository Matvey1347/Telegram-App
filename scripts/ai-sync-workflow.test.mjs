import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";

test("protected release push is blocked by failed AI reconciliation; feature pushes do not run it", () => {
  const directory = mkdtempSync(join(tmpdir(), "ai-sync-hook-"));
  try {
    writeFileSync(
      join(directory, "pnpm"),
      '#!/bin/sh\n[ "$1" = "ai:sync:check" ] || exit 9\nexit 7\n',
      { mode: 0o700 },
    );
    const options = {
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
      encoding: "utf8",
    };
    const hook = resolve(".githooks/pre-push");
    assert.equal(
      spawnSync("sh", [hook], {
        ...options,
        input: "refs/heads/main a refs/heads/main b\n",
      }).status,
      1,
    );
    assert.equal(
      spawnSync("sh", [hook], {
        ...options,
        input: "refs/heads/feature a refs/heads/feature b\n",
      }).status,
      0,
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
});

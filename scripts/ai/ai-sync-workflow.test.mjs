import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";
import { readPendingAiReceiptBatch } from "./sync-local-ai-costs.mjs";

test("reads the first remaining receipt after a full batch is acknowledged", async () => {
  const receipts = Array.from({ length: 102 }, (_, index) => ({
    id: String(index).padStart(3, "0"),
    source: "LOCAL_UNSYNCED",
  }));
  const database = {
    aiOperation: {
      findMany: async ({ where, take, skip = 0 }) =>
        receipts
          .filter((row) => row.source === where.source && (!where.id || row.id > where.id.gt))
          .slice(skip, take + skip),
    },
  };

  const first = await readPendingAiReceiptBatch(database);
  assert.equal(first.length, 100);
  for (const row of first) row.source = "LOCAL_SYNCED";

  const rest = await readPendingAiReceiptBatch(database, first.at(-1).id);
  assert.deepEqual(rest.map(({ id }) => id), ["100", "101"]);
});

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

import assert from "node:assert/strict";
import test from "node:test";
import {
  isBackendReadyLine,
  isSuccessfulCompilationLine,
  waitForHealthyBackend,
} from "./dev-api-supervisor.mjs";

test("recognizes a successful Nest watch compilation", () => {
  assert.equal(
    isSuccessfulCompilationLine(
      "[11:20:02 PM] Found 0 errors. Watching for file changes.",
    ),
    true,
  );
  assert.equal(
    isSuccessfulCompilationLine(
      "[11:20:02 PM] Found 2 errors. Watching for file changes.",
    ),
    false,
  );
});

test("recognizes readiness from the newly bootstrapped API process", () => {
  assert.equal(
    isBackendReadyLine(
      "[api] Ready on http://localhost:4000/api (health: /api/health)",
    ),
    true,
  );
  assert.equal(isBackendReadyLine("old backend is still healthy"), false);
});

test("waits through reload downtime until the backend is healthy", async () => {
  let attempts = 0;
  let currentTime = 0;
  const result = await waitForHealthyBackend({
    timeoutMs: 1_000,
    intervalMs: 100,
    now: () => currentTime,
    delayImpl: async (duration) => {
      currentTime += duration;
    },
    fetchImpl: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("connection refused");
      return { ok: true };
    },
  });

  assert.deepEqual(result, { attempts: 3, elapsedMs: 200 });
});

test("reports a backend that never returns after compilation", async () => {
  let currentTime = 0;
  await assert.rejects(
    waitForHealthyBackend({
      timeoutMs: 200,
      intervalMs: 100,
      now: () => currentTime,
      delayImpl: async (duration) => {
        currentTime += duration;
      },
      fetchImpl: async () => {
        throw new Error("connection refused");
      },
    }),
    /backend did not become healthy within 200ms/u,
  );
});

test("does not accept a healthy response until the new runtime reports ready", async () => {
  let currentTime = 0;
  let attempts = 0;
  const result = await waitForHealthyBackend({
    timeoutMs: 500,
    intervalMs: 100,
    now: () => currentTime,
    delayImpl: async (duration) => {
      currentTime += duration;
    },
    fetchImpl: async () => {
      attempts += 1;
      return { ok: true };
    },
    acceptsResponse: () => attempts >= 3,
  });

  assert.deepEqual(result, { attempts: 3, elapsedMs: 200 });
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_SERVICE_READINESS_TIMEOUT_MS,
  waitForHttpReady,
} from "./dev-service-readiness.mjs";

test("allows cold local services longer than the previous 60 second window", () => {
  assert.equal(LOCAL_SERVICE_READINESS_TIMEOUT_MS, 180_000);
});

test("keeps probing until the local service becomes ready", async () => {
  let attempts = 0;
  const delays = [];

  await waitForHttpReady("http://127.0.0.1:4000/api/health", {
    timeoutMs: 1_000,
    intervalMs: 25,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("not listening yet");
      return { ok: true, status: 200 };
    },
    delayImpl: async (duration) => delays.push(duration),
  });

  assert.equal(attempts, 3);
  assert.deepEqual(delays, [25, 25]);
});

test("reports the URL and timeout after readiness expires", async () => {
  await assert.rejects(
    waitForHttpReady("http://127.0.0.1:4000/api/health", {
      timeoutMs: 0,
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }),
    /did not become ready at http:\/\/127\.0\.0\.1:4000\/api\/health within 0ms/u,
  );
});

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  RAILWAY_MEMORY_SAMPLE_REQUEST,
  RAILWAY_MEMORY_SAMPLE_RESPONSE,
  RAILWAY_MEMORY_SAMPLE_INTERVAL_MS,
  installRailwayMemoryResponder,
  takeRailwayMemorySnapshot,
} from "./railway-memory-diagnostics.mjs";

test("takes a complete, secret-free snapshot from the measured process", () => {
  const snapshot = takeRailwayMemorySnapshot("api", {
    pid: 123,
    uptime: () => 42.8,
    memoryUsage: () => ({
      rss: 12 * 1024 * 1024,
      heapUsed: 8.25 * 1024 * 1024,
      heapTotal: 16 * 1024 * 1024,
      external: 1.5 * 1024 * 1024,
      arrayBuffers: 0.75 * 1024 * 1024,
    }),
  });

  assert.match(snapshot.timestamp, /^\d{4}-\d{2}-\d{2}T/u);
  assert.deepEqual({ ...snapshot, timestamp: "timestamp" }, {
    timestamp: "timestamp",
    processType: "api",
    pid: 123,
    uptimeSeconds: 43,
    rssMb: 12,
    heapUsedMb: 8.3,
    heapTotalMb: 16,
    externalMb: 1.5,
    arrayBuffersMb: 0.8,
  });
});

test("responds only to an explicit supervisor request and removes its listener", () => {
  const runtime = Object.assign(new EventEmitter(), {
    pid: 456,
    uptime: () => 9,
    memoryUsage: () => ({
      rss: 1,
      heapUsed: 2,
      heapTotal: 3,
      external: 4,
      arrayBuffers: 5,
    }),
    send: (message) => sent.push(message),
  });
  const sent = [];
  const remove = installRailwayMemoryResponder("web", runtime);

  runtime.emit("message", { type: "other" });
  runtime.emit("message", {
    type: RAILWAY_MEMORY_SAMPLE_REQUEST,
    requestId: "request-1",
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, RAILWAY_MEMORY_SAMPLE_RESPONSE);
  assert.equal(sent[0].requestId, "request-1");
  assert.equal(sent[0].sample.processType, "web");
  remove();
  runtime.emit("message", {
    type: RAILWAY_MEMORY_SAMPLE_REQUEST,
    requestId: "request-2",
  });
  assert.equal(sent.length, 1);
});

test("uses a five-minute shared sampling cadence", () => {
  assert.equal(RAILWAY_MEMORY_SAMPLE_INTERVAL_MS, 300_000);
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { terminateDevChildren } from "./dev-process-termination.mjs";

function waitForExit(child) {
  return new Promise((resolve) => child.once("exit", resolve));
}

test(
  "escalates when a detached dev process ignores SIGTERM",
  { skip: process.platform === "win32" },
  async () => {
    const child = spawn(
      process.execPath,
      [
        "-e",
        "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000)",
      ],
      { detached: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    const exited = waitForExit(child);
    await new Promise((resolve) => child.stdout.once("data", resolve));

    await terminateDevChildren([child], { graceMs: 20 });
    await exited;

    assert.equal(child.signalCode, "SIGKILL");
  },
);

test("uses the child fallback for non-detached platforms", async () => {
  const signals = [];
  await terminateDevChildren([{ kill: (signal) => signals.push(signal) }], {
    platform: "win32",
    graceMs: 0,
  });
  assert.deepEqual(signals, ["SIGTERM"]);
});

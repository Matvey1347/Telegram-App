import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { stopRegisteredDevLaunchers } from "./dev-launcher-ownership.mjs";

test("terminates registered launches on overlapping ports before returning", {
  skip: process.platform === "win32",
  timeout: 5_000,
}, async () => {
  const workspace = mkdtempSync(join(tmpdir(), "telegram-dev-launcher-test-"));
  const moduleUrl = new URL("./dev-launcher-ownership.mjs", import.meta.url);
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import { registerDevLauncher } from ${JSON.stringify(moduleUrl.href)};
    process.on("SIGTERM", () => {
      setTimeout(() => process.exit(0), 50);
    });
    registerDevLauncher([4000]);
    setInterval(() => {}, 1000);
    process.send("ready");
  `], { cwd: workspace, stdio: ["ignore", "ignore", "ignore", "ipc"] });
  const exited = once(child, "exit");
  try {
    const [message] = await once(child, "message");
    assert.equal(message, "ready");
    await stopRegisteredDevLaunchers([4001], workspace);
    assert.equal(child.exitCode, null);
    child.kill("SIGSTOP");
    await stopRegisteredDevLaunchers([4000], workspace);
    assert.deepEqual(await exited, [0, null]);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
    rmSync(workspace, { recursive: true, force: true });
  }
});

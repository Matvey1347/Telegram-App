import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

function processStartedAt(pid) {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "lstart="], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function registryDirectory(workspace) {
  const key = createHash("sha256").update(realpathSync(workspace)).digest("hex").slice(0, 24);
  return join(tmpdir(), `telegram-dev-launchers-${key}`);
}

export function registerDevLauncher(ports, workspace = process.cwd()) {
  if (process.platform === "win32") return;
  const startedAt = processStartedAt(process.pid);
  if (!startedAt) throw new Error("Could not identify this local dev launcher");
  const directory = registryDirectory(workspace);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, `${process.pid}.json`);
  writeFileSync(file, JSON.stringify({ startedAt, ports }), { mode: 0o600 });
  process.once("exit", () => rmSync(file, { force: true }));
}

export async function stopRegisteredDevLaunchers(ports, workspace = process.cwd()) {
  if (process.platform === "win32") return;
  const directory = registryDirectory(workspace);
  let files;
  try {
    files = readdirSync(directory);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  const stopping = [];
  for (const name of files) {
    if (!/^[1-9]\d*\.json$/u.test(name)) continue;
    const pid = Number(name.slice(0, -5));
    if (pid === process.pid) continue;
    const file = join(directory, name);
    let record;
    try {
      record = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (!record.startedAt || processStartedAt(pid) !== record.startedAt) {
      rmSync(file, { force: true });
      continue;
    }
    if (!record.ports.some((port) => ports.includes(port))) continue;
    try {
      process.kill(pid, "SIGTERM");
      // A terminal-suspended launcher needs to resume to run its shutdown hooks.
      process.kill(pid, "SIGCONT");
      stopping.push({ pid, ...record });
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  if (!stopping.length) return;
  // The old launcher owns tunnels, detached watchers and local webhook cleanup.
  const deadline = Date.now() + 22_000;
  let active = stopping;
  while (active.length && Date.now() < deadline) {
    active = active.filter(({ pid, startedAt }) => processStartedAt(pid) === startedAt);
    if (active.length) await delay(150);
  }
  if (active.length) {
    throw new Error(`Previous local dev launcher is still stopping (PID ${active.map(({ pid }) => pid).join(", ")}).`);
  }
  console.log(`Stopped previous local dev launchers: ${stopping.map(({ pid }) => pid).join(", ")}.`);
}

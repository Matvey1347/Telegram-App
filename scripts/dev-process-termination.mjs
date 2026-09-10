import { setTimeout as delay } from "node:timers/promises";

const PROCESS_EXIT_GRACE_MS = 3_000;

function signalProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    return false;
  }
}

function processGroupIsAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stops detached dev process groups and escalates after a bounded grace period.
 * Nest's compiled child can outlive pnpm after SIGTERM, otherwise leaving port
 * 4000 occupied even though the dev-tunnel parent has already exited.
 */
export async function terminateDevChildren(
  children,
  { platform = process.platform, graceMs = PROCESS_EXIT_GRACE_MS } = {},
) {
  const processGroups = [];
  for (const child of children) {
    if (platform !== "win32" && typeof child.pid === "number") {
      processGroups.push(child.pid);
      if (signalProcessGroup(child.pid, "SIGTERM")) continue;
    }
    child.kill("SIGTERM");
  }

  if (!processGroups.length) return;
  await delay(graceMs);
  for (const pid of processGroups) {
    if (processGroupIsAlive(pid)) signalProcessGroup(pid, "SIGKILL");
  }
}

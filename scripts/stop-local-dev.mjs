import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const ports = [3000, 3001, 4000, 4001, 4002, 4100];
const STOP_GRACE_MS = 3_000;
const STOP_TIMEOUT_MS = 6_000;

async function listeningPids(port) {
  try {
    const { stdout } = await execFileAsync("lsof", [
      "-tiTCP:" + port,
      "-sTCP:LISTEN",
    ]);
    return stdout
      .split("\n")
      .map((value) => Number(value.trim()))
      .filter(Number.isInteger);
  } catch {
    return [];
  }
}

async function processDetails(pid) {
  let cwdOutput = "";
  try {
    ({ stdout: cwdOutput } = await execFileAsync("lsof", [
      "-a",
      "-p",
      String(pid),
      "-d",
      "cwd",
      "-Fn",
    ]));
  } catch {
    // A process can exit between the listener scan and this lookup.
  }
  const cwd = cwdOutput.split("\n").find((line) => line.startsWith("n"))?.slice(1);
  return { cwd };
}

function belongsToWorkspace(cwd, workspace) {
  return cwd === workspace || cwd?.startsWith(`${workspace}/`);
}

export async function stopLocalDevProcesses({
  workspace = process.cwd(),
  delayImpl = delay,
  signalProcess = (pid, signal) => process.kill(pid, signal),
} = {}) {
  const stopped = new Set();
  const skipped = new Set();
  const workspaceListeners = async () => {
    const candidates = [...new Set((await Promise.all(ports.map(listeningPids))).flat())];
    const workspacePids = [];
    for (const pid of candidates) {
      const { cwd } = await processDetails(pid);
      if (!belongsToWorkspace(cwd, workspace)) {
        skipped.add(pid);
        continue;
      }
      workspacePids.push(pid);
    }
    return workspacePids;
  };
  const signalWorkspaceListeners = async (signal) => {
    const workspacePids = await workspaceListeners();
    for (const pid of workspacePids) {
      try {
        signalProcess(pid, signal);
        stopped.add(pid);
      } catch (error) {
        if (error?.code !== "ESRCH") throw error;
      }
    }
  };

  await signalWorkspaceListeners("SIGTERM");
  const deadline = Date.now() + STOP_GRACE_MS;
  while (Date.now() < deadline) {
    const remaining = await workspaceListeners();
    if (!remaining.length) break;
    await delayImpl(100);
  }

  await signalWorkspaceListeners("SIGKILL");
  const timeout = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < timeout) {
    const remaining = await workspaceListeners();
    if (!remaining.length) break;
    await delayImpl(100);
  }

  const remaining = await workspaceListeners();
  if (remaining.length) {
    throw new Error(
      `Could not stop local development listener process(es) ${remaining.join(", ")}. Check the process owner, then retry the tunnel command.`,
    );
  }

  const outsideListeners = [...new Set((await Promise.all(ports.map(listeningPids))).flat())];
  if (outsideListeners.length) {
    throw new Error(
      `Local development ports are still occupied by process(es) outside this workspace: ${outsideListeners.join(", ")}. Inspect them with lsof, then retry the tunnel command.`,
    );
  }

  if (stopped.size) {
    console.log(`Stopped local development listeners: ${[...stopped].join(", ")}.`);
  } else {
    console.log("No local development listeners were running.");
  }
  if (skipped.size) {
    console.log(
      `Left listeners outside this workspace untouched: ${[...skipped].join(", ")}.`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  stopLocalDevProcesses().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

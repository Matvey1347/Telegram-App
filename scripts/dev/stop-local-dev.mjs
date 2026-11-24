import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { stopRegisteredDevLaunchers } from "./dev-launcher-ownership.mjs";

const execFileAsync = promisify(execFile);
const defaultPorts = [3000, 3001, 4000, 4001, 4002, 4100];
const STOP_GRACE_MS = 3_000;
const STOP_TIMEOUT_MS = 6_000;

async function listeningPids(port) {
  try {
    const { stdout } = await execFileAsync("lsof", [
      "-tiTCP:" + port,
      "-sTCP:LISTEN",
    ]);
    return stdout.split("\n").flatMap((value) =>
      /^[1-9]\d*$/u.test(value.trim()) ? [Number(value.trim())] : [],
    );
  } catch (error) {
    // lsof exits 1 without output when the port has no listeners.
    if (error.code === 1 && !error.stderr?.trim()) return [];
    throw error;
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
  if (!cwd) return false;
  const path = relative(workspace, cwd);
  return path !== ".." && !path.startsWith(`..${sep}`) && resolve(workspace, path) === cwd;
}

export async function stopLocalDevProcesses({
  workspace = process.cwd(),
  ports = defaultPorts,
  delayImpl = delay,
  signalProcess = (pid, signal) => process.kill(pid, signal),
  listListeners = listeningPids,
  getProcessDetails = processDetails,
  stopLaunchers = stopRegisteredDevLaunchers,
} = {}) {
  workspace = realpathSync(workspace);
  await stopLaunchers(ports, workspace);
  const stopped = new Set();
  const listeners = async () => Promise.all(
    ports.map(async (port) => ({ port, pids: await listListeners(port) })),
  );
  const workspaceListeners = async () => {
    const candidates = [...new Set((await listeners()).flatMap(({ pids }) => pids))];
    const workspacePids = [];
    for (const pid of candidates) {
      const { cwd } = await getProcessDetails(pid);
      if (!belongsToWorkspace(cwd, workspace)) {
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

  const outsideListeners = (await listeners()).flatMap(({ port, pids }) =>
    pids.map((pid) => `${port} (PID ${pid})`),
  );
  if (outsideListeners.length) {
    throw new Error(
      `Local development ports are still occupied outside this workspace: ${outsideListeners.join(", ")}. Inspect the listeners with lsof before retrying.`,
    );
  }

  if (stopped.size) {
    console.log(`Stopped local development listeners: ${[...stopped].join(", ")}.`);
  } else {
    console.log("No local development listeners were running.");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  stopLocalDevProcesses().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

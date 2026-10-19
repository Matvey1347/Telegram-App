import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ports = [3000, 3001, 4000, 4001, 4002];
const workspace = process.cwd();

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

async function commandFor(pid) {
  try {
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "command="]);
    return stdout.trim();
  } catch {
    return "";
  }
}

function isWorkspaceDevProcess(command) {
  return (
    command.includes(workspace) ||
    /(?:next dev|nest start|ts-node-dev|cloudflared)/u.test(command)
  );
}

const candidates = [...new Set((await Promise.all(ports.map(listeningPids))).flat())];
const stopped = [];
const skipped = [];

for (const pid of candidates) {
  const command = await commandFor(pid);
  if (!isWorkspaceDevProcess(command)) {
    skipped.push(pid);
    continue;
  }
  try {
    process.kill(pid, "SIGTERM");
    stopped.push(pid);
  } catch {
    // The process may exit between lsof and kill.
  }
}

if (stopped.length) {
  console.log(`Stopped local development listeners: ${stopped.join(", ")}.`);
} else {
  console.log("No Telegram System local development listeners were running.");
}
if (skipped.length) {
  console.log(`Left unrelated listeners untouched: ${skipped.join(", ")}.`);
}

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { railwayPublicEnvironment } from "./public-origin-environment.mjs";
import {
  RAILWAY_MEMORY_SAMPLE_INTERVAL_MS,
  RAILWAY_MEMORY_SAMPLE_REQUEST,
  RAILWAY_MEMORY_SAMPLE_RESPONSE,
  takeRailwayMemorySnapshot,
} from "./railway-memory-diagnostics.mjs";

const publicPort = process.env.PORT || "3000";
const internalApiPort = "4000";
const publicDeployment = railwayPublicEnvironment(
  process.env.RAILWAY_PUBLIC_DOMAIN,
  process.env,
);
const publicOrigin = publicDeployment?.publicOrigin;
const children = new Map();
let stopping = false;
let memoryTimer;

const API_READY_TIMEOUT_MS = 60_000;
const API_READY_RETRY_MS = 500;

function logMemory(sample) {
  process.stdout.write(
    `[railway-memory] ${JSON.stringify({ event: "process_memory_sample", ...sample })}\n`,
  );
}

function requestChildMemory(child) {
  if (!child.connected || child.exitCode !== null) return;
  try {
    child.send({
      type: RAILWAY_MEMORY_SAMPLE_REQUEST,
      requestId: randomUUID(),
    }, () => {});
  } catch {
    // The child may exit between the connection check and IPC send.
  }
}

function sampleMemory() {
  logMemory(takeRailwayMemorySnapshot("supervisor"));
  for (const child of children.keys()) requestChildMemory(child);
}

function startMemoryDiagnostics() {
  sampleMemory();
  memoryTimer = setInterval(sampleMemory, RAILWAY_MEMORY_SAMPLE_INTERVAL_MS);
  memoryTimer.unref();
}

function stopMemoryDiagnostics() {
  if (memoryTimer) clearInterval(memoryTimer);
  memoryTimer = undefined;
}

function start(name, command, args, env, processType) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });
  children.set(child, { name, processType });
  child.on("message", (message) => {
    const registered = children.get(child);
    if (
      !registered ||
      message?.type !== RAILWAY_MEMORY_SAMPLE_RESPONSE ||
      message?.sample?.processType !== registered.processType
    ) {
      return;
    }
    logMemory(message.sample);
  });
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (stopping) return;
    process.stderr.write(
      `[railway] ${name} stopped (${signal || `code ${code ?? 1}`}).\n`,
    );
    void stop(code ?? 1);
  });
  child.once("error", (error) => {
    process.stderr.write(`[railway] Failed to start ${name}: ${error.message}\n`);
    void stop(1);
  });
  return child;
}

function terminate(child) {
  if (!child.killed) child.kill("SIGTERM");
}

async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  stopMemoryDiagnostics();
  for (const child of children.keys()) terminate(child);
  const force = setTimeout(() => {
    for (const child of children.keys()) {
      if (!child.killed) child.kill("SIGKILL");
    }
  }, 10_000);
  force.unref();
  await Promise.allSettled(
    [...children.keys()].map(
      (child) => new Promise((resolve) => child.once("exit", resolve)),
    ),
  );
  process.exit(exitCode);
}

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForInternalApi() {
  const deadline = Date.now() + API_READY_TIMEOUT_MS;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${internalApiPort}/api/health`,
        { signal: AbortSignal.timeout(2_000) },
      );
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(API_READY_RETRY_MS);
  }
  throw new Error(
    `Internal API did not become ready within ${API_READY_TIMEOUT_MS}ms (${lastError})`,
  );
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => void stop());
}

const productionUrls = publicDeployment?.values ?? {};

start(
  "API",
  process.execPath,
  [
    "--import",
    "./scripts/railway-memory-reporter.mjs",
    "apps/api/dist/main.js",
  ],
  {
    PORT: internalApiPort,
    NODE_ENV: "production",
    // This Railway service owns public webhooks. LOCAL is exclusively owned by
    // pnpm dev:bots and must never be selected by a production deployment.
    TELEGRAM_BOT_RUNTIME_ENVIRONMENT: "PRODUCTION",
    RAILWAY_PROCESS_TYPE: "api",
    ...productionUrls,
  },
  "api",
);

try {
  await waitForInternalApi();
} catch (error) {
  process.stderr.write(
    `[railway] ${error instanceof Error ? error.message : String(error)}\n`,
  );
  await stop(1);
}

start(
  "Web",
  process.execPath,
  [
    "--import",
    "./scripts/railway-memory-reporter.mjs",
    "apps/web/node_modules/next/dist/bin/next",
    "start",
    "apps/web",
  ],
  {
    PORT: publicPort,
    HOSTNAME: "0.0.0.0",
    NODE_ENV: "production",
    RAILWAY_PROCESS_TYPE: "next",
  },
  "next",
);

startMemoryDiagnostics();

process.stdout.write(
  `[railway] Web gateway listening on :${publicPort}; API listening internally on :${internalApiPort}.\n`,
);
if (publicOrigin) {
  process.stdout.write(`[railway] Public Finance app: ${publicOrigin}\n`);
} else {
  process.stderr.write(
    "[railway] RAILWAY_PUBLIC_DOMAIN is unavailable; configure FRONTEND_URL and API_PUBLIC_URL explicitly.\n",
  );
}

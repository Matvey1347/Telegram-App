import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { terminateDevChildren } from "./dev-process-termination.mjs";

const apiDirectory = fileURLToPath(new URL("../apps/api/", import.meta.url));
const nestBinary = fileURLToPath(
  new URL("../apps/api/node_modules/@nestjs/cli/bin/nest.js", import.meta.url),
);
const apiPort = Number(process.env.PORT || 4000);
const healthUrl = `http://127.0.0.1:${apiPort}/api/health`;
const readinessTimeoutMs = 30_000;
const readinessIntervalMs = 500;
const maximumAutomaticRecoveries = 3;

export function isSuccessfulCompilationLine(line) {
  return /Found 0 errors\. Watching for file changes\./u.test(line);
}

export function isBackendReadyLine(line) {
  return /^\[api\] Ready on http:\/\/localhost:\d+\/api/u.test(line);
}

export async function waitForHealthyBackend({
  url = healthUrl,
  timeoutMs = readinessTimeoutMs,
  intervalMs = readinessIntervalMs,
  fetchImpl = globalThis.fetch,
  delayImpl = delay,
  now = Date.now,
  shouldContinue = () => true,
  acceptsResponse = () => true,
} = {}) {
  const startedAt = now();
  let attempts = 0;
  while (shouldContinue() && now() - startedAt <= timeoutMs) {
    attempts += 1;
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(Math.min(intervalMs, 1_000)),
      });
      if (response.ok && acceptsResponse()) {
        return { attempts, elapsedMs: now() - startedAt };
      }
    } catch {
      // A freshly compiled API temporarily has no listening socket.
    }
    await delayImpl(intervalMs);
  }
  if (!shouldContinue()) return null;
  throw new Error(`backend did not become healthy within ${timeoutMs}ms`);
}

function createLineRelay(stream, destination, onLine) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    destination.write(chunk);
    pending += chunk;
    const lines = pending.split(/\r?\n/u);
    pending = lines.pop() ?? "";
    for (const line of lines) onLine(line);
  });
}

export function runApiSupervisor() {
  let watcher = null;
  let stopping = false;
  let replacingWatcher = false;
  let readinessGeneration = 0;
  let readyRuntimeGeneration = 0;
  let recoveryAttempts = 0;

  const startWatcher = () => {
    if (stopping) return;
    const child = spawn(
      process.execPath,
      [nestBinary, "start", "--watch", "--config", "nest-cli.dev.json"],
      {
        cwd: apiDirectory,
        env: process.env,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    watcher = child;

    const onLine = (line) => {
      if (isBackendReadyLine(line)) {
        readyRuntimeGeneration = readinessGeneration;
        return;
      }
      if (!isSuccessfulCompilationLine(line)) return;
      const generation = ++readinessGeneration;
      readyRuntimeGeneration = 0;
      void waitForHealthyBackend({
        shouldContinue: () =>
          !stopping && generation === readinessGeneration,
        acceptsResponse: () => readyRuntimeGeneration === generation,
      })
        .then((result) => {
          if (!result) return;
          recoveryAttempts = 0;
          process.stdout.write(
            `[api-watch] Backend ready after reload (${result.elapsedMs}ms).\n`,
          );
        })
        .catch(async (error) => {
          if (stopping || generation !== readinessGeneration) return;
          if (recoveryAttempts >= maximumAutomaticRecoveries) {
            process.stderr.write(
              `[api-watch] Automatic backend recovery failed ${maximumAutomaticRecoveries} times: ${error.message}\n`,
            );
            return;
          }
          recoveryAttempts += 1;
          process.stderr.write(
            `[api-watch] Backend reload failed to become healthy; restarting its watcher (${recoveryAttempts}/${maximumAutomaticRecoveries}).\n`,
          );
          await replaceWatcher();
        });
    };
    createLineRelay(child.stdout, process.stdout, onLine);
    createLineRelay(child.stderr, process.stderr, onLine);
    child.once("error", (error) => {
      process.stderr.write(`[api-watch] Backend watcher error: ${error.message}\n`);
    });
    child.once("exit", (code, signal) => {
      if (watcher === child) watcher = null;
      if (stopping || replacingWatcher) return;
      process.stderr.write(
        `[api-watch] Backend watcher stopped (${signal || code}); restarting.\n`,
      );
      setTimeout(startWatcher, 500);
    });
  };

  const replaceWatcher = async () => {
    if (stopping || replacingWatcher) return;
    replacingWatcher = true;
    readinessGeneration += 1;
    const previousWatcher = watcher;
    watcher = null;
    if (previousWatcher) {
      await terminateDevChildren(new Set([previousWatcher]), {
        graceMs: 1_500,
      });
    }
    replacingWatcher = false;
    startWatcher();
  };

  const stop = async () => {
    if (stopping) return;
    stopping = true;
    readinessGeneration += 1;
    if (watcher) {
      await terminateDevChildren(new Set([watcher]), { graceMs: 1_500 });
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
  process.on("SIGHUP", () => void stop());
  startWatcher();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runApiSupervisor();

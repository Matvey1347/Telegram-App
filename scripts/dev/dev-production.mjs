import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createProductionGateway } from "./dev-production-gateway.mjs";
import { operatorConfiguration, operatorIdentity, preflightOperator, preflightOperatorTransport, readOperatorProfile } from "./dev-production-profile.mjs";
import { productionApiOrigin } from "./dev-production-policy.mjs";
import { assertPortAvailable } from "./dev-port-availability.mjs";
import { terminateDevChildren } from "./dev-process-termination.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const webDir = resolve(root, "apps/web");
const apiDir = resolve(root, "apps/api");
const require = createRequire(resolve(webDir, "package.json"));

export function productionWebEnvironment(mode, parent = process.env) {
  const names = ["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "LANG"];
  return {
    ...Object.fromEntries(names.filter((name) => parent[name]).map((name) => [name, parent[name]])),
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_API_URL: "/api",
    NEXT_PUBLIC_DATABASE_ENV: "production",
    NEXT_PUBLIC_NEXELOQ_LIVE_MODE: mode,
  };
}

function portOption(value, fallback) {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1024 || port > 65534) throw new Error("Invalid development port");
  return port;
}

export async function runProductionDevelopment(mode, args) {
  if (!["ui", "operator"].includes(mode)) throw new Error("Choose ui or operator");
  const { values } = parseArgs({
    args,
    options: {
      live: { type: "boolean" }, help: { type: "boolean" },
      "env-file": { type: "string" }, "workspace-id": { type: "string" },
      "channel-id": { type: "string" }, "api-port": { type: "string" }, "web-port": { type: "string" },
    },
  });
  if (values.help || !values.live) {
    console.log(mode === "ui"
      ? "Usage: pnpm dev:prod-ui --live [--web-port PORT]"
      : "Usage: pnpm dev:prod-operator --live [--env-file .codex/tmp/.env.production-operator.local] [--workspace-id ID --channel-id ID]");
    return values.help ? 0 : 1;
  }
  if (readdirSync(webDir).some((name) => /^\.env(?:\.(?:local|development|development\.local))?$/u.test(name))) {
    throw new Error("Move apps/web development env files outside the Next directory before starting a live mode");
  }
  const port = portOption(values["web-port"], mode === "ui" ? 3010 : 3003);
  const nextPort = port + 1;
  if ([port, nextPort].some((value) => [3000, 3001, 4000, 4001, 4002].includes(value))) {
    throw new Error("Choose live web ports outside the ordinary local development range");
  }
  const operatorPort = portOption(values["api-port"], 4003);
  if (mode === "operator" && [port, nextPort].includes(operatorPort)) throw new Error("Choose distinct web and API ports");
  await Promise.all([
    assertPortAvailable(port, "Production web gateway"),
    assertPortAvailable(nextPort, "Production Next.js"),
    ...(mode === "operator" ? [assertPortAvailable(operatorPort, "Production operator API")] : []),
  ]);
  const operator = mode === "operator" ? operatorConfiguration(
    readOperatorProfile(root, values["env-file"] ?? ".codex/tmp/.env.production-operator.local"),
    { workspaceId: values["workspace-id"], channelId: values["channel-id"] },
  ) : undefined;
  if (operator) await Promise.all([preflightOperator(operator), preflightOperatorTransport()]);
  const capability = operator ? randomBytes(32).toString("hex") : undefined;
  const gateway = createProductionGateway({
    mode, port, nextPort, operatorPort, capability, productionOrigin: productionApiOrigin,
    scope: operator?.scope, probeIdentity: operator && operatorIdentity(operator.scope),
  });
  const children = new Set();
  let stopping = false;
  const stop = async (code) => {
    if (stopping) return;
    stopping = true;
    gateway.closeAllConnections();
    gateway.close();
    await terminateDevChildren(children);
    process.exit(code);
  };
  const start = (name, cwd, entry, args, env, ready, preloads = []) => new Promise((started, reject) => {
    const child = spawn(process.execPath, [...preloads, resolve(root, "scripts/dev/dev-live-parent.cjs"), entry, ...args], {
      cwd, env, detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", name === "Next.js" ? "inherit" : "ignore", "ipc"],
    });
    children.add(child);
    let initialized = false;
    let pending = "";
    const timeout = setTimeout(() => reject(new Error(`${name} startup timed out`)), 60_000);
    const exited = () => {
      clearTimeout(timeout);
      if (initialized) void stop(1);
      else reject(new Error(`${name} did not start`));
    };
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      const lines = (pending + chunk).split("\n");
      pending = (lines.pop() ?? "").slice(-8192);
      for (const line of lines) {
        const plain = line.replace(/\x1b\[[0-9;]*m/gu, "");
        if (name === "Next.js" && !/^- (?:Local|Network):/u.test(plain)) process.stdout.write(line + "\n");
        if (!initialized && ready.test(plain)) {
          initialized = true;
          clearTimeout(timeout);
          started();
        }
      }
    });
    child.once("error", exited);
    child.once("exit", exited);
  });

  process.once("SIGINT", () => void stop(0));
  process.once("SIGTERM", () => void stop(0));
  if (process.platform !== "win32") process.once("SIGHUP", () => void stop(0));
  try {
    const webEnvironment = productionWebEnvironment(mode);
    const next = require.resolve("next/dist/bin/next");
    await Promise.all([
      start("Next.js", webDir, next, ["dev", "--hostname", "127.0.0.1", "--port", String(nextPort)], webEnvironment, /Ready in/),
      ...(operator ? [start("Scoped API", apiDir, "src/maintenance/production-recovery.bootstrap.ts", [], {
        ...webEnvironment,
        DATABASE_URL: operator.databaseUrl,
        PRODUCTION_API_URL: `${productionApiOrigin}/api`,
        PRODUCTION_RECOVERY_ENABLED: "true",
        PRODUCTION_RECOVERY_CHANNEL_ID: operator.scope.channelId,
        PRODUCTION_RECOVERY_WORKSPACE_ID: operator.scope.workspaceId,
        PRODUCTION_RECOVERY_USER_ID: operator.scope.userId,
        ...(operator.scope.saleId ? {
          PRODUCTION_RECOVERY_SALE_ID: operator.scope.saleId,
          PRODUCTION_RECOVERY_PLACEMENT_ID: operator.scope.placementId,
        } : {}),
        PRODUCTION_RECOVERY_API_PORT: String(operatorPort),
        PRODUCTION_RECOVERY_CAPABILITY: capability,
      }, /Local scoped API ready on port/, ["-r", "ts-node/register/transpile-only", "-r", "tsconfig-paths/register"])] : []),
    ]);
    await new Promise((resolve, reject) => {
      gateway.once("error", reject);
      gateway.listen(port, "127.0.0.1", resolve);
    });
  } catch (error) {
    reportStartupFailure(error);
    await stop(1);
    return 1;
  }
  console.log(`PRODUCTION — LIVE ACTIONS (${mode})\nOpen http://127.0.0.1:${port}\nStop with Ctrl+C.`);
  return 0;
}

export function reportStartupFailure(error) {
  const message = error?.message;
  const safeMessages = /^(?:Production (?:web gateway|Next\.js|operator API) cannot start because port |Scoped API (?:startup timed out|did not start)$|Next\.js (?:startup timed out|did not start)$|Choose |Invalid development port$|Move apps\/web development env files |Production database fingerprint did not match$|Read-only operator preflight failed\.|Set the exact workspace|Production operator requires |Invalid production database target$|Keep the operator profile|Restrict the profile)/u;
  console.error(typeof message === "string" && safeMessages.test(message)
    ? message
    : "Production development startup failed. Check the private profile and local ports.");
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runProductionDevelopment(process.argv[2], process.argv.slice(3))
    .then((code) => { process.exitCode = code; })
    .catch(reportStartupFailure);
}

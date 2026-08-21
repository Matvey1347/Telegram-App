import { spawn } from "node:child_process";
import {
  createServer as createHttpServer,
  request as httpRequest,
} from "node:http";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { randomBytes } from "node:crypto";

const withCloudflare = process.argv.includes("--cloudflare");
const withBots = process.argv.includes("--bots");
const tunnelTargetPort = Number(process.env.TUNNEL_TARGET_PORT || 3000);
const botGatewayPort = 4100;
const children = new Set();
let stopping = false;
let backendReady = false;
const localDevControlSecret = randomBytes(32).toString("base64url");

function status(name, message) {
  console.log(`✓ ${name}: ${message}`);
}

function failure(name, error) {
  console.error(`✗ ${name}: ${error instanceof Error ? error.message : error}`);
}

async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  if (withBots && backendReady) {
    try {
      const response = await fetch(
        "http://127.0.0.1:4000/api/telegram/bots/runtime/local-development/stop",
        {
          method: "POST",
          headers: { "x-local-dev-control-secret": localDevControlSecret },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!response.ok)
        throw new Error(`cleanup returned HTTP ${response.status}`);
      status("Bot cleanup", "LOCAL links, keyboards and webhooks removed");
    } catch (error) {
      failure("Bot cleanup", error);
    }
  }
  for (const child of children) terminate(child);
  process.exit(exitCode);
}

function terminate(child) {
  if (process.platform !== "win32" && typeof child.pid === "number") {
    try {
      process.kill(-child.pid, "SIGTERM");
      return;
    } catch {
      // The process group may already have exited; fall back to the child.
    }
  }
  child.kill("SIGTERM");
}

async function assertPortAvailable(port, name) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        reject(
          new Error(
            `${name} cannot start because port ${port} is already in use. Stop the existing local process and run this command again.`,
          ),
        );
        return;
      }
      reject(error);
    });
    server.listen(port, "127.0.0.1", () => {
      server.close(resolve);
    });
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => void stop());
}

function relayErrors(name, stream, recentLines, onLine) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      onLine?.(line);
      if (line.trim()) {
        recentLines.push(line);
        if (recentLines.length > 20) recentLines.shift();
      }
      const isBenignCloudflareConfigNotice =
        name === "Cloudflare" &&
        /Cannot determine default configuration path/i.test(line);
      if (
        !isBenignCloudflareConfigNotice &&
        /error|exception|failed|cannot|eaddrinuse/i.test(line)
      ) {
        console.error(`[${name}] ${line}`);
      }
    }
  });
}

function start(name, command, args, env, required = true, onLine) {
  const recentLines = [];
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  children.add(child);
  relayErrors(name, child.stdout, recentLines, onLine);
  relayErrors(name, child.stderr, recentLines, onLine);
  child.once("error", (error) => {
    failure(name, error);
    if (required) void stop(1);
  });
  child.once("exit", (code) => {
    children.delete(child);
    if (!stopping && required) {
      failure(name, `stopped (code ${code ?? "unknown"})`);
      if (recentLines.length) {
        console.error(`[${name}] last output:\n${recentLines.join("\n")}`);
      }
      void stop(code ?? 1);
    }
    if (!stopping && !required) {
      failure(name, `stopped (code ${code ?? "unknown"})`);
    }
  });
  return child;
}

async function waitFor(name, url) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch {
      // The process is still compiling or connecting to its dependencies.
    }
    await delay(250);
  }
  throw new Error(`did not become ready at ${url}`);
}

async function activateLocalBots() {
  const response = await fetch(
    "http://127.0.0.1:4000/api/telegram/bots/runtime/local-development/start",
    {
      method: "POST",
      headers: { "x-local-dev-control-secret": localDevControlSecret },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(`LOCAL bot activation returned HTTP ${response.status}`);
  }
  status("Bot activation", "LOCAL webhooks and Mini App links reconciled");
}

async function assertCloudflaredAvailable() {
  await new Promise((resolve, reject) => {
    const child = spawn("cloudflared", ["--version"], {
      stdio: "ignore",
    });
    child.once("error", () =>
      reject(
        new Error(
          "cloudflared is not installed. On macOS run: brew install cloudflared",
        ),
      ),
    );
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("cloudflared --version failed")),
    );
  });
}

async function startCloudflareTunnel() {
  await assertCloudflaredAvailable();
  const targetPort = withBots ? botGatewayPort : tunnelTargetPort;
  let resolveUrl;
  let urlTimeout;
  const publicUrl = new Promise((resolve, reject) => {
    resolveUrl = (url) => {
      clearTimeout(urlTimeout);
      resolve(url);
    };
    urlTimeout = setTimeout(
      () => reject(new Error("did not create a Cloudflare HTTPS tunnel")),
      30_000,
    );
    urlTimeout.unref();
  });
  start(
    "Cloudflare",
    "cloudflared",
    ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${targetPort}`],
    {},
    true,
    (line) => {
      const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/iu);
      if (match) resolveUrl?.(match[0]);
    },
  );
  const url = await publicUrl;
  status("Cloudflare Tunnel", url);
  console.log(
    `  Tunnel target: http://localhost:${targetPort}${withBots ? " (API + Mini App gateway)" : tunnelTargetPort === 4000 ? "/api" : ""}`,
  );
  console.log(
    `  ${withBots ? "Telegram Mini Apps call this HTTPS URL; the browser app calls" : "The local web app continues to call"} ${withBots ? `${url}/api` : "http://localhost:4000/api"}.`,
  );
  return url;
}

function startBotGateway() {
  const gateway = createHttpServer((incoming, outgoing) => {
    const targetPort = incoming.url?.startsWith("/api") ? 4000 : 3000;
    const proxy = httpRequest(
      {
        host: "127.0.0.1",
        port: targetPort,
        method: incoming.method,
        path: incoming.url,
        // Connect to the local target without rewriting the browser-facing
        // Host header. Next uses that host while constructing its App Router
        // response; replacing it with 127.0.0.1 prevents the public/gateway
        // page from hydrating even though every chunk returns 200.
        headers: incoming.headers,
      },
      (response) => {
        outgoing.writeHead(response.statusCode || 502, response.headers);
        response.pipe(outgoing);
      },
    );
    proxy.on("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end("Local development service is not ready yet.");
    });
    incoming.pipe(proxy);
  });
  gateway.listen(botGatewayPort, "127.0.0.1");
  children.add({ kill: () => gateway.close() });
  status("Mini App gateway", `http://localhost:${botGatewayPort}`);
}

console.log("Starting local development…");
try {
  await Promise.all([
    assertPortAvailable(4000, "Backend"),
    assertPortAvailable(3000, "Frontend"),
    ...(withBots
      ? [assertPortAvailable(botGatewayPort, "Mini App gateway")]
      : []),
  ]);
} catch (error) {
  failure("Local development", error);
  process.exit(1);
}
if (withBots) startBotGateway();
let publicApiUrl = null;
try {
  publicApiUrl = withCloudflare ? await startCloudflareTunnel() : null;
} catch (error) {
  failure("Cloudflare Tunnel", error);
}
if (withBots && !publicApiUrl) {
  failure(
    "Bot development",
    "requires an HTTPS Cloudflare Tunnel so Telegram can deliver webhook updates.",
  );
  await stop(1);
}
start("Backend", "pnpm", ["--filter", "api", "dev"], {
  // The consumer Web App must return through the public gateway after a
  // Telegram Login Widget callback. Dashboard CORS still explicitly permits
  // localhost, so internal development remains available there.
  FRONTEND_URL:
    withBots && publicApiUrl ? publicApiUrl : "http://localhost:3000",
  TELEGRAM_SYSTEM_BOT_ENVIRONMENT: withBots ? "LOCAL" : "",
  TELEGRAM_BOT_RUNTIME_ENVIRONMENT: withBots ? "LOCAL" : "",
  LOCAL_DEV_BOTS_CONTROL_SECRET: withBots ? localDevControlSecret : "",
  ...(publicApiUrl ? { TELEGRAM_BOT_WEBHOOK_BASE_URL: publicApiUrl } : {}),
  ...(withBots && publicApiUrl
    ? {
        API_PUBLIC_URL: publicApiUrl,
        PUBLIC_API_URL: publicApiUrl,
        TELEGRAM_SYSTEM_BOT_WEBHOOK_BASE_URL: publicApiUrl,
        FINANCE_MINI_APP_URL: publicApiUrl,
      }
    : {}),
});
start("Frontend", "pnpm", ["--filter", "web", "dev"], {
  // localhost:3000 always talks directly to the local API. Consumer pages
  // opened through localhost:4100 or Cloudflare resolve their own same-origin /api.
  NEXT_PUBLIC_API_URL: "http://localhost:4000/api",
  NEXT_ALLOWED_DEV_ORIGIN: publicApiUrl || "",
});

try {
  const backendStartup = waitFor(
    "Backend",
    "http://127.0.0.1:4000/api/health",
  ).then(() => {
    backendReady = true;
    return withBots ? activateLocalBots() : undefined;
  });
  await Promise.all([
    backendStartup,
    waitFor("Frontend", "http://127.0.0.1:3000"),
  ]);
  status("Backend", "http://localhost:4000/api");
  status("Frontend", "http://localhost:3000");
  if (withBots)
    console.log(
      "✓ Bot webhooks: LOCAL workspace runtimes and the LOCAL System Bot use this Cloudflare URL; PRODUCTION credentials are never selected. Changed Finance Mini App links are refreshed automatically.",
    );
  if (!withCloudflare) console.log("○ Cloudflare Tunnel: disabled");
} catch (error) {
  failure("Local development", error);
  await stop(1);
}

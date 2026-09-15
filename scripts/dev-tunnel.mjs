import { spawn } from "node:child_process";
import {
  createServer as createHttpServer,
  request as httpRequest,
} from "node:http";
import { connect as connectToUpstream, createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { assertPortAvailable } from "./dev-port-availability.mjs";
import { terminateDevChildren } from "./dev-process-termination.mjs";
import { waitForHttpReady } from "./dev-service-readiness.mjs";
import { localBotPublicEnvironment } from "./public-origin-environment.mjs";
import { extractCloudflareQuickTunnelUrl } from "./dev-cloudflare-tunnel.mjs";

const withCloudflare = process.argv.includes("--cloudflare");
const withWorkspaceBots = process.argv.includes("--bots");
const withSystemBot =
  withWorkspaceBots || process.argv.includes("--system-bot");
const withBotRuntime = withWorkspaceBots || withSystemBot;
const tunnelTargetPort = Number(process.env.TUNNEL_TARGET_PORT || 3000);
const botGatewayPort = 4100;
const localBotActivationTimeoutMs = 5 * 60_000;
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
  if (withWorkspaceBots && backendReady) {
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
  await terminateDevChildren(children);
  process.exit(exitCode);
}

for (const signal of [
  "SIGINT",
  "SIGTERM",
  ...(process.platform === "win32" ? [] : ["SIGHUP"]),
]) {
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
      if (line.startsWith("[api-watch]")) {
        console.log(`[${name}] ${line}`);
      } else if (
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
    if (typeof required === "function" ? required() : required) void stop(1);
  });
  child.once("exit", (code) => {
    children.delete(child);
    const isRequired = typeof required === "function" ? required() : required;
    if (!stopping && isRequired) {
      failure(name, `stopped (code ${code ?? "unknown"})`);
      if (recentLines.length) {
        console.error(`[${name}] last output:\n${recentLines.join("\n")}`);
      }
      void stop(code ?? 1);
    }
    if (!stopping && !isRequired) {
      failure(name, `stopped (code ${code ?? "unknown"})`);
    }
  });
  return child;
}

function runOnce(name, command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const recentLines = [];
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    relayErrors(name, child.stdout, recentLines);
    relayErrors(name, child.stderr, recentLines);
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `stopped (code ${code ?? "unknown"})${recentLines.length ? `\n${recentLines.join("\n")}` : ""}`,
        ),
      );
    });
  });
}

async function activateLocalBots() {
  const response = await fetch(
    "http://127.0.0.1:4000/api/telegram/bots/runtime/local-development/start",
    {
      method: "POST",
      headers: { "x-local-dev-control-secret": localDevControlSecret },
      signal: AbortSignal.timeout(localBotActivationTimeoutMs),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const message = detail
      .replace(/\s+/g, " ")
      .replace(/[\r\n]/g, " ")
      .slice(0, 240);
    throw new Error(
      `LOCAL bot activation returned HTTP ${response.status}${message ? `: ${message}` : ""}`,
    );
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
  const targetPort = withBotRuntime ? botGatewayPort : tunnelTargetPort;
  let lastError;
  let url = null;
  for (let attempt = 1; attempt <= 3 && !url; attempt += 1) {
    let ready = false;
    let child;
    try {
      url = await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          callback(value);
        };
        const timeout = setTimeout(() => {
          child?.kill("SIGTERM");
          finish(
            reject,
            new Error("cloudflared did not return a quick Tunnel URL in 45s"),
          );
        }, 45_000);
        timeout.unref();
        child = start(
          "Cloudflare",
          "cloudflared",
          [
            "tunnel",
            "--no-autoupdate",
            "--url",
            `http://127.0.0.1:${targetPort}`,
          ],
          { TUNNEL_TRANSPORT_PROTOCOL: "http2" },
          () => ready,
          (line) => {
            const publicUrl = extractCloudflareQuickTunnelUrl(line);
            if (!publicUrl) return;
            ready = true;
            finish(resolve, publicUrl);
          },
        );
        child.once("error", (error) => finish(reject, error));
        child.once("exit", (code) =>
          finish(
            reject,
            new Error(
              `cloudflared stopped before creating a tunnel (code ${code ?? "unknown"})`,
            ),
          ),
        );
      });
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        console.warn(
          `○ Cloudflare Tunnel: attempt ${attempt}/3 failed; retrying…`,
        );
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
  }
  if (!url) {
    throw new Error(
      `could not create a quick Tunnel after 3 attempts: ${lastError instanceof Error ? lastError.message : "unknown error"}`,
    );
  }
  status("Cloudflare Tunnel", url);
  console.log(
    `  Tunnel target: http://localhost:${targetPort}${withBotRuntime ? " (API + web gateway)" : tunnelTargetPort === 4000 ? "/api" : ""}`,
  );
  console.log(
    `  ${withBotRuntime ? "Telegram calls this HTTPS URL; the localhost browser continues to call http://localhost:4000/api directly." : "The local web app continues to call http://localhost:4000/api."}`,
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
  // Next's development client opens a WebSocket before it hydrates App Router
  // client components. A plain HTTP-only proxy leaves the Finance page as
  // inert server HTML forever: no effects, click handlers, or API requests.
  gateway.on("upgrade", (incoming, socket, head) => {
    const targetPort = incoming.url?.startsWith("/api") ? 4000 : 3000;
    const upstream = connectToUpstream(targetPort, "127.0.0.1");
    let connected = false;

    const closeWithBadGateway = () => {
      upstream.destroy();
      if (!socket.destroyed) {
        if (!connected) {
          socket.write("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
        }
        socket.destroy();
      }
    };

    upstream.once("connect", () => {
      connected = true;
      const rawHeaders = [];
      for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
        rawHeaders.push(
          `${incoming.rawHeaders[index]}: ${incoming.rawHeaders[index + 1]}`,
        );
      }
      upstream.write(
        `${incoming.method} ${incoming.url} HTTP/${incoming.httpVersion}\r\n${rawHeaders.join("\r\n")}\r\n\r\n`,
      );
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.once("error", closeWithBadGateway);
    socket.once("error", () => upstream.destroy());
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
    ...(withBotRuntime
      ? [assertPortAvailable(botGatewayPort, "Bot gateway")]
      : []),
  ]);
} catch (error) {
  failure("Local development", error);
  process.exit(1);
}

try {
  // Nest watches application sources, but it cannot regenerate Prisma's
  // generated TypeScript contract after schema.prisma changes. Generate once
  // before compilation and keep Prisma's own watcher beside Nest so schema
  // edits recover without restarting the whole local-bot stack.
  await runOnce("Prisma", "pnpm", [
    "--filter",
    "api",
    "exec",
    "prisma",
    "generate",
    "--no-hints",
  ]);
  start("Prisma", "pnpm", [
    "--filter",
    "api",
    "exec",
    "prisma",
    "generate",
    "--watch",
    "--no-hints",
  ]);
  status("Prisma", "client generated; schema watcher active");
} catch (error) {
  failure("Prisma", error);
  await stop(1);
}
if (withBotRuntime) startBotGateway();
let publicApiUrl = null;
try {
  publicApiUrl = withCloudflare ? await startCloudflareTunnel() : null;
} catch (error) {
  failure("Cloudflare Tunnel", error);
}
if (withBotRuntime && !publicApiUrl) {
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
    withBotRuntime && publicApiUrl ? publicApiUrl : "http://localhost:3000",
  TELEGRAM_SYSTEM_BOT_ENVIRONMENT: withSystemBot ? "LOCAL" : "",
  TELEGRAM_BOT_RUNTIME_ENVIRONMENT: withWorkspaceBots ? "LOCAL" : "",
  LOCAL_DEV_BOTS_CONTROL_SECRET: withWorkspaceBots ? localDevControlSecret : "",
  ...(withBotRuntime && publicApiUrl
    ? {
        ...localBotPublicEnvironment(publicApiUrl),
      }
    : {}),
});
start(
  "Frontend",
  "pnpm",
  ["--filter", "web", "exec", "next", "dev", "--port", "3000"],
  {
    // localhost:3000 talks directly to the configured local API. Any public
    // HTTPS page receiving this loopback URL resolves API calls to same-origin
    // /api, without a product-specific origin list or tunnel-vendor check.
    NEXT_PUBLIC_API_URL: "http://localhost:4000/api",
    NEXT_ALLOWED_DEV_ORIGIN: publicApiUrl || "",
  },
);

try {
  const backendStartup = waitForHttpReady(
    "http://127.0.0.1:4000/api/health",
  ).then(() => {
    backendReady = true;
    return withWorkspaceBots ? activateLocalBots() : undefined;
  });
  await Promise.all([
    backendStartup,
    waitForHttpReady("http://127.0.0.1:3000"),
  ]);
  status("Backend", "http://localhost:4000/api");
  status("Frontend", "http://localhost:3000");
  if (withWorkspaceBots)
    console.log(
      "✓ Bot webhooks: LOCAL workspace runtimes and the LOCAL System Bot use this Cloudflare URL; PRODUCTION credentials are never selected. Changed Finance Mini App links are refreshed automatically.",
    );
  else if (withSystemBot)
    console.log(
      "✓ System Bot webhook: the LOCAL System Bot uses this Cloudflare URL; workspace bot runtimes and PRODUCTION credentials are not selected.",
    );
  if (!withCloudflare) console.log("○ Cloudflare Tunnel: disabled");
} catch (error) {
  failure("Local development", error);
  await stop(1);
}

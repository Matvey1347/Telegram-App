import { spawn } from "node:child_process";
import {
  createServer as createHttpServer,
  request as httpRequest,
} from "node:http";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const withNgrok = process.argv.includes("--ngrok");
const withBots = process.argv.includes("--bots");
const ngrokTargetPort = Number(process.env.NGROK_TARGET_PORT || 3000);
const botGatewayPort = 4100;
const children = new Set();
let stopping = false;

function status(name, message) {
  console.log(`✓ ${name}: ${message}`);
}

function failure(name, error) {
  console.error(`✗ ${name}: ${error instanceof Error ? error.message : error}`);
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exit(exitCode);
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
  process.on(signal, () => stop());
}

function relayErrors(name, stream, recentLines) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) {
        recentLines.push(line);
        if (recentLines.length > 20) recentLines.shift();
      }
      if (/error|exception|failed|cannot|eaddrinuse/i.test(line)) {
        console.error(`[${name}] ${line}`);
      }
    }
  });
}

function start(name, command, args, env, required = true) {
  const recentLines = [];
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  relayErrors(name, child.stdout, recentLines);
  relayErrors(name, child.stderr, recentLines);
  child.once("error", (error) => {
    failure(name, error);
    if (required) stop(1);
  });
  child.once("exit", (code) => {
    children.delete(child);
    if (!stopping && required) {
      failure(name, `stopped (code ${code ?? "unknown"})`);
      if (recentLines.length) {
        console.error(`[${name}] last output:\n${recentLines.join("\n")}`);
      }
      stop(code ?? 1);
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

async function ngrokUrl() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:4040/api/tunnels");
      const payload = response.ok ? await response.json() : null;
      const tunnel = payload?.tunnels?.find(
        (item) => item.proto === "https" && item.public_url,
      );
      if (tunnel) return tunnel.public_url.replace(/\/$/, "");
    } catch {
      // ngrok has not opened its local inspection API yet.
    }
    await delay(250);
  }
  throw new Error("did not create an HTTPS tunnel");
}

async function startNgrok() {
  start(
    "ngrok",
    "ngrok",
    [
      "http",
      String(withBots ? botGatewayPort : ngrokTargetPort),
      "--log",
      "stdout",
    ],
    {},
    false,
  );
  try {
    const publicUrl = await ngrokUrl();
    status("ngrok", publicUrl);
    console.log(
      `  Tunnel target: http://localhost:${withBots ? botGatewayPort : ngrokTargetPort}${withBots ? " (API + Mini App gateway)" : ngrokTargetPort === 4000 ? "/api" : ""}`,
    );
    console.log(
      `  ${withBots ? "Telegram Mini Apps call this HTTPS URL; the browser app calls" : "The local web app continues to call"} ${withBots ? `${publicUrl}/api` : "http://localhost:4000/api"}.`,
    );
    return publicUrl;
  } catch (error) {
    failure("ngrok", error);
    return null;
  }
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
        headers: { ...incoming.headers, host: `127.0.0.1:${targetPort}` },
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
const publicApiUrl = withNgrok ? await startNgrok() : null;
if (withBots && !publicApiUrl) {
  failure(
    "Bot development",
    "requires an HTTPS ngrok tunnel so Telegram can deliver webhook updates.",
  );
  stop(1);
}
start("Backend", "pnpm", ["--filter", "api", "dev"], {
  FRONTEND_URL: "http://localhost:3000",
  TELEGRAM_SYSTEM_BOT_ENVIRONMENT: withBots ? "LOCAL" : "",
  TELEGRAM_BOT_RUNTIME_ENVIRONMENT: withBots ? "LOCAL" : "",
  ...(publicApiUrl ? { TELEGRAM_BOT_WEBHOOK_BASE_URL: publicApiUrl } : {}),
  ...(withBots && publicApiUrl
    ? {
        TELEGRAM_SYSTEM_BOT_WEBHOOK_BASE_URL: publicApiUrl,
        FINANCE_MINI_APP_URL: publicApiUrl,
      }
    : {}),
});
start("Frontend", "pnpm", ["--filter", "web", "dev"], {
  NEXT_PUBLIC_API_URL: publicApiUrl
    ? `${publicApiUrl}/api`
    : "http://localhost:4000/api",
});

try {
  await Promise.all([
    waitFor("Backend", "http://127.0.0.1:4000/api/health"),
    waitFor("Frontend", "http://127.0.0.1:3000"),
  ]);
  status("Backend", "http://localhost:4000/api");
  status("Frontend", "http://localhost:3000");
  if (withBots)
    console.log(
      "✓ Bot webhooks: LOCAL workspace runtimes and the LOCAL System Bot use this ngrok URL; PRODUCTION credentials are never selected. Send /start once to refresh the Finance keyboard; 📱 Open Finance will then open the Mini App.",
    );
  if (!withNgrok)
    console.log(
      "○ ngrok: disabled (run pnpm dev:ngrok or pnpm dev:webhook when needed)",
    );
} catch (error) {
  failure("Local development", error);
  stop(1);
}

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { assertPortAvailable } from "./dev-port-availability.mjs";
import { terminateDevChildren } from "./dev-process-termination.mjs";
import { waitForHttpReady } from "./dev-service-readiness.mjs";
import { extractCloudflareQuickTunnelUrl } from "./dev-cloudflare-tunnel.mjs";
import { localBotPublicEnvironment } from "./public-origin-environment.mjs";
import {
  createDevTerminalDashboard,
  createOutputCapture,
} from "./dev-terminal-dashboard.mjs";

export const LOCAL_PRODUCTS = {
  nexeloq: {
    ports: [
      [4000, "Nexeloq API"],
      [3000, "Nexeloq Web"],
    ],
    processes: [
      {
        name: "Nexeloq API",
        dashboardLabel: "API · :4000",
        readyUrl: "http://127.0.0.1:4000/api/health",
        args: ["--filter", "api", "dev"],
        env: {
          // The root .env may be configured for a different local API. Keep
          // the Nexeloq host pinned to its declared, non-overlapping port.
          API_PORT: "4000",
          NEXT_PUBLIC_API_URL: "http://localhost:4000/api",
          FRONTEND_URL: "http://localhost:3000",
          TELEGRAM_SYSTEM_BOT_ENVIRONMENT: "",
        },
      },
      {
        name: "Nexeloq Web",
        // Keep the label short so the full localhost URL fits on one terminal
        // line and is detected as a complete clickable link.
        dashboardLabel: "Web",
        localUrl: "http://localhost:3000",
        webReadyUrl: "http://127.0.0.1:3000",
        args: ["--filter", "web", "exec", "next", "dev", "--port", "3000"],
        env: { NEXT_PUBLIC_API_URL: "http://localhost:4000/api" },
      },
    ],
  },
  finance: {
    ports: [
      [4001, "Finance API"],
      [4002, "Finance analytics API"],
      [3001, "Finance Web"],
    ],
    processes: [
      {
        name: "Finance API",
        dashboardLabel: "API · :4001",
        readyUrl: "http://127.0.0.1:4001/api/health",
        // Consumer Finance still exposes its complete product contract from
        // the product module. Do not start the incomplete host scaffold here:
        // it only has the demo /finance routes and returns 404 for every
        // real /finance-bots/:id endpoint used by Finance Web.
        args: ["--filter", "api", "dev"],
        env: {
          API_PORT: "4001",
          FRONTEND_URL: "http://localhost:3001",
          TELEGRAM_SYSTEM_BOT_ENVIRONMENT: "",
          TELEGRAM_BOT_RUNTIME_ENVIRONMENT: "",
        },
      },
      {
        name: "Finance analytics API",
        dashboardLabel: "Analytics · :4002",
        readyUrl: "http://127.0.0.1:4002/api/health",
        args: ["--filter", "finance-api", "start:dev"],
        // The compatibility API remains on 4001 until the complete Finance
        // browser contract moves to its independent host. The analytics read
        // model already belongs to that host, so it runs alongside it locally.
        // The standalone host's webhook belongs to an HTTPS tunnel or its
        // deployed public origin. Ordinary local development has neither, so
        // prevent a startup call to Telegram using a stale deployed URL.
        env: { PORT: "4002", FINANCE_API_PUBLIC_URL: "" },
      },
      {
        name: "Finance Web",
        // Keep the label short so the full localhost URL fits on one terminal
        // line and is detected as a complete clickable link.
        dashboardLabel: "Web",
        localUrl: "http://localhost:3001",
        webReadyUrl: "http://127.0.0.1:3001/health",
        args: ["--filter", "@telegram-system/finance-web", "dev"],
        env: {
          // A checked-in/local Finance profile can contain the public API URL
          // for deployments. Local Web must always use its same-origin proxy,
          // otherwise context is read from :4001 while session and product
          // requests are sent to a different production API.
          NEXT_PUBLIC_FINANCE_API_URL: "/api",
          FINANCE_API_PROXY: "true",
          FINANCE_ALLOWED_DEV_ORIGIN: "http://localhost:3001",
        },
      },
    ],
  },
};

const FINANCE_API_REQUIRED_KEYS = [
  "FINANCE_DATABASE_URL",
  "FINANCE_SESSION_SIGNING_KEY",
  "FINANCE_BOOTSTRAP_SIGNING_KEY",
];

const FINANCE_WEB_PUBLIC_KEYS = new Set([
  "NEXT_PUBLIC_FINANCE_API_URL",
  "FINANCE_API_PROXY",
  "FINANCE_ALLOWED_DEV_ORIGIN",
]);

const FINANCE_API_RUNTIME_KEYS = new Set([
  "FINANCE_BOT_RUNTIME_ENVIRONMENT",
  "FINANCE_BOT_LOCAL_USERNAME",
  "FINANCE_BOT_PRODUCTION_USERNAME",
]);

const FINANCE_LOCAL_BOT_RUNTIME_KEYS = new Set([
  "FINANCE_BOT_LOCAL_USERNAME",
  "FINANCE_BOT_LOCAL_TOKEN",
]);

function financeProfileEnvironment(profilePath, allowedKeys) {
  if (!existsSync(profilePath)) return {};
  return Object.fromEntries(
    readFileSync(profilePath, "utf8")
      .split(/\r?\n/u)
      .flatMap((line) => {
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
        if (!match || !allowedKeys.has(match[1])) return [];
        return [[match[1], match[2].trim().replace(/^(['"])(.*)\1$/u, "$2")]];
      }),
  );
}

export function financeWebEnvironment(
  profilePath = "products/finance/.env.local",
) {
  return financeProfileEnvironment(profilePath, FINANCE_WEB_PUBLIC_KEYS);
}

export function financeApiEnvironment(
  profilePath = "products/finance/.env.local",
) {
  const profile = financeProfileEnvironment(
    profilePath,
    FINANCE_API_RUNTIME_KEYS,
  );
  const runtime = profile.FINANCE_BOT_RUNTIME_ENVIRONMENT?.toUpperCase();
  const usernameKey = runtime ? `FINANCE_BOT_${runtime}_USERNAME` : undefined;
  const username = usernameKey ? profile[usernameKey] : undefined;
  return {
    TELEGRAM_BOT_RUNTIME_ENVIRONMENT:
      runtime === "LOCAL" || runtime === "PRODUCTION" ? runtime : "",
    // Finance browser login must target the bot selected in Finance's own
    // profile, rather than a possibly stale username stored in the shared
    // platform runtime record. The token is deliberately not passed through.
    FINANCE_BROWSER_LOGIN_BOT_USERNAME: username || "",
  };
}

/** Pass the selected local bot credential only to the local API process. */
export function financeLocalBotRuntimeEnvironment(
  profilePath = "products/finance/.env.local",
) {
  return financeProfileEnvironment(profilePath, FINANCE_LOCAL_BOT_RUNTIME_KEYS);
}

export function assertFinanceLocalProfile(
  environment = process.env,
  profilePath = "products/finance/.env.local",
) {
  const profileKeys = existsSync(profilePath)
    ? new Set(
        readFileSync(profilePath, "utf8")
          .split(/\r?\n/u)
          .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/u)?.[1])
          .filter(Boolean),
      )
    : new Set();
  const missing = FINANCE_API_REQUIRED_KEYS.filter(
    (key) => !environment[key] && !profileKeys.has(key),
  );
  if (missing.length) {
    throw new Error(
      "Finance profile is incomplete. Copy products/finance/.env.example to products/finance/.env.local and configure its required values.",
    );
  }
}

export function selectedProducts(mode) {
  if (mode === "nexeloq" || mode === "finance") return [mode];
  if (mode === "all") return ["nexeloq", "finance"];
  throw new Error("Usage: node scripts/dev-products.mjs <nexeloq|finance|all>");
}

const mode = process.argv[2];
const withCloudflare = process.argv.includes("--cloudflare");
// System Bot traffic is an explicit opt-in: it needs the HTTPS tunnel so
// Telegram can reach the local webhook. Keep ordinary local development
// disabled, but make the all-products tunnel usable from the post editor.
const withSystemBot = process.argv.includes("--system-bot");
let stopping = false;
const children = new Set();
let dashboard;
const tunnelOrigins = new Map();
const localDevControlSecret = randomBytes(32).toString("base64url");
let financeLocalBotActivated = false;

async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  dashboard?.dispose();
  if (financeLocalBotActivated) {
    await fetch(
      "http://127.0.0.1:4001/api/telegram/bots/runtime/local-development/stop",
      {
        method: "POST",
        headers: { "x-local-dev-control-secret": localDevControlSecret },
        signal: AbortSignal.timeout(15_000),
      },
    ).catch(() => undefined);
  }
  await terminateDevChildren(children);
  process.exit(exitCode);
}

function serviceId(product, name) {
  return `${product}-${name.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}`;
}

function cloudflareServiceId(product) {
  return `${product}-cloudflare`;
}

export function tunnelProcessEnvironment(product, name, publicUrl) {
  if (!publicUrl) return {};

  if (product === "nexeloq") {
    if (name === "Nexeloq API") return { FRONTEND_URL: publicUrl };
    if (name === "Nexeloq Web") {
      return {
        NEXT_PUBLIC_API_URL: "/api",
        NEXT_ALLOWED_DEV_ORIGIN: publicUrl,
        RAILWAY_API_PROXY: "true",
      };
    }
  }

  if (product === "finance") {
    if (name === "Finance API") return { FRONTEND_URL: publicUrl };
    if (name === "Finance Web") {
      return {
        NEXT_PUBLIC_FINANCE_API_URL: "/api",
        FINANCE_API_PROXY: "true",
        FINANCE_ALLOWED_DEV_ORIGIN: publicUrl,
      };
    }
  }

  return {};
}

function start(product, definition) {
  const { name, args, env } = definition;
  const id = serviceId(product, name);
  const financeWebEnvironmentVariables =
    name === "Finance Web" ? financeWebEnvironment() : {};
  const financeApiEnvironmentVariables =
    name === "Finance API" ? financeApiEnvironment() : {};
  const localFinanceBotEnvironment =
    name === "Finance API" && withCloudflare
      ? financeLocalBotRuntimeEnvironment()
      : {};
  const financeTunnelEnvironment =
    name === "Finance API" && withCloudflare
      ? {
          LOCAL_DEV_BOTS_CONTROL_SECRET: localDevControlSecret,
          ...localBotPublicEnvironment(tunnelOrigins.get("finance")),
        }
      : {};
  const systemBotTunnelEnvironment =
    name === "Nexeloq API" && withSystemBot
      ? localBotPublicEnvironment(tunnelOrigins.get("nexeloq"))
      : {};
  const systemBotEnvironment =
    name === "Nexeloq API"
      ? { TELEGRAM_SYSTEM_BOT_ENVIRONMENT: withSystemBot ? "LOCAL" : "" }
      : {};
  const child = spawn("pnpm", args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...financeWebEnvironmentVariables,
      ...env,
      ...financeApiEnvironmentVariables,
      ...localFinanceBotEnvironment,
      ...financeTunnelEnvironment,
      ...tunnelProcessEnvironment(product, name, tunnelOrigins.get(product)),
      ...systemBotTunnelEnvironment,
      ...systemBotEnvironment,
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  const capture = createOutputCapture({
    onDiagnostic: (message) => {
      if (!stopping) dashboard?.update(id, "failed", message);
    },
  });
  child.stdout?.on("data", (chunk) => capture.write(chunk));
  child.stderr?.on("data", (chunk) => capture.write(chunk));
  children.add(child);
  dashboard?.update(id, "starting", "Starting");
  child.once("error", (error) => {
    dashboard?.fail(id, error, capture.recentLines());
    void stop(1);
  });
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (stopping) return;
    dashboard?.fail(
      id,
      new Error(`Stopped (${signal || `code ${code ?? 1}`})`),
      capture.recentLines(),
    );
    void stop(code ?? 1);
  });
  return { id, definition };
}

async function activateFinanceLocalBot() {
  const headers = { "x-local-dev-control-secret": localDevControlSecret };
  const synchronize = await fetch(
    "http://127.0.0.1:4001/api/finance/local-development/synchronize-bot",
    { method: "POST", headers, signal: AbortSignal.timeout(60_000) },
  );
  if (!synchronize.ok) {
    const detail = (await synchronize.text().catch(() => ""))
      .replace(/\s+/g, " ")
      .slice(0, 240);
    throw new Error(
      `Finance LOCAL bot synchronization returned HTTP ${synchronize.status}${detail ? `: ${detail}` : ""}`,
    );
  }
  const activate = await fetch(
    "http://127.0.0.1:4001/api/telegram/bots/runtime/local-development/start",
    { method: "POST", headers, signal: AbortSignal.timeout(5 * 60_000) },
  );
  if (!activate.ok) {
    throw new Error(`Finance LOCAL bot activation returned HTTP ${activate.status}`);
  }
  financeLocalBotActivated = true;
}

async function assertCloudflaredAvailable() {
  await new Promise((resolve, reject) => {
    const child = spawn("cloudflared", ["--version"], { stdio: "ignore" });
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

async function startCloudflareTunnel(product, port) {
  const id = cloudflareServiceId(product);
  dashboard?.update(id, "starting", "Starting");
  const child = spawn(
    "cloudflared",
    ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`],
    {
      cwd: process.cwd(),
      env: { ...process.env, TUNNEL_TRANSPORT_PROTOCOL: "http2" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    },
  );
  children.add(child);

  const publicUrl = await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(
        reject,
        new Error("cloudflared did not return a Quick Tunnel URL in 45s"),
      );
    }, 45_000);
    timeout.unref();
    let pendingOutput = "";
    const inspect = (chunk) => {
      pendingOutput += chunk.toString();
      const lines = pendingOutput.split(/\r?\n/u);
      pendingOutput = lines.pop() ?? "";
      for (const line of lines) {
        const url = extractCloudflareQuickTunnelUrl(line);
        if (url) finish(resolve, url);
      }
    };
    child.stdout?.on("data", inspect);
    child.stderr?.on("data", inspect);
    child.once("error", (error) => finish(reject, error));
    child.once("exit", (code) => {
      children.delete(child);
      finish(
        reject,
        new Error(
          `cloudflared stopped before creating a tunnel (code ${code ?? "unknown"})`,
        ),
      );
      if (!stopping && settled) {
        dashboard?.fail(id, new Error(`Stopped (code ${code ?? "unknown"})`));
        void stop(code ?? 1);
      }
    });
  });

  dashboard?.update(id, "ready", publicUrl);
  return publicUrl;
}

async function startProduct(product) {
  const definitions = LOCAL_PRODUCTS[product].processes;
  const backends = definitions.filter((definition) => definition.readyUrl);

  const startedBackends = backends.map((backend) => start(product, backend));
  await Promise.all(
    startedBackends.map(async ({ id, definition }) => {
      await waitForHttpReady(definition.readyUrl);
      dashboard?.update(id, "ready", definition.localUrl || "Ready");
    }),
  );

  for (const definition of definitions) {
    if (!definition.readyUrl) {
      const started = start(product, definition);
      if (definition.webReadyUrl) {
        await waitForHttpReady(definition.webReadyUrl);
        dashboard?.update(started.id, "ready", definition.localUrl || "Ready");
      }
    }
  }
  if (product === "finance" && withCloudflare) {
    await activateFinanceLocalBot();
    dashboard?.notice("✓ Finance bot: LOCAL webhook and Mini App links reconciled");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let products;
  try {
    products = selectedProducts(mode);
    if (products.includes("finance")) assertFinanceLocalProfile();
    await Promise.all(
      products.flatMap((product) =>
        LOCAL_PRODUCTS[product].ports.map(([port, name]) =>
          assertPortAvailable(port, name),
        ),
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  for (const signal of [
    "SIGINT",
    "SIGTERM",
    ...(process.platform === "win32" ? [] : ["SIGHUP"]),
  ]) {
    process.on(signal, () => void stop());
  }

  dashboard = createDevTerminalDashboard({
    title: "Local development",
    columns: [
      { id: "nexeloq", label: "Nexeloq" },
      { id: "finance", label: "Finance" },
    ],
  });
  for (const product of products) {
    for (const definition of LOCAL_PRODUCTS[product].processes) {
      dashboard.register(serviceId(product, definition.name), {
        column: product,
        label: definition.dashboardLabel || definition.name,
      });
    }
    if (withCloudflare) {
      dashboard.register(cloudflareServiceId(product), {
        column: product,
        label: "Cloudflare",
      });
    }
  }
  dashboard.render();
  try {
    if (withCloudflare) {
      await assertCloudflaredAvailable();
      const publicUrls = await Promise.all(
        products.map(async (product) => {
          const webPort = product === "finance" ? 3001 : 3000;
          return [product, await startCloudflareTunnel(product, webPort)];
        }),
      );
      for (const [product, publicUrl] of publicUrls) {
        tunnelOrigins.set(product, publicUrl);
      }
    }
    await Promise.all(products.map((product) => startProduct(product)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    await stop(1);
  }
}

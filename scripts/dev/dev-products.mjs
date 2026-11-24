import { spawn } from "node:child_process";
import { useLocalDatabase } from "./dev-local-database.mjs";
import { localDatabaseEnvironment } from "./dev-database-environment.mjs";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { assertPortAvailable } from "./dev-port-availability.mjs";
import { terminateDevChildren } from "./dev-process-termination.mjs";
import { waitForHttpReady } from "./dev-service-readiness.mjs";
import { extractCloudflareQuickTunnelUrl } from "./dev-cloudflare-tunnel.mjs";
import { checkDevTelegramBot, checkDevTelegramWebhook, sharesBotIdentity } from "./dev-telegram-bot-check.mjs";
import { localBotPublicEnvironment } from "../deployment/public-origin-environment.mjs";
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
          PORT: "4000",
          API_PORT: "4000",
          NEXT_PUBLIC_API_URL: "http://localhost:4000/api",
          FRONTEND_URL: "http://localhost:3000",
          TELEGRAM_SYSTEM_BOT_ENVIRONMENT: "",
          TELEGRAM_BOT_RUNTIME_ENVIRONMENT: "",
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
        env: {
          NEXT_PUBLIC_API_URL: "http://localhost:4000/api",
        },
      },
    ],
  },
  finance: {
    ports: [
      [4001, "Finance API"],
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
          PORT: "4001",
          API_PORT: "4001",
          API_PUBLIC_URL: "http://localhost:4001",
          FINANCE_WEB_PUBLIC_URL: "http://localhost:3001",
          CRM_RUNTIME_PROXY_URL: "",
          CRM_RUNTIME_ENABLED: "false",
          FRONTEND_URL: "http://localhost:3001",
          TELEGRAM_SYSTEM_BOT_ENVIRONMENT: "",
          TELEGRAM_BOT_RUNTIME_ENVIRONMENT: "",
        },
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
          FINANCE_API_PROXY_URL: "",
          FINANCE_ALLOWED_DEV_ORIGIN: "http://localhost:3001",
        },
      },
    ],
  },
};

const FINANCE_WEB_PUBLIC_KEYS = new Set([
  "NEXT_PUBLIC_FINANCE_API_URL",
  "FINANCE_API_PROXY",
  "FINANCE_ALLOWED_DEV_ORIGIN",
]);

const FINANCE_API_RUNTIME_KEYS = new Set([
  "FINANCE_BOT_RUNTIME_ENVIRONMENT",
  "FINANCE_BOT_LOCAL_USERNAME",
]);

const FINANCE_SUPPORT_KEYS = new Set([
  "FINANCE_BOT_SUPPORT_USERNAME",
  "FINANCE_BOT_SUPPORT_TOKEN",
  "FINANCE_BOT_SUPPORT_WEBHOOK_SECRET",
  "FINANCE_BOT_DASHBOARD_WORKSPACE_ID",
]);

const FINANCE_LOCAL_BOT_RUNTIME_KEYS = new Set([
  "FINANCE_BOT_LOCAL_USERNAME",
  "FINANCE_BOT_LOCAL_TOKEN",
]);

const { parse: parseEnv } = createRequire(new URL("../../apps/api/package.json", import.meta.url))("dotenv");

function financeProfileEnvironment(profilePath, allowedKeys) {
  return Object.fromEntries(Object.entries(readEnvFile(profilePath)).filter(
    ([key]) => allowedKeys.has(key),
  ));
}

function readEnvFile(path) {
  return existsSync(path) ? parseEnv(readFileSync(path)) : {};
}

function configuredBotProfiles(products) {
  const financePath = "products/finance/.env.local";
  const root = { ...readEnvFile(".env"), ...process.env };
  const finance = readEnvFile(financePath);
  return products.flatMap((product) => ["LOCAL", "PRODUCTION"].map((environment) => {
    const system = product === "nexeloq";
    const env = system ? root : finance;
    const key = `${system ? "TELEGRAM_SYSTEM_BOT" : "FINANCE_BOT"}_${environment}`;
    return {
      product,
      environment,
      id: `${product}-bot-${environment.toLowerCase()}`,
      label: `Bot · ${environment}`,
      path: system ? ".env" : financePath,
      key,
      token: env[`${key}_TOKEN`]?.trim(),
      username: env[`${key}_USERNAME`]?.trim(),
    };
  }));
}

const localBotProfiles = new Map();

async function prepareBotProfiles(profiles) {
  const notes = {
    missing: ["No token", "Set", "TOKEN"],
    invalid: ["Invalid token", "Replace", "TOKEN"],
    usernameMismatch: ["Username mismatch", "Check", "USERNAME"],
    shared: ["Shared bot identity", "Use a separate bot for", "TOKEN"],
    unavailable: ["Check unavailable", "Retry Telegram verification for", "TOKEN"],
  };
  await Promise.all(profiles.map(async (profile) => {
    dashboard.update(profile.id, "starting", "Checking token");
    const result = sharesBotIdentity(profile, profiles) ? { status: "shared" } : await checkDevTelegramBot(profile);
    if (result.status === "valid") {
      if (profile.environment === "LOCAL") {
        if (profile.product === "nexeloq" && !withSystemBot) {
          dashboard.update(profile.id, "waiting", "Disabled");
          return;
        }
        if (profile.product === "finance") {
          try {
            assertFinanceLocalBotProfile();
          } catch {
            dashboard.update(profile.id, "failed", "LOCAL profile required");
            dashboard.notice("⚠ Set FINANCE_BOT_RUNTIME_ENVIRONMENT=LOCAL in products/finance/.env.local.");
            return;
          }
        }
        localBotProfiles.set(profile.product, profile);
        dashboard.update(profile.id, "waiting", "Token valid");
        return;
      }
      const details = {
        registered: ["ready", "Webhook set"],
        absent: ["waiting", "No remote webhook"],
        invalid: ["failed", "Invalid token"],
        deliveryError: ["failed", "Webhook delivery error"],
        unavailable: ["waiting", "Webhook check unavailable"],
      };
      dashboard.update(profile.id, ...details[result.webhook.status]);
      if (result.webhook.status === "invalid")
        dashboard.notice(`⚠ Replace ${profile.key}_TOKEN in ${profile.path}.`);
      return;
    }
    const [detail, action, field] = notes[result.status];
    dashboard.update(profile.id, "failed", detail);
    dashboard.notice(`⚠ ${action} ${profile.key}_${field} in ${profile.path}.`);
  }));
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
  const username = profile.FINANCE_BOT_LOCAL_USERNAME;
  return {
    TELEGRAM_BOT_RUNTIME_ENVIRONMENT: "LOCAL",
    // Match the selected LOCAL profile to the existing database runtime.
    // Tokens are passed only to the local API.
    FINANCE_BROWSER_LOGIN_BOT_USERNAME: runtime === "LOCAL" ? username || "" : "",
  };
}

/** Pass the selected local bot credential only to the local API process. */
export function financeLocalBotRuntimeEnvironment(
  profilePath = "products/finance/.env.local",
) {
  return financeProfileEnvironment(profilePath, FINANCE_LOCAL_BOT_RUNTIME_KEYS);
}

export function assertFinanceLocalBotProfile(
  profilePath = "products/finance/.env.local",
) {
  const profile = financeProfileEnvironment(profilePath, new Set([
    ...FINANCE_LOCAL_BOT_RUNTIME_KEYS,
    "FINANCE_BOT_RUNTIME_ENVIRONMENT",
    "FINANCE_BOT_PRODUCTION_TOKEN",
  ]));
  if (
    profile.FINANCE_BOT_RUNTIME_ENVIRONMENT?.toUpperCase() !== "LOCAL" ||
    !profile.FINANCE_BOT_LOCAL_USERNAME ||
    !profile.FINANCE_BOT_LOCAL_TOKEN ||
    profile.FINANCE_BOT_LOCAL_TOKEN === profile.FINANCE_BOT_PRODUCTION_TOKEN
  ) {
    throw new Error("Configure a distinct LOCAL Finance bot in products/finance/.env.local before starting the tunnel.");
  }
}

export function selectedProducts(mode) {
  if (mode === "nexeloq" || mode === "finance") return [mode];
  if (mode === "all") return ["nexeloq", "finance"];
  throw new Error("Usage: node scripts/dev/dev-products.mjs <nexeloq|finance|all>");
}

export function localSystemBotEnvironment({ optedIn, tunnel, tokenVerified }) {
  return { TELEGRAM_SYSTEM_BOT_ENVIRONMENT: optedIn && (!tunnel || tokenVerified) ? "LOCAL" : "" };
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
let financeLocalBotId;

async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  dashboard?.dispose();
  if (financeLocalBotId) {
    await fetch(
      `http://127.0.0.1:4001/api/telegram/bots/runtime/local-development/stop?botIntegrationId=${encodeURIComponent(financeLocalBotId)}`,
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

function spawnPnpm(args, options) {
  return process.platform === "win32" && process.env.npm_execpath
    ? spawn(process.execPath, [process.env.npm_execpath, ...args], options)
    : spawn("pnpm", args, options);
}

function start(product, definition) {
  const { name, args, env } = definition;
  const id = serviceId(product, name);
  const verifiedBot = withCloudflare ? localBotProfiles.get(product) : undefined;
  const financeWebEnvironmentVariables =
    name === "Finance Web" ? financeWebEnvironment() : {};
  const financeApiEnvironmentVariables =
    name === "Finance API" ? financeApiEnvironment() : {};
  const localFinanceBotEnvironment =
    name !== "Finance API" ? {} :
    withCloudflare ? {
      FINANCE_BROWSER_LOGIN_BOT_USERNAME: verifiedBot?.username ?? "",
      FINANCE_BOT_LOCAL_USERNAME: verifiedBot?.username ?? "",
      FINANCE_BOT_LOCAL_TOKEN: verifiedBot?.token ?? "",
    } : financeApiEnvironmentVariables.FINANCE_BROWSER_LOGIN_BOT_USERNAME
      ? financeLocalBotRuntimeEnvironment() : {};
  const financeTunnelEnvironment =
    name === "Finance API" && withCloudflare
      ? {
          LOCAL_DEV_BOTS_CONTROL_SECRET: localDevControlSecret,
          ...localBotPublicEnvironment(tunnelOrigins.get("finance")),
          FINANCE_WEB_PUBLIC_URL: tunnelOrigins.get("finance"),
        }
      : {};
  const systemBotTunnelEnvironment =
    name === "Nexeloq API" && withSystemBot
      ? localBotPublicEnvironment(tunnelOrigins.get("nexeloq"))
      : {};
  const systemBotEnvironment =
    name === "Nexeloq API"
      ? {
        ...localSystemBotEnvironment({
          optedIn: withSystemBot,
          tunnel: withCloudflare,
          tokenVerified: Boolean(verifiedBot),
        }),
        ...(verifiedBot ? {
          TELEGRAM_SYSTEM_BOT_LOCAL_USERNAME: verifiedBot.username,
          TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN: verifiedBot.token,
        } : {}),
      }
      : {};
  const child = spawnPnpm(args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...financeWebEnvironmentVariables,
      ...env,
      ...financeApiEnvironmentVariables,
      ...(name === "Finance API" ? { LOCAL_DEV_BOTS_CONTROL_SECRET: localDevControlSecret } : {}),
      ...localFinanceBotEnvironment,
      ...financeTunnelEnvironment,
      ...tunnelProcessEnvironment(product, name, tunnelOrigins.get(product)),
      ...systemBotTunnelEnvironment,
      ...(name === "Nexeloq API" ? {
        ...financeProfileEnvironment("products/finance/.env.local", FINANCE_SUPPORT_KEYS),
        ...(withCloudflare && tunnelOrigins.get("nexeloq")
          ? { API_PUBLIC_URL: tunnelOrigins.get("nexeloq"), TELEGRAM_SUPPORT_WEBHOOK_OWNER: "local" }
          : { TELEGRAM_SUPPORT_WEBHOOK_OWNER: "off" }),
      } : name === "Finance API" ? { TELEGRAM_SUPPORT_WEBHOOK_OWNER: "off" } : {}),
      ...systemBotEnvironment,
      ...(name === "Finance Web" || name === "Nexeloq Web"
        ? { NEXT_PUBLIC_DATABASE_ENV: localDatabaseEnvironment() }
        : {}),
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

async function synchronizeFinanceLocalBot(activateWebhook) {
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
  const synchronized = await synchronize.json();
  if (synchronized.synchronized !== true || !synchronized.botIntegrationId) {
    throw new Error("Finance LOCAL bot synchronization was not confirmed");
  }
  financeLocalBotId = synchronized.botIntegrationId;
  if (!activateWebhook) return;
  const activate = await fetch(
    `http://127.0.0.1:4001/api/telegram/bots/runtime/local-development/start?botIntegrationId=${encodeURIComponent(financeLocalBotId)}`,
    { method: "POST", headers, signal: AbortSignal.timeout(5 * 60_000) },
  );
  if (!activate.ok) {
    throw new Error(`Finance LOCAL bot activation returned HTTP ${activate.status}`);
  }
  const activation = await activate.json();
  if (activation.started !== true || !activation.runtimes?.some((runtime) =>
    runtime.botIntegrationId === financeLocalBotId && runtime.applicationType === "FINANCE" &&
    runtime.runtimeStatus === "ACTIVE" && runtime.webhookStatus === "CONFIGURED")) {
    throw new Error("Finance LOCAL runtime did not confirm webhook ownership");
  }
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

async function prepareStartupStep({ id, args, starting, ready, failure }) {
  dashboard?.update(id, "starting", starting);
  const capture = createOutputCapture();
  const child = spawnPnpm(args, {
    cwd: process.cwd(),
    env: process.env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  child.stdout?.on("data", (chunk) => capture.write(chunk));
  child.stderr?.on("data", (chunk) => capture.write(chunk));
  try {
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => {
        if (code === 0) resolve();
        else {
          const recent = capture.recentLines().slice(-8).join("\n");
          reject(new Error(`${failure} (code ${code ?? "unknown"})${recent ? `\n${recent}` : ""}`));
        }
      });
    });
    dashboard?.update(id, "ready", ready);
  } finally {
    children.delete(child);
  }
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
  if (withCloudflare && localBotProfiles.has(product)) {
    const profile = localBotProfiles.get(product);
    const publicUrl = tunnelOrigins.get(product);
    dashboard?.update(profile.id, "starting", "Checking local webhook");
    try {
      await waitForHttpReady(`${publicUrl}/api/health`);
      if (product === "finance") {
        await waitForHttpReady(`${publicUrl}/health`);
        await synchronizeFinanceLocalBot(true);
      }
      const webhook = await checkDevTelegramWebhook(profile.token);
      if (webhook.status !== "registered" || webhook.origin !== new URL(publicUrl).origin)
        throw new Error("LOCAL webhook did not confirm this tunnel");
      dashboard?.update(profile.id, "ready", "Running on tunnel");
    } catch {
      dashboard?.update(profile.id, "failed", "Local webhook failed");
      dashboard?.notice(`⚠ ${product === "finance" ? "Finance" : "Nexeloq"} LOCAL bot could not confirm its webhook. Check API diagnostics and ${profile.key}_TOKEN.`);
    }
  } else if (product === "finance" && !withCloudflare) {
    const configured = financeLocalBotRuntimeEnvironment();
    if (configured.FINANCE_BOT_LOCAL_TOKEN && financeApiEnvironment().FINANCE_BROWSER_LOGIN_BOT_USERNAME)
      await synchronizeFinanceLocalBot(false).catch(() =>
        dashboard?.notice("Finance LOCAL bot could not be synchronized from ENV"),
      );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.chdir(fileURLToPath(new URL("../../", import.meta.url)));
  let products;
  try {
    products = selectedProducts(mode);
    await useLocalDatabase();
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
  const botProfiles = withCloudflare ? configuredBotProfiles(products) : [];
  for (const profile of botProfiles) {
    dashboard.register(profile.id, { column: profile.product, label: profile.label });
  }
  dashboard.register("database", {
    column: products[0],
    label: "Database",
  });
  dashboard.register("shared", {
    column: products[0],
    label: "Shared package",
  });
  dashboard.render();
  try {
    await prepareBotProfiles(botProfiles);
    await prepareStartupStep({
      id: "database",
      args: ["--filter", "api", "run", "db:deploy:safe"],
      starting: "Applying migrations",
      ready: "Schema ready",
      failure: "Database preparation failed",
    });
    await prepareStartupStep({
      id: "shared",
      args: ["--filter", "@telegram-system/shared", "build"],
      starting: "Building",
      ready: "Build ready",
      failure: "Shared package build failed",
    });
    dashboard.register("prisma", { column: products[0], label: "Prisma client" });
    await prepareStartupStep({
      id: "prisma",
      args: ["db:generate"],
      starting: "Generating",
      ready: "Client ready",
      failure: "Prisma client generation failed",
    });
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

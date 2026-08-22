import { spawn } from "node:child_process";

const publicPort = process.env.PORT || "3000";
const internalApiPort = "4000";
const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
const publicOrigin = railwayDomain
  ? `https://${railwayDomain.replace(/^https?:\/\//u, "").replace(/\/+$/u, "")}`
  : undefined;
const children = new Set();
let stopping = false;

function start(name, command, args, env) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  children.add(child);
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
  for (const child of children) terminate(child);
  const force = setTimeout(() => {
    for (const child of children) {
      if (!child.killed) child.kill("SIGKILL");
    }
  }, 10_000);
  force.unref();
  await Promise.allSettled(
    [...children].map(
      (child) => new Promise((resolve) => child.once("exit", resolve)),
    ),
  );
  process.exit(exitCode);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => void stop());
}

const productionUrls = publicOrigin
  ? {
      API_PUBLIC_URL: process.env.API_PUBLIC_URL || publicOrigin,
      PUBLIC_API_URL: process.env.PUBLIC_API_URL || publicOrigin,
      TELEGRAM_BOT_WEBHOOK_BASE_URL:
        process.env.TELEGRAM_BOT_WEBHOOK_BASE_URL || publicOrigin,
      FINANCE_MINI_APP_URL: process.env.FINANCE_MINI_APP_URL || publicOrigin,
      FRONTEND_URL: process.env.FRONTEND_URL || publicOrigin,
    }
  : {};

start("API", "node", ["apps/api/dist/main.js"], {
  PORT: internalApiPort,
  NODE_ENV: "production",
  // This Railway service owns public webhooks. LOCAL is exclusively owned by
  // pnpm dev:bots and must never be selected by a production deployment.
  TELEGRAM_BOT_RUNTIME_ENVIRONMENT: "PRODUCTION",
  ...productionUrls,
});

start("Web", "pnpm", ["--filter", "web", "start"], {
  PORT: publicPort,
  HOSTNAME: "0.0.0.0",
  NODE_ENV: "production",
});

process.stdout.write(
  `[railway] Web gateway listening on :${publicPort}; API listening internally on :${internalApiPort}.\n`,
);
if (publicOrigin) {
  process.stdout.write(`[railway] Public Finance app: ${publicOrigin}\n`);
} else {
  process.stderr.write(
    "[railway] RAILWAY_PUBLIC_DOMAIN is unavailable; configure FRONTEND_URL, FINANCE_MINI_APP_URL and TELEGRAM_BOT_WEBHOOK_BASE_URL explicitly.\n",
  );
}

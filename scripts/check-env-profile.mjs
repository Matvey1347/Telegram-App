import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

const profiles = [
  {
    name: "Nexeloq",
    template: ".env.example",
    local: ".env",
    forbiddenPrefix: "FINANCE_",
    allowedFinanceBridgeKeys: [
      "FINANCE_BOT_DASHBOARD_WORKSPACE_ID",
      "FINANCE_ADMIN_ANALYTICS_URL",
      "FINANCE_ADMIN_ANALYTICS_TOKEN",
    ],
    required: [
      "DATABASE_URL",
      "API_PORT",
      "FRONTEND_URL",
      "NEXT_PUBLIC_API_URL",
    ],
    allowed: [
      "DATABASE_URL",
      "GPT_API_SEKRET",
      "API_PORT",
      "API_PUBLIC_URL",
      "JWT_SECRET",
      "BOT_TOKEN_ENCRYPTION_KEY",
      "FRONTEND_URL",
      "NEXT_PUBLIC_API_URL",
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_USER",
      "SMTP_PASSWORD",
      "SMTP_FROM",
      "TELEGRAM_BOT_RUNTIME_ENVIRONMENT",
      "TELEGRAM_API_ID",
      "TELEGRAM_API_HASH",
      "TELEGRAM_SYSTEM_BOT_ENVIRONMENT",
      "TELEGRAM_SYSTEM_BOT_LOCAL_USERNAME",
      "TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN",
      "TELEGRAM_SYSTEM_BOT_LOCAL_WEBHOOK_SECRET",
      "TELEGRAM_SYSTEM_BOT_PRODUCTION_USERNAME",
      "TELEGRAM_SYSTEM_BOT_PRODUCTION_TOKEN",
      "TELEGRAM_SYSTEM_BOT_PRODUCTION_WEBHOOK_SECRET",
      "TELEGRAM_SYSTEM_BOT_DASHBOARD_WORKSPACE_ID",
      "FINANCE_BOT_DASHBOARD_WORKSPACE_ID",
      "FINANCE_ADMIN_ANALYTICS_URL",
      "FINANCE_ADMIN_ANALYTICS_TOKEN",
      "WEB_PUSH_VAPID_SUBJECT",
      "WEB_PUSH_VAPID_PUBLIC_KEY",
      "WEB_PUSH_VAPID_PRIVATE_KEY",
      "B2_KEY_ID",
      "B2_APP_KEY",
      "B2_BUCKET_NAME",
      "B2_ENDPOINT",
      "APP_LOG_MIN_LEVEL",
      "APP_CONSOLE_LOG_LEVEL",
      "APP_LOG_HTTP_ENABLED",
      "APP_LOG_HTTP_SUCCESS_ENABLED",
      "TRUST_PROXY_HOPS",
      "MEMORY_MONITOR_ENABLED",
      "MEMORY_MONITOR_WARN_RSS_MB",
      "MEMORY_MONITOR_DETAILED_TELEMETRY",
      "RAILWAY_API_TOKEN",
    ],
  },
  {
    name: "Finance",
    template: "products/finance/.env.example",
    local: "products/finance/.env.local",
    required: [
      "FINANCE_DATABASE_URL",
      "FINANCE_SESSION_SIGNING_KEY",
      "FINANCE_BOOTSTRAP_SIGNING_KEY",
      "FINANCE_API_PORT",
      "NEXT_PUBLIC_FINANCE_API_URL",
      "FINANCE_API_PROXY",
    ],
    allowed: [
      "FINANCE_DATABASE_URL",
      "FINANCE_SESSION_SIGNING_KEY",
      "FINANCE_BOOTSTRAP_SIGNING_KEY",
      "FINANCE_API_PORT",
      "NEXT_PUBLIC_FINANCE_API_URL",
      "FINANCE_API_PROXY",
      "FINANCE_ALLOWED_DEV_ORIGIN",
      "FINANCE_WEB_PUBLIC_URL",
      "FINANCE_API_PUBLIC_URL",
      "FINANCE_BOT_RUNTIME_ENVIRONMENT",
      "FINANCE_BOT_LOCAL_USERNAME",
      "FINANCE_BOT_LOCAL_TOKEN",
      "FINANCE_BOT_LOCAL_WEBHOOK_SECRET",
      "FINANCE_BOT_PRODUCTION_USERNAME",
      "FINANCE_BOT_PRODUCTION_TOKEN",
      "FINANCE_BOT_PRODUCTION_WEBHOOK_SECRET",
      "FINANCE_ADMIN_ANALYTICS_WORKSPACE_ID",
      "FINANCE_ADMIN_ANALYTICS_TOKEN",
    ],
  },
];

function keys(file) {
  const result = [];
  const seen = new Set();
  for (const line of readFileSync(file, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/u);
    if (!match) continue;
    if (seen.has(match[1]))
      throw new Error(`${file} contains a duplicate key.`);
    seen.add(match[1]);
    result.push(match[1]);
  }
  return result;
}

let failed = false;
for (const profile of profiles) {
  try {
    if (!existsSync(profile.template)) {
      throw new Error(`${profile.name} template is missing.`);
    }
    const templateKeys = keys(profile.template);
    const missing = profile.required.filter(
      (key) => !templateKeys.includes(key),
    );
    if (missing.length)
      throw new Error(`${profile.name} template misses required keys.`);
    if (
      profile.forbiddenPrefix &&
      templateKeys.some(
        (key) =>
          key.startsWith(profile.forbiddenPrefix) &&
          !profile.allowedFinanceBridgeKeys?.includes(key),
      )
    ) {
      throw new Error(
        `${profile.name} template contains keys owned by Finance.`,
      );
    }
    if (
      profile.allowed &&
      templateKeys.some((key) => !profile.allowed.includes(key))
    ) {
      throw new Error(
        `${profile.name} template contains a key outside its allowlist.`,
      );
    }

    if (existsSync(profile.local)) {
      const localKeys = keys(profile.local);
      const localMissing = profile.required.filter(
        (key) => !localKeys.includes(key),
      );
      if (localMissing.length)
        throw new Error(`${profile.name} local profile misses required keys.`);
      if (
        profile.forbiddenPrefix &&
        localKeys.some(
          (key) =>
            key.startsWith(profile.forbiddenPrefix) &&
            !profile.allowedFinanceBridgeKeys?.includes(key),
        )
      ) {
        throw new Error(
          `${profile.name} local profile contains keys owned by Finance.`,
        );
      }
      if (profile.allowed) {
        const unknownKeys = localKeys.filter(
          (key) => !profile.allowed.includes(key),
        );
        if (unknownKeys.length) {
          throw new Error(
            `${profile.name} local profile contains a key outside its allowlist: ${unknownKeys.join(", ")}.`,
          );
        }
      }
    }
    console.log(`✓ ${profile.name} profile contract is valid.`);
  } catch (error) {
    failed = true;
    console.error(error instanceof Error ? error.message : String(error));
  }
}

if (failed) process.exit(1);
console.log(
  "Environment profiles are isolated; values were not read or printed.",
);

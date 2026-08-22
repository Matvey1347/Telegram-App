import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const retiredRuntimeKeys = [
  "FINANCE_MINI_APP_URL",
  "NEXT_PUBLIC_FINANCE_CONSUMER_GATEWAY_ORIGINS",
  "PUBLIC_API_URL",
  "TELEGRAM_BOT_WEBHOOK_BASE_URL",
  "TELEGRAM_SYSTEM_BOT_WEBHOOK_BASE_URL",
  "TELEGRAM_UPDATES_MODE",
  "TELEGRAM_SYNC_ENABLED",
  "TELEGRAM_SYNC_INTERVAL_MINUTES",
  "TELEGRAM_DAILY_ANALYTICS_SYNC_ENABLED",
  "TELEGRAM_MTTPROTO_SYNC_ENABLED",
  "TELEGRAM_ACCOUNT_CAPABILITY_TTL_HOURS",
  "TELEGRAM_ACCOUNT_CAPABILITY_REFRESH_CONCURRENCY",
  "TELEGRAM_ACCOUNT_CAPABILITY_CHECK_TIMEOUT_MS",
  "APP_LOG_RETENTION_DAYS",
  "APP_LOG_BATCH_SIZE",
  "APP_LOG_FLUSH_INTERVAL_MS",
  "APP_LOG_HTTP_SLOW_REQUEST_MS",
  "MEMORY_MONITOR_INTERVAL_MS",
  "MEMORY_MONITOR_RECOVERY_RSS_MB",
  "MEMORY_MONITOR_REMINDER_INTERVAL_MS",
  "TELEGRAM_OPERATIONAL_HISTORY_RETENTION_DAYS",
  "SCHEDULED_TASK_RUN_RETENTION_DAYS",
  "LOCAL_API_PROXY",
];

const roots = [
  "apps/api/src",
  "apps/web/src",
  "docs",
  "README.md",
  ".env",
  ".env.example",
  "scripts/start-railway.mjs",
  "scripts/dev-tunnel.mjs",
  "scripts/public-origin-environment.mjs",
];

function filesAt(target) {
  if (!statSync(target).isDirectory()) return [target];
  return readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(target, entry.name);
    return entry.isDirectory() ? filesAt(child) : [child];
  });
}

test("retired environment keys cannot return to runtime, profile, or docs", () => {
  const failures = [];
  for (const file of roots.flatMap(filesAt)) {
    const source = readFileSync(file, "utf8");
    for (const key of retiredRuntimeKeys) {
      const exactKey = new RegExp(`(?<![A-Z0-9_])${key}(?![A-Z0-9_])`, "u");
      if (exactKey.test(source)) failures.push(`${file}: ${key}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("script-only flags stay out of the permanent environment profile", () => {
  const profile = readFileSync(".env.example", "utf8");
  for (const key of ["PRISMA_BASELINE_RECONCILE", "RAILWAY_API_PROXY"]) {
    assert.equal(profile.includes(`${key}=`), false, key);
  }
});

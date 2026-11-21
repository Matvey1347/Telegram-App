import { createRequire } from "node:module";
import { runAiSync } from "../ai/sync-local-ai-costs.mjs";
import { spawn } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env", override: false });

const sourceUrl = process.env.DATABASE_URL_PRODUCTION;
if (!sourceUrl) {
  throw new Error(
    "Set DATABASE_URL_PRODUCTION in the ignored root .env first.",
  );
}
if (process.env.ALLOW_PRODUCTION_SNAPSHOT !== "YES") {
  throw new Error(
    "This replaces local database data. Re-run with ALLOW_PRODUCTION_SNAPSHOT=YES to confirm.",
  );
}

const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const { Client } = require("pg");
if (
  !process.env.DATABASE_URL ||
  !["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(process.env.DATABASE_URL).hostname,
  )
) {
  throw new Error("Snapshot target must be the local database");
}
const snapshotGuard = new Client({
  connectionString: process.env.DATABASE_URL,
});
await snapshotGuard.connect();
// Admission takes the shared form of this lock. No new paid local request can
// start between the unsynced check and destructive restore.
await snapshotGuard.query(
  "SELECT pg_advisory_lock(hashtextextended('local-ai-snapshot', 0))",
);
try {
  await runAiSync("--check");
} catch {
  await snapshotGuard.end();
  throw new Error(
    "Snapshot blocked: synchronize all local AI receipts first (pnpm ai:sync --execute).",
  );
}
const args = [
  "compose",
  "exec",
  "-T",
  "-e",
  "SOURCE_URL",
  "postgres",
  "sh",
  "-lc",
  'pg_dump "$SOURCE_URL" --format=custom --no-owner --no-acl -f /tmp/production.dump && pg_restore --host 127.0.0.1 --port 5432 --username postgres --dbname telegram_system --clean --if-exists --no-owner --no-acl /tmp/production.dump; result=$?; rm -f /tmp/production.dump; exit $result',
];
const child = spawn("docker", args, {
  stdio: "inherit",
  env: { ...process.env, SOURCE_URL: sourceUrl, PGPASSWORD: "postgres" },
});
child.on("error", async (error) => {
  await snapshotGuard.end();
  console.error(`Could not run Docker snapshot: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", async (code) => {
  await snapshotGuard.end();
  process.exitCode = code ?? 1;
});

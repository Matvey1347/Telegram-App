import { createRequire } from "node:module";
import { runAiSync } from "../ai/sync-local-ai-costs.mjs";
import { spawn } from "node:child_process";
import { config } from "dotenv";
import { requireLocalDatabase, requireLocalDockerBinding } from "../dev/dev-local-database.mjs";

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

const source = new URL(sourceUrl);
const sourceEnvironment = {
  PGHOST: source.hostname.replace(/^\[(.*)\]$/u, "$1"),
  PGPORT: source.port || "5432",
  PGDATABASE: decodeURIComponent(source.pathname.slice(1)),
  PGUSER: decodeURIComponent(source.username),
  PGPASSWORD: decodeURIComponent(source.password),
  PGSSLMODE: source.searchParams.get("sslmode") || "require",
  PGCHANNELBINDING: source.searchParams.get("channel_binding") || "prefer",
};

const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const { Client } = require("pg");
const targetUrl = requireLocalDatabase();
if (new URL(targetUrl).pathname !== "/telegram_system") {
  throw new Error("Snapshot target must be the Docker telegram_system database on local port 5433");
}
requireLocalDockerBinding(targetUrl);
const snapshotGuard = new Client({
  connectionString: targetUrl,
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
  ...Object.keys(sourceEnvironment).flatMap((name) => ["-e", name]),
  "postgres",
  "sh",
  "-lc",
  'umask 077; dump="$(mktemp /tmp/production-snapshot.XXXXXXXX)" || exit 1; trap \'rm -f "$dump"\' EXIT; pg_dump --format=custom --no-owner --no-acl -f "$dump" && env -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD -u PGSSLMODE -u PGCHANNELBINDING pg_restore --username postgres --dbname telegram_system --single-transaction --clean --if-exists --no-owner --no-acl "$dump"',
];
const child = spawn("docker", args, {
  stdio: "inherit",
  env: { ...process.env, ...sourceEnvironment },
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

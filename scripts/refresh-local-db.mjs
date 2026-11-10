import { spawn } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env", override: false });

const sourceUrl = process.env.DATABASE_URL_PRODUCTION;
if (!sourceUrl) {
  throw new Error("Set DATABASE_URL_PRODUCTION in the ignored root .env first.");
}
if (process.env.ALLOW_PRODUCTION_SNAPSHOT !== "YES") {
  throw new Error(
    "This replaces local database data. Re-run with ALLOW_PRODUCTION_SNAPSHOT=YES to confirm.",
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
  "pg_dump \"$SOURCE_URL\" --format=custom --no-owner --no-acl -f /tmp/production.dump && pg_restore --host 127.0.0.1 --port 5432 --username postgres --dbname telegram_system --clean --if-exists --no-owner --no-acl /tmp/production.dump; result=$?; rm -f /tmp/production.dump; exit $result",
];
const child = spawn("docker", args, {
  stdio: "inherit",
  env: { ...process.env, SOURCE_URL: sourceUrl, PGPASSWORD: "postgres" },
});
child.on("error", (error) => {
  console.error(`Could not run Docker snapshot: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

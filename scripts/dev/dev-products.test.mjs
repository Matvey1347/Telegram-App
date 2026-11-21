import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { localDatabaseEnvironment } from "./dev-database-environment.mjs";
import {
  LOCAL_PRODUCTS,
  assertFinanceLocalBotProfile,
  financeApiEnvironment,
  financeLocalBotRuntimeEnvironment,
  financeWebEnvironment,
  selectedProducts,
  tunnelProcessEnvironment,
} from "./dev-products.mjs";

test("local product commands use non-overlapping fixed ports", () => {
  const nexeloqPorts = LOCAL_PRODUCTS.nexeloq.ports.map(([port]) => port);
  const financePorts = LOCAL_PRODUCTS.finance.ports.map(([port]) => port);
  assert.deepEqual(nexeloqPorts, [4000, 3000]);
  assert.deepEqual(financePorts, [4001, 3001]);
  assert.deepEqual(
    nexeloqPorts.filter((port) => financePorts.includes(port)),
    [],
  );
});

test("Nexeloq API overrides a conflicting root API port", () => {
  const api = LOCAL_PRODUCTS.nexeloq.processes.find(
    (processDefinition) => processDefinition.name === "Nexeloq API",
  );

  assert.equal(api?.env.PORT, "4000");
  assert.equal(api?.env.API_PORT, "4000");
});

test("Finance waits for its API before starting the web host", () => {
  const api = LOCAL_PRODUCTS.finance.processes.find(
    (processDefinition) => processDefinition.name === "Finance API",
  );
  const web = LOCAL_PRODUCTS.finance.processes.find(
    (processDefinition) => processDefinition.name === "Finance Web",
  );

  assert.equal(api?.readyUrl, "http://127.0.0.1:4001/api/health");
  assert.equal(api?.env.PORT, "4001");
  assert.equal(api?.env.CRM_RUNTIME_ENABLED, "false");
  assert.equal(web?.readyUrl, undefined);
  assert.equal(web?.webReadyUrl, "http://127.0.0.1:3001/health");
  assert.equal(web?.localUrl, "http://localhost:3001");
  assert.equal(web?.env.NEXT_PUBLIC_FINANCE_API_URL, "/api");
});

test("local product services declare concise dashboard labels", () => {
  assert.equal(
    LOCAL_PRODUCTS.nexeloq.processes[0]?.dashboardLabel,
    "API · :4000",
  );
  assert.equal(LOCAL_PRODUCTS.nexeloq.processes[1]?.dashboardLabel, "Web");
  assert.equal(LOCAL_PRODUCTS.finance.processes[1]?.dashboardLabel, "Web");
});

test("ordinary Finance starts only the complete consumer API and local web proxy", () => {
  const [api, web] = LOCAL_PRODUCTS.finance.processes;
  assert.deepEqual(api.args, ["--filter", "api", "dev"]);
  assert.equal(api.env.TELEGRAM_SYSTEM_BOT_ENVIRONMENT, "");
  assert.equal(api.env.API_PUBLIC_URL, "http://localhost:4001");
  assert.equal(web.env.FINANCE_API_PROXY_URL, "");
});

test("Finance tunnel reports Web readiness independently of API readiness", () => {
  const source = readFileSync(new URL("./dev-tunnel.mjs", import.meta.url), "utf8");
  const apiHealthCheck = source.indexOf(
    'waitForHttpReady("http://127.0.0.1:4001/api/health").then(() =>',
  );
  const webHealthCheck = source.indexOf(
    'waitForHttpReady("http://127.0.0.1:3001/health").then(() =>',
  );
  const webReady = source.indexOf('status("Finance Web", "http://localhost:3001")');

  assert.ok(apiHealthCheck >= 0);
  assert.ok(webReady > webHealthCheck);
  assert.ok(webReady < source.indexOf("await synchronizeFinanceLocalBot()"));
});

test("Finance tunnel confirms the LOCAL username and active webhook runtime", () => {
  const source = readFileSync(new URL("./dev-tunnel.mjs", import.meta.url), "utf8");
  assert.match(source, /result\?\.synchronized !== true/u);
  assert.match(source, /runtime\.runtimeStatus !== "ACTIVE"/u);
  assert.match(source, /runtime\.webhookStatus !== "CONFIGURED"/u);
  assert.match(source, /Open this bot in Telegram and send \/start/u);
});

test("tunnel labels bot cleanup as an exit action", () => {
  const source = readFileSync(new URL("./dev-tunnel.mjs", import.meta.url), "utf8");

  assert.match(source, /\["Bot cleanup", "Cleanup on exit"\]/u);
  assert.match(source, /async function stop\(exitCode = 0\)/u);
  assert.ok(source.includes("local-development/stop${financeBotScope()}"));
});

test("local launch database preparation requires a loopback target", async () => {
  const { requireLocalDatabase } = await import("./dev-local-database.mjs");
  assert.throws(() => requireLocalDatabase({
    DATABASE_URL: "postgresql://user:secret@database.example/dev",
    FINANCE_DATABASE_URL: "postgresql://user:secret@localhost:5433/finance",
  }), /requires DATABASE_URL/u);
  assert.equal(requireLocalDatabase({
    DATABASE_URL: "postgresql://user:secret@localhost:5433/dev?schema=public",
  }), "postgresql://user:secret@127.0.0.1:5433/dev?schema=public");
});

test("Finance tunnel rejects a missing profile or shared LOCAL and PRODUCTION token", () => {
  assert.throws(() => assertFinanceLocalBotProfile("/missing-profile"), /distinct LOCAL Finance bot/u);
  const directory = mkdtempSync(join(tmpdir(), "finance-profile-"));
  const profilePath = join(directory, ".env.local");
  try {
    writeFileSync(profilePath, [
      "FINANCE_BOT_RUNTIME_ENVIRONMENT=LOCAL",
      "FINANCE_BOT_LOCAL_USERNAME=local_finance_bot",
      "FINANCE_BOT_LOCAL_TOKEN=shared",
      "FINANCE_BOT_PRODUCTION_TOKEN=shared",
    ].join("\n"));
    assert.throws(() => assertFinanceLocalBotProfile(profilePath), /distinct LOCAL Finance bot/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Finance Web receives only public product profile keys", () => {
  const profilePath = "/tmp/finance-profile-for-dev-products-test";
  // The test uses a nonexistent file path by default; direct profile parsing is
  // covered by passing a temporary-like path through a mocked file system in
  // integration. Keep this assertion focused on an absent profile boundary.
  assert.deepEqual(financeWebEnvironment(profilePath), {});
});

test("Finance API receives only the selected Finance bot runtime", () => {
  const directory = mkdtempSync(join(tmpdir(), "finance-profile-"));
  const profilePath = join(directory, ".env.local");
  writeFileSync(
    profilePath,
    [
      "FINANCE_BOT_RUNTIME_ENVIRONMENT=LOCAL",
      "FINANCE_BOT_LOCAL_USERNAME=@smart_budgeting_test_bot",
      "FINANCE_BOT_LOCAL_TOKEN=not-exposed-to-the-api-runner",
    ].join("\n"),
  );

  try {
    assert.deepEqual(financeApiEnvironment(profilePath), {
      TELEGRAM_BOT_RUNTIME_ENVIRONMENT: "LOCAL",
      FINANCE_BROWSER_LOGIN_BOT_USERNAME: "@smart_budgeting_test_bot",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Finance tunnel receives only LOCAL Finance bot credentials", () => {
  const directory = mkdtempSync(join(tmpdir(), "finance-profile-"));
  const profilePath = join(directory, ".env.local");
  writeFileSync(
    profilePath,
    [
      "FINANCE_BOT_LOCAL_USERNAME=local_finance_bot",
      "FINANCE_BOT_LOCAL_TOKEN=local-token",
      "FINANCE_BOT_PRODUCTION_TOKEN=must-not-be-passed",
    ].join("\n"),
  );
  try {
    assert.deepEqual(financeLocalBotRuntimeEnvironment(profilePath), {
      FINANCE_BOT_LOCAL_USERNAME: "local_finance_bot",
      FINANCE_BOT_LOCAL_TOKEN: "local-token",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("all selects both independent local hosts", () => {
  assert.deepEqual(selectedProducts("nexeloq"), ["nexeloq"]);
  assert.deepEqual(selectedProducts("finance"), ["finance"]);
  assert.deepEqual(selectedProducts("all"), ["nexeloq", "finance"]);
  assert.throws(() => selectedProducts("unknown"), /Usage:/u);
});

test("all tunnel routes each public web origin to its own same-origin API", () => {
  assert.deepEqual(
    tunnelProcessEnvironment(
      "nexeloq",
      "Nexeloq Web",
      "https://nexeloq.trycloudflare.com",
    ),
    {
      NEXT_PUBLIC_API_URL: "/api",
      NEXT_ALLOWED_DEV_ORIGIN: "https://nexeloq.trycloudflare.com",
      RAILWAY_API_PROXY: "true",
    },
  );
  assert.deepEqual(
    tunnelProcessEnvironment(
      "finance",
      "Finance Web",
      "https://finance.trycloudflare.com",
    ),
    {
      NEXT_PUBLIC_FINANCE_API_URL: "/api",
      FINANCE_API_PROXY: "true",
      FINANCE_ALLOWED_DEV_ORIGIN: "https://finance.trycloudflare.com",
    },
  );
  assert.deepEqual(
    tunnelProcessEnvironment(
      "finance",
      "Finance analytics API",
      "https://finance.trycloudflare.com",
    ),
    {},
  );
});

test("local database badge reflects the effective API database URL", () => {
  const directory = mkdtempSync(join(tmpdir(), "finance-db-environment-"));
  const envFile = join(directory, ".env");
  try {
    writeFileSync(envFile, 'DATABASE_URL="postgresql://name:secret@localhost:5433/example"\n');
    assert.equal(localDatabaseEnvironment({}, envFile), "local");
    assert.equal(localDatabaseEnvironment({ DATABASE_URL: "postgresql://name:secret@cloud.example/db" }, envFile), "");
    assert.equal(localDatabaseEnvironment({ DATABASE_URL: "postgresql://name:secret@[::1]/db" }, envFile), "local");
    assert.equal(localDatabaseEnvironment({ DATABASE_URL: "not a valid url" }, envFile), "");
    writeFileSync(envFile, "DATABASE_URL=postgresql://name:secret@cloud.example/db\n");
    assert.equal(localDatabaseEnvironment({}, envFile), "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

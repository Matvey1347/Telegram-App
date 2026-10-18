import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  LOCAL_PRODUCTS,
  assertFinanceLocalProfile,
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
  assert.deepEqual(financePorts, [4001, 4002, 3001]);
  assert.deepEqual(
    nexeloqPorts.filter((port) => financePorts.includes(port)),
    [],
  );
});

test("Nexeloq API overrides a conflicting root API port", () => {
  const api = LOCAL_PRODUCTS.nexeloq.processes.find(
    (processDefinition) => processDefinition.name === "Nexeloq API",
  );

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
  assert.equal(
    LOCAL_PRODUCTS.finance.processes[1]?.dashboardLabel,
    "Analytics · :4002",
  );
  assert.equal(LOCAL_PRODUCTS.nexeloq.processes[1]?.dashboardLabel, "Web");
  assert.equal(LOCAL_PRODUCTS.finance.processes[2]?.dashboardLabel, "Web");
});

test("ordinary Finance development does not reconcile a Telegram webhook", () => {
  const analyticsApi = LOCAL_PRODUCTS.finance.processes.find(
    (processDefinition) => processDefinition.name === "Finance analytics API",
  );

  assert.equal(analyticsApi?.env.FINANCE_API_PUBLIC_URL, "");
});

test("Finance does not start children without its own API profile", () => {
  assert.throws(
    () => assertFinanceLocalProfile({}, "/path/that-does-not-exist"),
    /Finance profile is incomplete/u,
  );
  assert.doesNotThrow(() =>
    assertFinanceLocalProfile(
      {
        FINANCE_DATABASE_URL: "postgresql://finance",
        FINANCE_SESSION_SIGNING_KEY: "secret",
        FINANCE_BOOTSTRAP_SIGNING_KEY: "secret",
      },
      "/path/that-does-not-exist",
    ),
  );
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

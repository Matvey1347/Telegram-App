import assert from "node:assert/strict";
import test from "node:test";
import {
  compactLine,
  createDevTerminalDashboard,
  createOutputCapture,
  dashboardLines,
  isUsefulDiagnostic,
} from "./dev-terminal-dashboard.mjs";

test("renders Nexeloq and Finance in separate dashboard columns", () => {
  const services = new Map([
    [
      "nexeloq-api",
      { column: "nexeloq", label: "API", detail: ":4000", state: "ready" },
    ],
    [
      "finance-api",
      { column: "finance", label: "API", detail: ":4001", state: "starting" },
    ],
  ]);
  const output = dashboardLines({
    title: "Local development",
    columns: [
      { id: "nexeloq", label: "Nexeloq" },
      { id: "finance", label: "Finance" },
    ],
    services,
  }).join("\n");

  assert.match(output, /Nexeloq/u);
  assert.match(output, /Finance/u);
  assert.match(output, /✓ API — :4000/u);
});

test("keeps dashboard borders aligned and clips a long public URL", () => {
  const services = new Map([
    [
      "nexeloq-cloudflare",
      {
        column: "nexeloq",
        label: "Cloudflare",
        detail: "https://baseline-commit-message.trycloudflare.com",
        state: "ready",
      },
    ],
    [
      "finance-cloudflare",
      {
        column: "finance",
        label: "Cloudflare",
        detail: "https://enhancement-preview.trycloudflare.com",
        state: "ready",
      },
    ],
  ]);
  const output = dashboardLines({
    title: "Local development",
    columns: [
      { id: "nexeloq", label: "Nexeloq" },
      { id: "finance", label: "Finance" },
    ],
    services,
    colors: true,
  });
  const visibleLines = output.map((line) =>
    line.replace(/\x1B\[[0-?]*[ -/]*[@-~]/gu, ""),
  );

  assert.ok(
    visibleLines.every((line) => line.length === visibleLines[0]?.length),
  );
  assert.match(output.join("\n"), /\x1B\[32m✓\x1B\[0m/u);
  assert.match(output.join("\n"), /Cloudflare — https:\/\/baseline-com…/u);
});

test("keeps each local web URL complete for terminal link detection", () => {
  const services = new Map([
    [
      "nexeloq-web",
      {
        column: "nexeloq",
        label: "Web",
        detail: "http://localhost:3000",
        state: "ready",
      },
    ],
  ]);
  const output = dashboardLines({
    title: "Local development",
    columns: [{ id: "nexeloq", label: "Nexeloq" }],
    services,
  }).join("\n");

  assert.match(output, /✓ Web — http:\/\/localhost:3000\s+│/u);
});

test("uses concise line updates when output is not an interactive terminal", () => {
  const output = [];
  const dashboard = createDevTerminalDashboard({
    columns: [{ id: "nexeloq", label: "Nexeloq" }],
    stream: { isTTY: false, write: (line) => output.push(line) },
    interactive: false,
  });
  dashboard.register("api", {
    column: "nexeloq",
    label: "API",
    detail: ":4000",
  });
  dashboard.update("api", "starting", "Starting");
  dashboard.update("api", "ready", "Ready");

  assert.deepEqual(output, [
    "⠋ nexeloq · API — Starting\n",
    "✓ nexeloq · API — Ready\n",
  ]);
});

test("animates only while a service is starting", async () => {
  const output = [];
  const dashboard = createDevTerminalDashboard({
    columns: [{ id: "nexeloq", label: "Nexeloq" }],
    stream: { isTTY: true, write: (line) => output.push(line) },
    interactive: true,
    spinnerIntervalMs: 5,
  });
  dashboard.register("api", { column: "nexeloq", label: "API" });
  dashboard.update("api", "starting", "Starting");
  await new Promise((resolve) => setTimeout(resolve, 25));
  const animatedFrames = output.length;

  dashboard.update("api", "ready", "http://localhost:4000");
  const completedFrames = output.length;
  await new Promise((resolve) => setTimeout(resolve, 15));
  dashboard.dispose();

  assert.ok(animatedFrames > 1);
  assert.equal(output.length, completedFrames);
});

test("clears the TTY panel before printing a failure excerpt", () => {
  const output = [];
  const errors = [];
  const dashboard = createDevTerminalDashboard({
    columns: [{ id: "nexeloq", label: "Nexeloq" }],
    stream: { isTTY: true, write: (line) => output.push(line) },
    errorStream: { write: (line) => errors.push(line) },
    interactive: true,
  });
  dashboard.register("api", { column: "nexeloq", label: "API" });
  dashboard.render();
  dashboard.fail("api", new Error("did not become ready"), ["ERROR in api.ts"]);

  assert.match(output.join(""), /\x1B\[\d+A\x1B\[0J/u);
  assert.match(errors.join(""), /ERROR in api.ts/u);
});

test("captures only bounded diagnostic output from child processes", () => {
  const diagnostics = [];
  const capture = createOutputCapture({
    onDiagnostic: (line) => diagnostics.push(line),
  });
  capture.write("Webpack compiled successfully\nERROR in src/app.ts: TS2339\n");

  assert.deepEqual(diagnostics, ["ERROR in src/app.ts: TS2339"]);
  assert.equal(capture.recentLines().length, 2);
  assert.equal(isUsefulDiagnostic("(node:1) Warning: harmless"), false);
  assert.equal(isUsefulDiagnostic("Prisma schema loaded successfully"), false);
  assert.equal(
    isUsefulDiagnostic("Warning: cannot resolve optional source map"),
    false,
  );
  assert.equal(isUsefulDiagnostic("ERROR in src/app.ts: TS2339"), true);
  assert.equal(compactLine(" one\n two "), "one two");
});

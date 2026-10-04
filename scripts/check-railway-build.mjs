import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const railwayConfig = JSON.parse(readFileSync("railway.json", "utf8"));

assert.match(railwayConfig.build?.buildCommand ?? "", /shared build/);
assert.match(railwayConfig.build?.buildCommand ?? "", /api build/);
assert.match(railwayConfig.build?.buildCommand ?? "", /web build/);
assert.match(railwayConfig.build?.buildCommand ?? "", /RAILWAY_API_PROXY=true/);
assert.equal(
  railwayConfig.deploy?.preDeployCommand,
  "pnpm --filter api run db:deploy:safe",
);
assert.equal(
  railwayConfig.deploy?.startCommand,
  "node scripts/start-railway.mjs",
);
assert.equal(railwayConfig.deploy?.healthcheckPath, "/api/health");
assert.ok(existsSync("packages/shared/dist/telegram-table-markup.js"));
assert.ok(existsSync("apps/api/dist/main.js"));
assert.ok(existsSync("apps/web/.next/BUILD_ID"));
assert.ok(existsSync("scripts/start-railway.mjs"));

const require = createRequire(import.meta.url);
const standaloneMarkupModule = "apps/api/dist/telegram/shared/markup/telegram-markup.js";
if (existsSync(standaloneMarkupModule)) {
  require("../apps/api/dist/telegram/shared/markup/telegram-markup.js");
} else {
  // Product source lives outside the Nest app root, so Nest emits its normal
  // single runtime bundle. Parse the bundle without evaluating bootstrap code.
  execFileSync(process.execPath, ["--check", "apps/api/dist/main.js"], {
    stdio: "inherit",
  });
}

console.log("Railway production artifacts and Node runtime imports are valid.");

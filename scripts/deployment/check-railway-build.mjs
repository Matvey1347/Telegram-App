import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const config = (file) => JSON.parse(read(file));
const root = config("railway.json");
const financeApi = config("apps/standalone/finance/api/railway.json");
const financeWeb = config("apps/standalone/finance/web/railway.json");

function dockerBuild(service, path, requiredSteps) {
  assert.equal(service.build.builder, "DOCKERFILE");
  assert.equal(service.build.dockerfilePath, path);
  const dockerfile = read(path).replace(/\\\r?\n/g, " ");
  assert.match(dockerfile, /^FROM node:20\.19\.0-/m);
  const commands = dockerfile.split("\n").filter((line) => line.startsWith("RUN ")).join("\n");
  let previous = -1;
  for (const step of ["pnpm install --frozen-lockfile", ...requiredSteps]) {
    const position = commands.indexOf(step, previous + 1);
    assert.ok(position > previous, `${path} is missing the ordered build step: ${step}`);
    previous = position;
  }
}

dockerBuild(root, "Dockerfile", [
  "pnpm --filter api exec prisma generate",
  "pnpm --filter @telegram-system/shared build",
  "pnpm --filter api build",
  "NEXT_PUBLIC_API_URL=/api RAILWAY_API_PROXY=true pnpm --filter web build",
  "pnpm --filter finance-api prisma:generate",
  "pnpm --filter finance-api build",
]);
assert.equal(root.deploy.preDeployCommand, "pnpm --filter api run db:deploy:safe");
assert.equal(root.deploy.startCommand, "node scripts/deployment/start-railway.mjs");
assert.equal(root.deploy.healthcheckPath, "/api/health");

dockerBuild(financeApi, "apps/standalone/finance/api/Dockerfile", [
  "pnpm --filter finance-api prisma:generate",
  "pnpm --filter finance-api build",
]);
assert.equal(financeApi.deploy.preDeployCommand, "pnpm --filter finance-api prisma:migrate:deploy");
assert.equal(financeApi.deploy.startCommand, "node apps/standalone/finance/api/dist/main.js");
assert.equal(financeApi.deploy.healthcheckPath, "/api/health/ready");
assert.equal(financeWeb.build.builder, "RAILPACK");
assert.match(financeWeb.build.buildCommand, /NEXT_PUBLIC_FINANCE_API_URL=\/api pnpm --filter @telegram-system\/finance-web build/);
assert.equal(financeWeb.deploy.startCommand, "pnpm --filter @telegram-system/finance-web start");
assert.equal(financeWeb.deploy.healthcheckPath, "/health");

const artifacts = {
  shared: "packages/shared/dist/telegram-table-markup.js",
  api: "apps/api/dist/main.js",
  web: "apps/web/.next/BUILD_ID",
  "finance-api": "apps/standalone/finance/api/dist/main.js",
  "finance-web": "apps/standalone/finance/web/.next/BUILD_ID",
};

for (const target of process.argv.slice(2)) {
  assert.ok(Object.hasOwn(artifacts, target), `Unknown build target: ${target}`);
  const path = new URL(`../../${artifacts[target]}`, import.meta.url);
  assert.ok(existsSync(path), `Missing artifact: ${artifacts[target]}`);
  if (path.pathname.endsWith(".js")) {
    execFileSync(process.execPath, ["--check", fileURLToPath(path)], { stdio: "inherit" });
  } else {
    assert.ok(readFileSync(path, "utf8").trim(), `Empty build identifier: ${artifacts[target]}`);
  }
}

console.log("Railway build configuration and requested artifacts verified.");

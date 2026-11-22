import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

process.chdir(fileURLToPath(new URL("../../", import.meta.url)));

function run(command, options = {}) {
  return execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function tryRun(command, options = {}) {
  try {
    return run(command, options);
  } catch {
    return "";
  }
}

function getBaseRef() {
  const envBase = process.env.GITHUB_BASE_REF;
  if (envBase) {
    const remoteBase = `origin/${envBase}`;
    const exists = tryRun(`git rev-parse --verify ${remoteBase}`);
    if (exists) return remoteBase;
  }

  for (const candidate of ["origin/main", "origin/master", "main", "master"]) {
    const exists = tryRun(`git rev-parse --verify ${candidate}`);
    if (exists) return candidate;
  }

  const previous = tryRun("git rev-parse --verify HEAD~1");
  return previous || "";
}

function changedFiles() {
  const base = getBaseRef();
  const diffAgainstBase = base
    ? tryRun(`git diff --name-only ${base}...HEAD -- .`)
    : "";
  const staged = tryRun("git diff --name-only --cached -- .");
  const unstaged = tryRun("git diff --name-only -- .");
  const untracked = tryRun("git ls-files --others --exclude-standard");

  return [
    ...new Set(
      [diffAgainstBase, staged, unstaged, untracked]
        .flatMap((value) => value.split("\n"))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function touchesAny(paths, prefixes) {
  return paths.some((path) => prefixes.some((prefix) => path.startsWith(prefix)));
}

function main() {
  const files = changedFiles();
  const release = process.argv.includes("--release");
  const touchesRootConfig = touchesAny(files, [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ".github/",
    "scripts/",
  ]);
  const fullCheck = !files.length || touchesRootConfig;
  if (fullCheck && !release) {
    console.log("Running full check.");
    execSync("pnpm check", { stdio: "inherit" });
    return;
  }

  const commands = [];
  commands.push("pnpm architecture:check");
  const affected = (prefixes) => fullCheck || touchesAny(files, prefixes);

  if (affected(["packages/shared/"])) {
    commands.push("pnpm --filter @telegram-system/shared lint");
    commands.push("pnpm --filter @telegram-system/shared typecheck");
    commands.push("pnpm --filter @telegram-system/shared build");
  }

  if (affected(["apps/api/", "products/finance/api/", "products/finance/bot/"])) {
    commands.push("pnpm db:generate");
    commands.push("pnpm --filter api lint");
    commands.push("pnpm --filter api typecheck");
    commands.push("pnpm --filter api exec jest --runInBand");
    commands.push("pnpm --filter api build");
  }

  if (affected(["apps/web/"])) {
    commands.push("pnpm i18n:check");
    commands.push("pnpm --filter web lint");
    commands.push("pnpm --filter web typecheck");
    commands.push("pnpm --filter web exec vitest run");
    commands.push("pnpm --filter web build");
  }

  if (affected(["apps/standalone/finance/", "products/finance/"])) {
    commands.push("pnpm --filter finance-api prisma:generate");
    commands.push("pnpm --filter finance-api typecheck");
    commands.push("pnpm --filter finance-api test");
    commands.push("pnpm --filter finance-api build");
    commands.push("pnpm --filter @telegram-system/finance-web typecheck");
    commands.push("pnpm --filter @telegram-system/finance-web exec vitest run");
    commands.push("pnpm --filter @telegram-system/finance-web build");
  }

  if (!commands.length) {
    console.log("Only docs or non-runtime files changed. No targeted checks needed.");
    return;
  }

  for (const command of commands) {
    console.log(`\n$ ${command}`);
    try {
      execSync(command, { stdio: "inherit" });
    } catch (error) {
      // Match the legacy lint report steps in the GitHub CI workflow.
      if (!release || !["pnpm --filter api lint", "pnpm --filter web lint"].includes(command)) {
        throw error;
      }
      console.warn(`Lint report failed: ${command}`);
    }
  }
}

main();

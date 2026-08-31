import fs from "node:fs";
import path from "node:path";
import {
  inspectArchitectureExceptionInventory,
  inspectArchitectureSource,
} from "./architecture-policy.mjs";

const root = process.cwd();

const RECOMMENDED_MIN = 100;
const RECOMMENDED_MAX = 400;
const WARNING_LIMIT = 500;
const HARD_LIMIT = 800;
const PAGE_LIMIT = 300;
const API_FACADE_LIMIT = 400;
const TYPE_BARREL_LIMIT = 250;
const UI_BARREL_LIMIT = 150;
const STRICT_MODE = process.env.ARCHITECTURE_STRICT === "1";

// Transitional baseline: these files must shrink and may never grow.
// Final strict mode ignores this map and fails every production file above policy.
const TRANSITION_BASELINE = new Map([
  ["apps/web/src/app/(internal)/(telegram)/telegram-posts/page.tsx", 7950],
  [
    "apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.ts",
    5708,
  ],
  [
    "apps/web/src/app/(internal)/(telegram)/telegram/channels/[id]/page.tsx",
    3867,
  ],
  ["apps/web/src/app/(internal)/(telegram)/telegram-channels/page.tsx", 2910],
  ["apps/api/src/telegram/shared/telegram-mtproto.client.ts", 3433],
  ["apps/web/src/components/features/growth/ad-sales/ad-sales-page.tsx", 1002],
  ["apps/web/src/lib/api.ts", 750],
  ["apps/web/src/app/(internal)/(growth)/ad-campaigns/page.tsx", 2464],
  ["apps/api/src/domains/growth/ad-campaigns/ad-campaigns.service.ts", 1793],
  ["apps/web/src/components/ui/primitives.tsx", 1747],
  [
    "apps/web/src/components/features/growth/ad-campaigns/campaigns-table.tsx",
    1242,
  ],
  [
    "apps/api/src/domains/telegram/telegram-user-accounts/telegram-user-accounts.service.ts",
    1141,
  ],
  [
    "apps/web/src/components/features/telegram/telegram/telegram-account-panels.tsx",
    1083,
  ],
  ["apps/web/src/components/icons/icon-picker.tsx", 1165],
  [
    "apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-runtime.service.ts",
    888,
  ],
  ["apps/api/src/domains/growth/ad-hypotheses/ad-hypotheses.service.ts", 903],
  [
    "apps/web/src/components/features/telegram/telegram/telegram-post-preview.tsx",
    1156,
  ],
  ["apps/api/src/domains/finance/transactions/transactions.service.ts", 797],
  ["apps/web/src/app/(internal)/(operations)/system-logs/page.tsx", 806],
  ["apps/web/src/app/(internal)/page.tsx", 646],
  [
    "apps/web/src/app/(internal)/(telegram)/telegram-channel-networks/[id]/page.tsx",
    330,
  ],
  ["apps/web/src/app/(internal)/(growth)/ad-campaigns/[id]/page.tsx", 421],
]);

const PRODUCTION_ROOTS = [
  "apps/api/src",
  "apps/web/src",
  "packages/shared/src",
];

const IGNORED_SEGMENTS = new Set([
  ".next",
  "coverage",
  "dist",
  "generated",
  "migrations",
  "node_modules",
  "__fixtures__",
  "fixtures",
  "__snapshots__",
]);

function isProductionSource(filePath) {
  return (
    /\.(ts|tsx)$/.test(filePath) &&
    !/\.d\.ts$/.test(filePath) &&
    !/\.(spec|test)\.(ts|tsx)$/.test(filePath)
  );
}

function isIgnored(relativePath) {
  return relativePath
    .split(path.sep)
    .some((segment) => IGNORED_SEGMENTS.has(segment));
}

function walk(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath);
    if (isIgnored(relativePath)) continue;
    if (entry.isDirectory()) {
      walk(absolutePath, files);
    } else if (isProductionSource(absolutePath)) {
      files.push(relativePath.split(path.sep).join("/"));
    }
  }
  return files;
}

function lineCount(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8").split(/\r?\n/)
    .length;
}

function policyLimit(file) {
  if (file.endsWith("/page.tsx")) return PAGE_LIMIT;
  if (file === "apps/web/src/lib/api.ts") return API_FACADE_LIMIT;
  if (/\/index\.(ts|tsx)$/.test(file) && file.includes("/components/ui/")) {
    return UI_BARREL_LIMIT;
  }
  if (/\/index\.ts$/.test(file) || /\/types\.ts$/.test(file)) {
    return TYPE_BARREL_LIMIT;
  }
  return HARD_LIMIT;
}

const files = PRODUCTION_ROOTS.flatMap((sourceRoot) =>
  walk(path.join(root, sourceRoot)),
).sort();

const warnings = [];
const failures = [];

for (const file of files) {
  const lines = lineCount(file);
  const allowedLines = STRICT_MODE ? undefined : TRANSITION_BASELINE.get(file);
  const limit = policyLimit(file);

  if (lines > WARNING_LIMIT) {
    warnings.push({ file, lines, allowedLines, limit });
  }

  if (allowedLines != null) {
    if (lines > allowedLines) {
      failures.push(
        `${file} has grown from legacy allowance ${allowedLines} to ${lines} lines.`,
      );
    } else if (lines < allowedLines) {
      failures.push(
        `${file} shrank from legacy allowance ${allowedLines} to ${lines} lines; lower or remove the stale allowance.`,
      );
    }
  } else if (lines > limit) {
    failures.push(`${file} is ${lines} lines, above hard policy ${limit}.`);
  }

  failures.push(
    ...inspectArchitectureSource(
      file,
      fs.readFileSync(path.join(root, file), "utf8"),
    ),
  );
}

for (const file of TRANSITION_BASELINE.keys()) {
  if (!files.includes(file)) {
    failures.push(
      `${file} no longer exists; remove its stale file-size allowance.`,
    );
  }
}
failures.push(...inspectArchitectureExceptionInventory(files));

if (warnings.length) {
  console.log(
    `Architecture file-size warnings (recommended ${RECOMMENDED_MIN}-${RECOMMENDED_MAX}, warning>${WARNING_LIMIT}, strict=${STRICT_MODE ? "on" : "off"}):`,
  );
  for (const warning of warnings.sort((a, b) => b.lines - a.lines)) {
    const legacy = warning.allowedLines
      ? ` transitional allowance=${warning.allowedLines}`
      : "";
    console.log(
      `- ${warning.file}: ${warning.lines} lines hard=${warning.limit}${legacy}`,
    );
  }
}

if (failures.length) {
  console.error("\nArchitecture check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Architecture check passed: ${files.length} production TS/TSX files scanned.`,
);

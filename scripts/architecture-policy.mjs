import path from "node:path";

const API_BOTS_ROOT = "apps/api/src/domains/telegram/telegram-bots";
const BOT_CORE_ROOT = `${API_BOTS_ROOT}/core`;
const BOT_FINANCE_ROOT = `${API_BOTS_ROOT}/finance`;
const BOT_GREETER_ROOT = `${API_BOTS_ROOT}/greeter`;
const CONSUMER_FINANCE_API_ROOT =
  "apps/api/src/domains/telegram/consumer-finance";
const INTERNAL_FINANCE_API_ROOT = "apps/api/src/domains/finance";
const CONSUMER_FINANCE_APP_ROOT = "apps/web/src/app/(consumer-finance)";
const CONSUMER_FINANCE_UI_ROOT =
  "apps/web/src/components/features/finance/consumer-finance";
const INTERNAL_FINANCE_WEB_LIB_ROOT = "apps/web/src/lib/features/finance";

function normalize(value) {
  return value.split(path.sep).join("/").replace(/\/+/g, "/");
}

function within(file, root) {
  return file === root || file.startsWith(`${root}/`);
}

export function staticImports(source) {
  const imports = [];
  const declaration =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/g;
  const dynamic = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const expression of [declaration, dynamic]) {
    let match;
    while ((match = expression.exec(source)) !== null) imports.push(match[1]);
  }
  return imports;
}

export function resolveImport(sourceFile, specifier) {
  if (specifier.startsWith("@/")) {
    return normalize(path.join("apps/web/src", specifier.slice(2)));
  }
  if (specifier.startsWith(".")) {
    return normalize(path.join(path.dirname(sourceFile), specifier));
  }
  return specifier;
}

const LEGACY_IMPORT_EXCEPTIONS = new Map();

function allowImport(source, target, reason, removalSlice) {
  LEGACY_IMPORT_EXCEPTIONS.set(`${source}::${target}`, {
    reason,
    removalSlice,
  });
}

const scheduledGreeterSource =
  "apps/api/src/domains/operations/scheduled-tasks/scheduled-task-executor.service.ts";
for (const service of [
  "greeter-expiry.service",
  "greeter-broadcast.service",
  "greeter-automation.service",
]) {
  allowImport(
    scheduledGreeterSource,
    `${BOT_GREETER_ROOT}/${service}`,
    "The platform scheduler invokes a concrete Greeter use case directly.",
    "Register product-owned scheduled handlers behind a stable scheduler port.",
  );
}

const consumerUiRoot = CONSUMER_FINANCE_UI_ROOT;

const LEGACY_PATTERN_EXCEPTIONS = new Map();

function allowPattern(rule, file, maxOccurrences, reason, removalSlice) {
  LEGACY_PATTERN_EXCEPTIONS.set(`${rule}::${file}`, {
    maxOccurrences,
    reason,
    removalSlice,
  });
}

allowPattern(
  "controller-prisma",
  "apps/api/src/domains/telegram/telegram-sync/telegram-sync.controller.ts",
  2,
  "Legacy diagnostics controller performs a Prisma read directly.",
  "Telegram sync refactor: move diagnostic reads behind a focused service.",
);

allowPattern(
  "frontend-polling",
  `${consumerUiRoot}/consumer-finance-login.tsx`,
  1,
  "User-triggered five-minute browser-login challenge polls only while approval is pending.",
  "Keep bounded and user-triggered; replace only if an event-driven browser channel is introduced.",
);
allowPattern(
  "frontend-polling",
  "apps/web/src/components/features/telegram/telegram-bots/greeter/greeter-broadcasts-section.tsx",
  1,
  "Legacy UI polls every five seconds while any broadcast is SCHEDULED or PROCESSING; a far-future schedule can keep it active.",
  "Greeter network-cost refactor: use due-aware activation or event reconciliation and remove this exception.",
);

const pageSlice =
  "Frontend page decomposition: move queries, mutations and API access into a feature container.";
const pageHookAllowances = [
  ["(finance)/currencies/page.tsx", 6],
  ["(growth)/ad-campaigns/[id]/page.tsx", 5],
  ["(growth)/ad-campaigns/page.tsx", 27],
  ["(operations)/system-logs/page.tsx", 4],
  ["(telegram)/system-bot/connect/page.tsx", 3],
  ["(telegram)/telegram-channel-networks/[id]/page.tsx", 5],
  ["(telegram)/telegram-channels/page.tsx", 18],
  ["(telegram)/telegram-posts/page.tsx", 18],
  ["(telegram)/telegram/channels/[id]/page.tsx", 14],
  ["(workspace)/settings/page.tsx", 7],
  ["page.tsx", 6],
];
for (const [suffix, count] of pageHookAllowances) {
  allowPattern(
    "page-query-orchestration",
    `apps/web/src/app/(internal)/${suffix}`,
    count,
    "Legacy App Router page owns React Query orchestration.",
    pageSlice,
  );
}

const pageApiAllowances = [
  ["(finance)/currencies/page.tsx", 2],
  ["(growth)/ad-campaigns/[id]/page.tsx", 1],
  ["(growth)/ad-campaigns/page.tsx", 3],
  ["(operations)/system-logs/page.tsx", 1],
  ["(telegram)/system-bot/connect/page.tsx", 1],
  ["(telegram)/telegram-channel-networks/[id]/page.tsx", 1],
  ["(telegram)/telegram-channels/page.tsx", 4],
  ["(telegram)/telegram-posts/page.tsx", 6],
  ["(telegram)/telegram/channels/[id]/page.tsx", 2],
  ["(workspace)/settings/page.tsx", 1],
  ["page.tsx", 3],
];
for (const [suffix, count] of pageApiAllowances) {
  allowPattern(
    "page-api-import",
    `apps/web/src/app/(internal)/${suffix}`,
    count,
    "Legacy App Router page imports a domain API/helper directly.",
    pageSlice,
  );
}

function importException(source, target) {
  return LEGACY_IMPORT_EXCEPTIONS.get(`${source}::${target}`);
}

function patternViolation(file, rule, count, message) {
  const exception = LEGACY_PATTERN_EXCEPTIONS.get(`${rule}::${file}`);
  if (!exception) {
    return count > 0
      ? `${message} (${count} occurrence${count === 1 ? "" : "s"}).`
      : null;
  }
  if (count > exception.maxOccurrences) {
    return `${message}: grew from legacy allowance ${exception.maxOccurrences} to ${count}.`;
  }
  if (count < exception.maxOccurrences) {
    return `${file} reduced ${rule} debt from ${exception.maxOccurrences} to ${count}; lower or remove its stale exception.`;
  }
  return null;
}

function isConsumerFinanceWeb(file) {
  return (
    within(file, CONSUMER_FINANCE_APP_ROOT) ||
    within(file, CONSUMER_FINANCE_UI_ROOT) ||
    file.startsWith("apps/web/src/lib/features/finance/consumer-finance-") ||
    file.startsWith("apps/web/src/providers/consumer-finance-")
  );
}

function apiProduct(file) {
  if (
    within(file, BOT_FINANCE_ROOT) ||
    within(file, CONSUMER_FINANCE_API_ROOT)
  ) {
    return "finance";
  }
  if (within(file, BOT_GREETER_ROOT)) return "greeter";
  return null;
}

function importRule(source, specifier, target) {
  if (
    within(source, "packages/shared/src") &&
    (specifier === "react" ||
      specifier.startsWith("react/") ||
      specifier === "next" ||
      specifier.startsWith("next/") ||
      specifier.startsWith("@nestjs/") ||
      specifier === "@prisma/client")
  ) {
    return "Shared contracts cannot depend on React, Next, NestJS, or Prisma runtime types.";
  }
  if (
    within(source, "apps/api/src/domains") &&
    (specifier === "react" ||
      specifier.startsWith("react/") ||
      specifier === "next" ||
      specifier.startsWith("next/"))
  ) {
    return "Backend domain/application code cannot depend on React or Next presentation details.";
  }

  if (
    (specifier === "telegram" || specifier.startsWith("telegram/")) &&
    !within(source, "apps/api/src/telegram/shared")
  ) {
    return "Low-level Telegram SDK imports belong in apps/api/src/telegram/shared.";
  }

  const sourceProduct = apiProduct(source);
  const targetProduct = apiProduct(target);
  const compositionRoot = `${API_BOTS_ROOT}/telegram-bots.module.ts`;

  if (
    targetProduct &&
    source !== compositionRoot &&
    sourceProduct !== targetProduct
  ) {
    if (within(source, BOT_CORE_ROOT)) {
      return `Telegram bot core/platform cannot import ${targetProduct} product internals.`;
    }
    if (sourceProduct) {
      return `Independent ${sourceProduct} and ${targetProduct} products cannot import each other.`;
    }
    return `Only the Telegram bot composition root may import ${targetProduct} product internals.`;
  }

  const sourceConsumerApi =
    within(source, BOT_FINANCE_ROOT) ||
    within(source, CONSUMER_FINANCE_API_ROOT);
  const targetConsumerApi =
    within(target, BOT_FINANCE_ROOT) ||
    within(target, CONSUMER_FINANCE_API_ROOT);
  const sourceInternalApi = within(source, INTERNAL_FINANCE_API_ROOT);
  const targetInternalApi = within(target, INTERNAL_FINANCE_API_ROOT);
  if (
    (sourceConsumerApi && targetInternalApi) ||
    (sourceInternalApi && targetConsumerApi)
  ) {
    return "Internal Finance and consumer Finance implementation paths are separate products.";
  }
  if (
    within(source, CONSUMER_FINANCE_API_ROOT) &&
    within(target, BOT_FINANCE_ROOT)
  ) {
    return "Consumer Finance business/HTTP code cannot depend on its Telegram runtime adapter.";
  }

  const sourceConsumerWeb = isConsumerFinanceWeb(source);
  if (
    sourceConsumerWeb &&
    within(target, INTERNAL_FINANCE_WEB_LIB_ROOT) &&
    !target.includes("/consumer-finance-")
  ) {
    return "Consumer Finance cannot import internal Finance web implementation.";
  }
  if (
    sourceConsumerWeb &&
    within(target, "apps/web/src/components/features") &&
    !within(target, CONSUMER_FINANCE_UI_ROOT)
  ) {
    return "Consumer Finance cannot import another product's feature UI.";
  }
  if (
    sourceConsumerWeb &&
    (within(target, "apps/web/src/components/ui") ||
      within(target, "apps/web/src/components/icons") ||
      (within(target, "apps/web/src/providers") &&
        !target.startsWith("apps/web/src/providers/consumer-finance-")))
  ) {
    return "Consumer Finance owns its visual components and provider state; it cannot import Telegram System product UI/providers.";
  }
  if (sourceConsumerWeb && target === "apps/web/src/lib/api") {
    return "Consumer Finance components must use their consumer-owned API boundary, not the internal API facade.";
  }
  if (sourceConsumerWeb && target === "apps/web/src/lib/query-keys") {
    return "Consumer Finance owns its query-key and cache boundary.";
  }
  if (isConsumerFinanceWeb(target) && !sourceConsumerWeb) {
    return "Consumer Finance UI/API/state implementation cannot be imported by another product.";
  }

  return null;
}

export function inspectArchitectureSource(file, source) {
  const normalizedFile = normalize(file);
  const failures = [];
  const imports = staticImports(source);
  const resolvedTargets = new Set();

  for (const specifier of imports) {
    const target = resolveImport(normalizedFile, specifier);
    resolvedTargets.add(target);
    const message = importRule(normalizedFile, specifier, target);
    if (message && !importException(normalizedFile, target)) {
      failures.push(`${normalizedFile} imports ${target}: ${message}`);
    }
  }

  for (const key of LEGACY_IMPORT_EXCEPTIONS.keys()) {
    const separator = key.indexOf("::");
    const exceptionSource = key.slice(0, separator);
    const exceptionTarget = key.slice(separator + 2);
    if (
      exceptionSource === normalizedFile &&
      !resolvedTargets.has(exceptionTarget)
    ) {
      failures.push(
        `${normalizedFile} no longer imports ${exceptionTarget}; remove its stale legacy import exception.`,
      );
    }
  }

  if (
    isConsumerFinanceWeb(normalizedFile) &&
    /\btable-scroll\b/u.test(source)
  ) {
    failures.push(
      `${normalizedFile} uses Telegram System's global table-scroll presentation instead of Finance-owned table styles.`,
    );
  }

  const environmentCount = (source.match(/\bprocess\.env\b/g) ?? []).length;
  const approvedEnvironmentBoundary =
    normalizedFile === "apps/api/src/main.ts" ||
    normalizedFile === "apps/api/src/prisma/prisma.service.ts" ||
    within(normalizedFile, "apps/api/src/config") ||
    within(normalizedFile, "apps/web/src/config");
  if (!approvedEnvironmentBoundary) {
    const failure = patternViolation(
      normalizedFile,
      "environment-access",
      environmentCount,
      `${normalizedFile} reads process.env outside an approved configuration boundary`,
    );
    if (failure) failures.push(failure);
  }

  const pollingCount = (source.match(/\brefetchInterval\s*:/g) ?? []).length;
  const pollingFailure = patternViolation(
    normalizedFile,
    "frontend-polling",
    pollingCount,
    `${normalizedFile} adds frontend polling without a documented bounded exception`,
  );
  if (pollingFailure) failures.push(pollingFailure);

  const clientConstructorCount = (source.match(/\baxios\.create\s*\(/g) ?? [])
    .length;
  if (
    clientConstructorCount > 0 &&
    normalizedFile !== "apps/web/src/lib/api.ts" &&
    !within(normalizedFile, "apps/web/src/lib/http")
  ) {
    failures.push(
      `${normalizedFile} creates a duplicate HTTP client outside the approved transport boundary (${clientConstructorCount} occurrence${clientConstructorCount === 1 ? "" : "s"}).`,
    );
  }

  if (normalizedFile.endsWith(".controller.ts")) {
    const prismaCount = (source.match(/\bPrismaService\b/g) ?? []).length;
    const prismaFailure = patternViolation(
      normalizedFile,
      "controller-prisma",
      prismaCount,
      `${normalizedFile} references PrismaService from a presentation controller`,
    );
    if (prismaFailure) failures.push(prismaFailure);
  }

  if (normalizedFile.endsWith("/page.tsx")) {
    const queryCount = (
      source.match(/\b(?:useQuery|useMutation|useQueryClient)\s*\(/g) ?? []
    ).length;
    const queryFailure = patternViolation(
      normalizedFile,
      "page-query-orchestration",
      queryCount,
      `${normalizedFile} owns React Query orchestration instead of rendering a feature container`,
    );
    if (queryFailure) failures.push(queryFailure);

    const apiImportCount = imports.filter(
      (specifier) =>
        specifier === "@/lib/api" || specifier.startsWith("@/lib/features/"),
    ).length;
    const apiFailure = patternViolation(
      normalizedFile,
      "page-api-import",
      apiImportCount,
      `${normalizedFile} imports domain API/helper implementation directly`,
    );
    if (apiFailure) failures.push(apiFailure);
  }

  return failures;
}

export function inspectArchitectureExceptionInventory(existingFiles) {
  const files = new Set(existingFiles);
  const failures = [];
  const configuredKeys = [
    ...LEGACY_IMPORT_EXCEPTIONS.keys(),
    ...LEGACY_PATTERN_EXCEPTIONS.keys(),
  ];
  for (const key of configuredKeys) {
    const separator = key.indexOf("::");
    const source = key.slice(separator + 2);
    const file =
      key.startsWith("apps/") || key.startsWith("packages/")
        ? key.slice(0, separator)
        : source;
    if (!files.has(file)) {
      failures.push(
        `${file} no longer exists; remove its stale architecture exception.`,
      );
    }
  }
  return [...new Set(failures)];
}

export const architecturePolicyInternals = {
  LEGACY_IMPORT_EXCEPTIONS,
  LEGACY_PATTERN_EXCEPTIONS,
};

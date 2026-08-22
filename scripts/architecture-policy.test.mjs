import assert from "node:assert/strict";
import test from "node:test";
import {
  architecturePolicyInternals,
  inspectArchitectureExceptionInventory,
  inspectArchitectureSource,
  resolveImport,
  staticImports,
} from "./architecture-policy.mjs";

test("extracts and resolves static imports without a TypeScript compiler", () => {
  const source = `
    import type { A } from "../core/a";
    export { B } from '@/lib/b';
    const lazy = import("./lazy");
  `;
  assert.deepEqual(staticImports(source), ["../core/a", "@/lib/b", "./lazy"]);
  assert.equal(
    resolveImport("apps/api/src/domains/example/file.ts", "../core/a"),
    "apps/api/src/domains/core/a",
  );
  assert.equal(
    resolveImport("apps/web/src/example.ts", "@/lib/b"),
    "apps/web/src/lib/b",
  );
});

test("rejects platform imports of product implementation", () => {
  const failures = inspectArchitectureSource(
    "apps/api/src/domains/telegram/telegram-bots/core/new-dispatcher.ts",
    `import { FinanceCoreService } from "../../consumer-finance/catalog/finance-core.service";`,
  );
  assert.match(failures.join("\n"), /core\/platform cannot import finance/);
});

test("rejects imports between independent bot products", () => {
  const failures = inspectArchitectureSource(
    "apps/api/src/domains/telegram/telegram-bots/greeter/new-rule.ts",
    `import { FinanceCoreService } from "../../consumer-finance/catalog/finance-core.service";`,
  );
  assert.match(failures.join("\n"), /products cannot import each other/);
});

test("keeps internal Finance separate from consumer Finance", () => {
  const failures = inspectArchitectureSource(
    "apps/api/src/domains/telegram/consumer-finance/catalog/new-use-case.ts",
    `import { AccountsService } from "../../../finance/accounts/accounts.service";`,
  );
  assert.match(failures.join("\n"), /separate products/);
});

test("consumer Finance business does not depend on its Telegram adapter", () => {
  const failures = inspectArchitectureSource(
    "apps/api/src/domains/telegram/consumer-finance/ledger/new-use-case.ts",
    `import { FinanceBotService } from "../../telegram-bots/finance/finance-bot.service";`,
  );
  assert.match(
    failures.join("\n"),
    /cannot depend on its Telegram runtime adapter/,
  );
});

test("rejects consumer imports of internal Finance helpers and product UI", () => {
  const file =
    "apps/web/src/components/features/finance/consumer-finance/new-screen.tsx";
  const failures = inspectArchitectureSource(
    file,
    `
      import { formatMoney } from "@/lib/features/finance/money";
      import { CampaignsTable } from "@/components/features/growth/campaigns-table";
    `,
  );
  assert.match(failures.join("\n"), /internal Finance web implementation/);
  assert.match(failures.join("\n"), /another product's feature UI/);
});

test("consumer Finance owns visual components, providers, and query keys", () => {
  const failures = inspectArchitectureSource(
    "apps/web/src/components/features/finance/consumer-finance/new-screen.tsx",
    `
      import { Button } from "@/components/ui/primitives";
      import { IconAvatar } from "@/components/icons/icon-avatar";
      import { useAppToast } from "@/providers/toast-provider";
      import { queryKeys } from "@/lib/query-keys";
    `,
  );
  assert.equal(failures.length, 4);
  assert.match(failures.join("\n"), /owns its visual components/);
  assert.match(failures.join("\n"), /query-key and cache boundary/);
});

test("consumer Finance does not rely on global table presentation classes", () => {
  const failures = inspectArchitectureSource(
    "apps/web/src/components/features/finance/consumer-finance/new-table.tsx",
    `export const table = <div className="table-scroll" />;`,
  );
  assert.match(failures.join("\n"), /Finance-owned table styles/);
});

test("consumer Finance cannot bypass or leak its API and state boundary", () => {
  const consumerFailures = inspectArchitectureSource(
    "apps/web/src/components/features/finance/consumer-finance/new-screen.tsx",
    `import { accountsApi } from "@/lib/api";`,
  );
  const internalFailures = inspectArchitectureSource(
    "apps/web/src/components/features/finance/accounts/new-screen.tsx",
    `
      import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
      import { ConsumerFinanceProvider } from "@/providers/consumer-finance-provider";
    `,
  );
  assert.match(consumerFailures.join("\n"), /consumer-owned API boundary/);
  assert.match(
    internalFailures.join("\n"),
    /cannot be imported by another product/,
  );
});

test("rejects low-level Telegram SDK imports outside the shared adapter", () => {
  const failures = inspectArchitectureSource(
    "apps/api/src/domains/telegram/example/new-parser.ts",
    `import { HTMLParser } from "telegram/extensions/html";`,
  );
  assert.match(failures.join("\n"), /Low-level Telegram SDK imports/);
});

test("rejects Prisma orchestration in controllers", () => {
  const failures = inspectArchitectureSource(
    "apps/api/src/domains/example/example.controller.ts",
    `import { PrismaService } from "../../../prisma/prisma.service";`,
  );
  assert.match(failures.join("\n"), /presentation controller/);
});

test("rejects scattered environment access and frontend polling", () => {
  const apiFailures = inspectArchitectureSource(
    "apps/api/src/domains/example/example.service.ts",
    `const token = process.env.EXAMPLE_TOKEN;`,
  );
  const webFailures = inspectArchitectureSource(
    "apps/web/src/components/features/example/example.tsx",
    `const query = useQuery({ refetchInterval: 1000 });`,
  );
  assert.match(apiFailures.join("\n"), /approved configuration boundary/);
  assert.match(webFailures.join("\n"), /frontend polling/);
});

test("rejects duplicate HTTP clients and framework leakage", () => {
  const clientFailures = inspectArchitectureSource(
    "apps/web/src/components/features/example/example.tsx",
    `const client = axios.create({ baseURL: "/api" });`,
  );
  const sharedFailures = inspectArchitectureSource(
    "packages/shared/src/example.ts",
    `import type { Prisma } from "@prisma/client";`,
  );
  const apiFailures = inspectArchitectureSource(
    "apps/api/src/domains/example/example.service.ts",
    `import { cache } from "react";`,
  );
  assert.match(clientFailures.join("\n"), /duplicate HTTP client/);
  assert.match(sharedFailures.join("\n"), /Shared contracts cannot depend/);
  assert.match(apiFailures.join("\n"), /cannot depend on React or Next/);
});

test("rejects query and API orchestration in new App Router pages", () => {
  const failures = inspectArchitectureSource(
    "apps/web/src/app/(internal)/(example)/page.tsx",
    `
      import { useQuery } from "@tanstack/react-query";
      import { exampleApi } from "@/lib/features/example/example-api";
      export default function Page() { useQuery({ queryKey: ['x'] }); }
    `,
  );
  assert.match(failures.join("\n"), /feature container/);
  assert.match(failures.join("\n"), /imports domain API\/helper/);
});

test("allows product code to depend on platform adapters and shared contracts", () => {
  const failures = inspectArchitectureSource(
    "apps/api/src/domains/telegram/consumer-finance/catalog/new-use-case.ts",
    `
      import { TelegramBotDeliveryService } from "../../telegram-bots/core/telegram-bot-delivery.service";
      import { telegramBotMessagePayload } from "../../../../telegram/shared/telegram-bot-message";
      import type { ConsumerFinanceSession } from "@telegram-system/shared";
    `,
  );
  assert.deepEqual(failures, []);
});

test("stale legacy import and deleted-file exceptions fail closed", () => {
  const [edge] = architecturePolicyInternals.LEGACY_IMPORT_EXCEPTIONS.keys();
  const separator = edge.indexOf("::");
  const source = edge.slice(0, separator);
  const staleEdgeFailures = inspectArchitectureSource(source, "export {};\n");
  assert.match(staleEdgeFailures.join("\n"), /stale legacy import exception/);

  const inventoryFailures = inspectArchitectureExceptionInventory([]);
  assert.match(inventoryFailures.join("\n"), /no longer exists/);
});

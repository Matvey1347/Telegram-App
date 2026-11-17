import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
require("dotenv").config({ path: ".env", override: false, quiet: true });
require("ts-node").register({
  project: fileURLToPath(new URL("../apps/api/tsconfig.json", import.meta.url)),
  transpileOnly: true,
});
const {
  syncAiOperation,
  resolveAiSyncWorkspace,
  sameAiReceipt,
  canReconcileAiReceipt,
} = require("./src/domains/operations/ai/ai-local-sync.ts");
const { PrismaClient, Prisma } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

export async function runAiSync(mode = "--dry-run") {
  if (!["--dry-run", "--execute", "--check"].includes(mode))
    throw new Error("Use --dry-run, --execute or --check");
  const localUrl = process.env.DATABASE_URL;
  const productionUrl = process.env.DATABASE_URL_PRODUCTION;
  if (!localUrl || !productionUrl)
    throw new Error("DATABASE_URL and DATABASE_URL_PRODUCTION required");
  const localHost = new URL(localUrl).hostname;
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(localHost) ||
    new URL(productionUrl).hostname === localHost
  )
    throw new Error("Expected separate local and production databases");
  const local = new PrismaClient({
    adapter: new PrismaPg({ connectionString: localUrl }),
  });
  const production = new PrismaClient({
    adapter: new PrismaPg({ connectionString: productionUrl }),
  });

  const report = {
    mode,
    considered: 0,
    inserted: 0,
    acknowledged: 0,
    alreadyPresent: 0,
    failed: 0,
    cost: "0.000000000000",
    failures: [],
    before: {},
    after: {},
  };
  const totals = async () => {
    const [pending, operations, daily, budgets] = await Promise.all([
      local.aiOperation.aggregate({
        where: { source: "LOCAL_UNSYNCED" },
        _count: true,
        _sum: { actualCost: true },
      }),
      production.aiOperation.aggregate({ _sum: { actualCost: true } }),
      production.aiUsageDaily.aggregate({ _sum: { knownCost: true } }),
      production.aiBudgetPeriod.aggregate({
        where: { scope: "WORKSPACE", period: "DAY" },
        _sum: { spent: true, reserved: true },
      }),
    ]);
    return {
      pending: pending._count,
      pendingCost: pending._sum.actualCost?.toFixed(12) ?? "0.000000000000",
      productionOperationCost:
        operations._sum.actualCost?.toFixed(12) ?? "0.000000000000",
      productionDailyCost:
        daily._sum.knownCost?.toFixed(12) ?? "0.000000000000",
      productionDayBudgetSpent:
        budgets._sum.spent?.toFixed(12) ?? "0.000000000000",
      productionDayBudgetReserved:
        budgets._sum.reserved?.toFixed(12) ?? "0.000000000000",
    };
  };
  try {
    const mapping = process.env.AI_SYNC_WORKSPACE_MAP_FILE
      ? JSON.parse(readFileSync(process.env.AI_SYNC_WORKSPACE_MAP_FILE, "utf8"))
      : {};
    const [localDaily, localSettled] = await Promise.all([
      local.aiUsageDaily.aggregate({
        where: { source: "LOCAL_UNSYNCED" },
        _sum: { requests: true, knownCost: true },
      }),
      local.aiOperation.aggregate({
        where: { source: "LOCAL_UNSYNCED", status: { not: "RUNNING" } },
        _count: true,
        _sum: { actualCost: true },
      }),
    ]);
    if (
      (localDaily._sum.requests ?? 0) !== localSettled._count ||
      !(localDaily._sum.knownCost ?? new Prisma.Decimal(0)).equals(
        localSettled._sum.actualCost ?? 0,
      )
    )
      throw new Error(
        "Local AI rollups differ from retained receipts; snapshot/release blocked until evidence is reconciled",
      );
    report.before = await totals();
    let cursor;
    let cost = new Prisma.Decimal(0);
    const workspaces = new Map();
    while (true) {
      const rows = await local.aiOperation.findMany({
        where: { source: "LOCAL_UNSYNCED" },
        orderBy: { id: "asc" },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!rows.length) break;
      for (const row of rows) {
        report.considered++;
        try {
          if (!workspaces.has(row.workspaceId))
            workspaces.set(
              row.workspaceId,
              await resolveAiSyncWorkspace(
                local,
                production,
                row.workspaceId,
                mapping[row.workspaceId],
              ),
            );
          const workspaceId = workspaces.get(row.workspaceId);
          if (
            !["SUCCEEDED", "FAILED", "RECONCILED", "UNKNOWN"].includes(
              row.status,
            )
          )
            throw new Error(
              "Unresolved operation; settle before synchronization",
            );
          if (mode === "--execute") {
            const inserted = await syncAiOperation(
              local,
              production,
              row,
              workspaceId,
            );
            if (inserted) report.inserted++;
            else report.alreadyPresent++;
            report.acknowledged++;
          } else {
            const existing = await production.aiOperation.findUnique({
              where: {
                workspaceId_operationId: {
                  workspaceId,
                  operationId: row.operationId,
                },
              },
            });
            if (
              existing &&
              !sameAiReceipt(existing, row) &&
              !canReconcileAiReceipt(existing, row)
            )
              throw new Error("Conflicting production receipt");
            if (existing) report.alreadyPresent++;
            if (mode === "--check")
              throw new Error(
                "LOCAL_UNSYNCED receipt remains; run ai:sync --execute",
              );
          }
          cost = cost.plus(row.actualCost ?? 0);
        } catch (error) {
          report.failed++;
          // Never print raw connection/Prisma errors or configuration snapshots.
          report.failures.push({
            id: row.id,
            workspaceId: row.workspaceId,
            status: row.status,
            reason:
              /Unresolved|Conflicting|Workspace identity|LOCAL_UNSYNCED/.test(
                error.message,
              )
                ? error.message
                : "Database or acknowledgement failed; retry safely",
          });
        }
      }
      cursor = rows.at(-1).id;
    }
    report.cost = cost.toFixed(12);
    report.after = await totals();
    console.log(JSON.stringify(report, null, 2));
    if (report.failed)
      throw new Error(
        "AI synchronization incomplete; release/snapshot blocked",
      );
    return report;
  } finally {
    await Promise.all([local.$disconnect(), production.$disconnect()]);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  runAiSync(process.argv[2]).catch(() => {
    console.error(
      "AI sync failed; local receipts retained. Check connectivity and the redacted report.",
    );
    process.exitCode = 1;
  });

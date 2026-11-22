import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
require("dotenv").config({ path: ".env", quiet: true });
const { Client } = require("pg");

const [manifestPath, ...flags] = process.argv.slice(2);
if (!manifestPath || flags.some((flag) => !["--execute", "--production"].includes(flag))) {
  throw new Error("Usage: node scripts/db/apply-ai-posting-draft-taxonomy.mjs MANIFEST [--execute] [--production]");
}
const production = flags.includes("--production");
const execute = flags.includes("--execute");
const connectionString = process.env[production ? "DATABASE_URL_PRODUCTION" : "DATABASE_URL"];
const local = connectionString && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(connectionString).hostname);
if (!connectionString || local === production) throw new Error("Unexpected database target");

const { assignments, channelId, workspaceId, target } = JSON.parse(readFileSync(manifestPath, "utf8"));
const hash = /^[a-f0-9]{64}$/;
const validId = (value) => typeof value === "string" && value.length > 0 && value.length <= 200;
if (
  target !== (production ? "production" : "local") ||
  !validId(channelId) || !validId(workspaceId) ||
  !Array.isArray(assignments) || assignments.length === 0 || assignments.length > 1000 ||
  new Set(assignments.map((row) => row.id)).size !== assignments.length ||
  assignments.some((row) => !validId(row.id) || !validId(row.sphereId) || !validId(row.rubricId) ||
    !hash.test(row.titleHash) || !hash.test(row.textHash) || Number.isNaN(Date.parse(row.updatedAt)) ||
    (row.lengthId !== null && !validId(row.lengthId)))
) throw new Error("Invalid taxonomy manifest");

const client = new Client({ connectionString });
try {
  await client.connect();
  await client.query(execute ? "BEGIN ISOLATION LEVEL SERIALIZABLE" : "BEGIN READ ONLY");
  const source = `
    WITH wanted AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(
        id text, "sphereId" text, "rubricId" text, "lengthId" text, "updatedAt" timestamp,
        "titleHash" text, "textHash" text
      )
    ), candidates AS (
      SELECT p.id, s.id AS sphere, r.id AS rubric, rl."lengthId" AS length,
        (p."aiPostingSphereId", p."aiPostingRubricId", p."aiPostingLengthId")
          IS DISTINCT FROM (s.id, r.id, rl."lengthId") AS changed
      FROM wanted w
      JOIN "TelegramManagedPost" p ON p.id = w.id
      JOIN "TelegramAiPostingSphere" s ON s.id = w."sphereId"
        AND s."workspaceId" = p."workspaceId" AND s."telegramChannelId" = p."telegramChannelId"
      JOIN "TelegramAiPostingRubric" r ON r.id = w."rubricId"
        AND r."workspaceId" = p."workspaceId" AND r."telegramChannelId" = p."telegramChannelId"
        AND (r."sphereId" IS NULL OR r."sphereId" = s.id)
      LEFT JOIN "TelegramAiPostingRubricLength" rl ON rl."rubricId" = r.id AND rl."lengthId" = w."lengthId"
      WHERE p."workspaceId" = $2 AND p."telegramChannelId" = $3
        AND p.status = 'DRAFT' AND p.origin = 'SYSTEM'
        AND p."updatedAt" = w."updatedAt"
        AND encode(sha256(convert_to(p.title, 'UTF8')), 'hex') = w."titleHash"
        AND encode(sha256(convert_to(coalesce(p.text, ''), 'UTF8')), 'hex') = w."textHash"
        AND NOT EXISTS (
          SELECT 1 FROM "PostGroup" g WHERE g.id = p."groupId"
            AND (g."isSystem" OR g."systemKey" IS NOT NULL)
        )
        AND NOT EXISTS (SELECT 1 FROM "TelegramAdSalePlacement" a WHERE a."managedPostId" = p.id)
        AND NOT EXISTS (SELECT 1 FROM "MutualPromotionPostDelivery" v WHERE v."managedPostId" = p.id)
        AND NOT EXISTS (SELECT 1 FROM "TelegramPostBatchDelivery" b WHERE b."managedPostId" = p.id)
      ${execute ? "FOR UPDATE OF p" : ""}
    )
  `;
  const args = [JSON.stringify(assignments), workspaceId, channelId];
  const { rows: [result] } = await client.query(`${source}
    SELECT count(*)::int AS matched, count(*) FILTER (WHERE changed)::int AS changed,
      count(*) FILTER (WHERE length IS NULL)::int AS "withoutLength"
    FROM candidates
  `, args);
  console.log(JSON.stringify({ target, mode: execute ? "execute" : "dry-run", expected: assignments.length, ...result }));
  if (result.matched !== assignments.length) throw new Error("Review stale or ineligible rows before replay");
  if (execute && result.changed) {
    const updated = await client.query(`${source}
      UPDATE "TelegramManagedPost" p
      SET "aiPostingSphereId" = c.sphere, "aiPostingRubricId" = c.rubric, "aiPostingLengthId" = c.length
      FROM candidates c WHERE p.id = c.id AND c.changed
    `, args);
    if (updated.rowCount !== result.changed) throw new Error("Drafts changed during replay");
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("Taxonomy replay aborted and rolled back.", error.code ?? error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

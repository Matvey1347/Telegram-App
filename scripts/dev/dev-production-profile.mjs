import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { openSync, closeSync, readFileSync, fstatSync, constants } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { matchesOperatorIdentity, productionApiOrigin, validId } from "./dev-production-policy.mjs";

const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { parse } = require("dotenv");

function windowsProfileIsPrivate(profilePath) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$file = Get-Item -LiteralPath $env:NEXELOQ_OPERATOR_PROFILE_FILE -Force",
    "if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { exit 1 }",
    "$acl = Get-Acl -LiteralPath $file.FullName",
    "$sidType = [Security.Principal.SecurityIdentifier]",
    "$owner = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
    "if ($acl.GetOwner($sidType).Value -ne $owner) { exit 1 }",
    "foreach ($rule in $acl.GetAccessRules($true, $true, $sidType)) {",
    "  if ($rule.AccessControlType -eq 'Allow' -and",
    "      $rule.IdentityReference.Value -notin @($owner, 'S-1-5-18')) { exit 1 }",
    "}",
  ].join("\n");
  const check = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    env: { ...process.env, NEXELOQ_OPERATOR_PROFILE_FILE: profilePath },
    stdio: "ignore", windowsHide: true, timeout: 5_000,
  });
  return check.status === 0;
}

export function readOperatorProfile(root, path) {
  const profilePath = resolve(root, path);
  const privateDirectory = resolve(root, ".codex/tmp");
  if (process.platform !== "win32" && resolve(profilePath, "..") !== privateDirectory) {
    throw new Error("Keep the operator profile directly in .codex/tmp");
  }
  if (process.platform === "win32" && resolve(profilePath, "..").toLowerCase() !== privateDirectory.toLowerCase()) {
    throw new Error("Keep the operator profile directly in .codex/tmp");
  }
  let file;
  try {
    file = openSync(profilePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("Production operator requires the private profile described in docs/setup/LOCAL_PRODUCTION_WORKFLOWS.md.");
    throw error;
  }
  try {
    const stat = fstatSync(file);
    const isPrivate = process.platform === "win32"
      ? windowsProfileIsPrivate(profilePath)
      : !(stat.mode & 0o077) && stat.uid === process.getuid();
    if (!stat.isFile() || !isPrivate) {
      throw new Error("Restrict the profile to your account before launching (chmod 600 on Unix or icacls on Windows)");
    }
    return parse(readFileSync(file));
  } finally {
    closeSync(file);
  }
}

export function productionDatabaseFingerprint(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Invalid production database target");
  }
  const validParams = [...url.searchParams].every(([key, value]) =>
    (key === "sslmode" && value === "verify-full") || (key === "schema" && value === "public"),
  );
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.username || !url.password ||
    !/^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)+\.neon\.tech$/iu.test(url.hostname) ||
    !/^\/[A-Za-z0-9_-]+$/u.test(url.pathname) || url.hash || !validParams ||
    url.searchParams.getAll("sslmode").length !== 1 || url.port && url.port !== "5432") {
    throw new Error("Production operator requires a Neon PostgreSQL endpoint with sslmode=verify-full");
  }
  return {
    fingerprint: createHash("sha256").update(`${url.hostname}:5432${url.pathname}`).digest("hex"),
    database: url.pathname.slice(1),
  };
}

export function operatorConfiguration(profile, options = {}) {
  const scope = {
    workspaceId: options.workspaceId ?? profile.OPERATOR_WORKSPACE_ID,
    channelId: options.channelId ?? profile.OPERATOR_CHANNEL_ID,
    userId: profile.OPERATOR_USER_ID,
  };
  if (!Object.values(scope).every(validId)) throw new Error("Set the exact workspace, channel and production user IDs");
  if (profile.OPERATOR_SALE_ID || profile.OPERATOR_PLACEMENT_ID) {
    if (!validId(profile.OPERATOR_SALE_ID) || !validId(profile.OPERATOR_PLACEMENT_ID))
      throw new Error("Set the exact sale and placement IDs together");
    scope.saleId = profile.OPERATOR_SALE_ID;
    scope.placementId = profile.OPERATOR_PLACEMENT_ID;
  }
  const databaseUrl = profile.DATABASE_URL_PRODUCTION;
  const target = productionDatabaseFingerprint(databaseUrl);
  if (target.fingerprint !== profile.PRODUCTION_DATABASE_FINGERPRINT) {
    throw new Error("Production database fingerprint did not match");
  }
  return { scope, databaseUrl, database: target.database };
}

export async function preflightOperator({ scope, databaseUrl, database }) {
  const { Client } = require("pg");
  const db = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000, query_timeout: 10_000 });
  try {
    await db.connect();
    await db.query("BEGIN READ ONLY");
    const result = await db.query(
      `SELECT current_database() AS database,
        EXISTS (SELECT 1 FROM "TelegramChannel" WHERE id=$1 AND "workspaceId"=$2 AND "isActive") AS channel,
        EXISTS (SELECT 1 FROM "WorkspaceMember" WHERE "workspaceId"=$2 AND "userId"=$3 AND role='owner') AS owner,
        current_schema() = 'public'
        AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user
          AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolbypassrls)
        AND NOT has_schema_privilege(current_schema(), 'CREATE')
        AND NOT has_database_privilege(current_database(), 'CREATE')
        AND NOT EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=current_schema() AND pg_has_role(c.relowner, 'MEMBER')
        ) AS restricted`,
      [scope.channelId, scope.workspaceId, scope.userId],
    );
    const row = result.rows[0];
    if (row.database !== database || !row.channel || !row.owner || !row.restricted) {
      throw new Error("Operator target, membership or restricted database role check failed");
    }
    if (scope.saleId) {
      const { rowCount } = await db.query(
        `SELECT 1 FROM "TelegramAdSalePlacement"
          WHERE id=$1 AND "telegramAdSaleId"=$2 AND "workspaceId"=$3 AND "telegramChannelId"=$4
            AND "managedPostId" IS NOT NULL`,
        [scope.placementId, scope.saleId, scope.workspaceId, scope.channelId],
      );
      if (rowCount !== 1) throw new Error("The selected placement is outside the scoped channel");
    }
    await db.query(`SELECT p."origin", p."deliveryClaimOwner", s."relayStartedAt", s."relayPostRevision",
      g."isSystem", g."systemKey", n."postId", c."syncIncludePublicInfo",
      c."acquisitionType", i."joinedObservedAt", w."lastAttemptToken"
      FROM "TelegramManagedPost" p, "TelegramManagedPostSendOperation" s, "PostGroup" g,
      "TelegramManagedPostNativeRecovery" n, "TelegramChannel" c, "TelegramInviteLink" i,
      "AdCampaignInviteLinkWindow" w LIMIT 0`);
    const { rows: [grants] } = await db.query(`SELECT
      has_table_privilege('public."TelegramManagedPost"', 'UPDATE') AND
      has_table_privilege('public."TelegramManagedPostSendOperation"', 'INSERT') AND
      has_table_privilege('public."TelegramManagedPostSendOperation"', 'UPDATE') AND
      has_table_privilege('public."TelegramManagedPostRevision"', 'INSERT') AS publication,
      has_table_privilege('public."TelegramAdSalePlacement"', 'UPDATE') AS placement`);
    if (!grants.publication || scope.saleId && !grants.placement) throw new Error("Operator publication role is missing scoped write grants");
    await db.query("ROLLBACK");
  } catch {
    throw new Error("Read-only operator preflight failed. Verify database identity, schema, scope and restricted role grants.");
  } finally {
    await db.end().catch(() => undefined);
  }
}

export function operatorIdentity(scope) {
  return async (authorization) => {
    const result = await fetch(`${productionApiOrigin}/api/auth/me`, {
      headers: { authorization, "x-workspace-id": scope.workspaceId, "x-bypass-response-cache": "1", accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!result.ok) {
      await result.body?.cancel();
      return false;
    }
    const payload = await result.json();
    return matchesOperatorIdentity(payload, scope);
  };
}

export async function preflightOperatorTransport(origin = productionApiOrigin) {
  try {
    const response = await fetch(`${origin}/api/telegram-operator-contract`, {
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8_000),
    });
    if (response.ok && (await response.json()).publicationTransport === 1) return;
    if (!response.ok) await response.body?.cancel();
  } catch { /* Disclose only the missing contract, never network credentials. */ }
  throw new Error("Production operator requires Railway publication transport v1. Deploy the bootstrap release first.");
}

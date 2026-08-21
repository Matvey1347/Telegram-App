import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Client } from 'pg';
import { config as loadEnv } from 'dotenv';

const baselineMigration = '000000000000_squashed_migrations';
const reconciliationLockKey = 'telegram-system:prisma-baseline-reconciliation';
const recoverableSquashedMigration =
  '20260813120000_managed_post_inline_buttons';
// Historical tenant-specific data changes have no target on a fresh database.
// Record them without execution after the structural baseline is installed.
const freshDatabaseSkippedMigrations = [
  '20260814000001_enable_finance_for_business_workspace',
];
const legacyMigrations = [
  '20260530223827_init',
  '20260530233013_add_investors',
  '20260531000000_add_admin_seed_key',
  '20260531090847_add_telegram_bots',
  '20260531093626_add_telegram_channel_photos',
  '20260531101539_add_promo_image_data',
  '20260531105845_sync_multi_user_workspace',
  '20260531130000_multi_user_workspace',
  '20260531143000_add_telegram_user_accounts',
  '20260531145906_mtproto_admin_links_and_avatar',
  '20260531150000_investments_from_workspace_members',
  '20260531170000_telegram_sync_analytics',
  '20260531194500_add_encrypted_phone_for_tg_accounts',
  '20260531200000_add_telegram_posts',
  '20260531203000_add_tg_user_account_name_color',
  '20260531213000_advertising_channels_refactor',
  '20260531224500_transaction_categories_refactor',
  '20260531232000_advertising_source_image',
  '20260531235500_add_advertising_source_subscribers',
  '20260601000500_add_advertising_source_tags',
  '20260601162000_add_telegram_post_metric_snapshots',
  '20260601174000_add_comments_metrics',
  '20260602120000_add_telegram_channel_stats_snapshots',
  '20260602120000_mtproto_only_analytics',
  '20260602213000_add_telegram_channel_stats_points',
  '20260602214500_backfill_telegram_channel_stats_points',
  '20260603090000_unify_telegram_ad_channels',
  '20260607120000_telegram_source_access_attribution',
  '20260607143000_currency_codes_display_mode',
  '20260607210000_telegram_user_account_login_state',
  '20260621120000_telegram_channel_audience_analytics',
  '20260621123000_telegram_channel_networks',
  '20260621130000_ad_hypotheses',
  '20260622090000_ad_campaign_daily_analytics',
  '20260622153000_data_quality_guards',
  '20260622165000_channel_seed_global_corrections',
  '20260622171000_remove_channel_kpi_currency',
  '20260622183000_channel_kpi_ranges',
  '20260622190000_workspace_member_avatar',
  '20260628120000_add_entity_assignment',
  '20260628223000_add_telegram_channel_ad_analysis',
  '20260630143000_add_ad_analysis_assignee',
  '20260702120000_add_telegram_managed_posts',
  '20260704120000_add_managed_post_publish_mode',
  '20260704143000_add_managed_post_assignment',
  '20260704153000_require_managed_post_assignment',
  '20260704160000_add_post_groups',
  '20260704180000_add_post_sidebar_order',
  '20260705120000_add_managed_post_message_urls',
  '20260705150000_add_managed_post_remote_status',
  '20260705170000_add_prompt_notes',
  '20260705190000_add_telegram_post_content_preview',
  '20260708110000_extend_prompt_notes_context',
  '20260708120000_prompt_notes_channels_and_icon',
  '20260711130000_add_telegram_channel_time_posts',
  '20260712174500_add_promo_icon',
  '20260714113000_add_managed_post_revisions',
  '20260716120000_add_telegram_channel_access_mode',
  '20260718123000_media_buyer_invite_attribution',
  '20260718150000_add_telegram_channel_sync_scope',
  '20260719113000_application_logs',
  '20260719150000_ad_campaign_multi_promos',
  '20260719193000_workspace_member_hidden_flag',
  '20260721120000_add_telegram_invite_link_snapshots',
  '20260724100000_add_ad_hypothesis_icon_id',
  '20260724113000_add_ad_campaign_custom_title_template',
  '20260724143000_add_ad_hypothesis_telegram_channel_id',
  '20260724170000_add_telegram_channel_import_cutoffs',
  '20260726120000_add_managed_post_origin_calendar',
  '20260726150000_add_system_post_groups',
  '20260726190000_telegram_account_premium_capabilities',
  '20260729100000_add_transaction_revenue_channel',
  '20260731110000_add_telegram_ad_sales',
  '20260802120000_add_workspace_timezone',
  '20260802143000_add_organic_posts_per_ad_slot',
  '20260802170000_ad_sales_preferences_global_inventory',
  '20260802193000_ad_sales_channel_pricing_history',
  '20260802210000_dedupe_telegram_ad_products',
  '20260802232000_cleanup_legacy_permanent_ad_formats',
  '20260803120000_ad_campaign_admission_analytics',
  '20260807120000_add_managed_post_status_position',
  '20260807133000_add_post_group_status_numbering',
  '20260807150000_add_telegram_post_calendar_planner',
  '20260808120000_workspace_tertiary_currency',
  '20260808143000_scheduled_tasks_foundation',
  '20260808154500_telegram_bot_runtime_foundation',
  '20260808160000_telegram_system_bot',
  '20260808170000_bot_billing',
  '20260808170000_greeter_core',
  '20260808180000_greeter_automations',
  '20260809010000_finance_core_and_ai_config',
  '20260809140000_finish_platform_foundation',
  '20260809180000_finish_greeter_product',
  '20260809190000_finance_product_runtime',
  '20260809200000_repair_currency_code_columns',
  '20260809210000_system_bot_link_message',
  '20260809220000_system_bot_finance_workflows',
  '20260809230000_greeter_full_test_mode_config_versions',
  '20260809233000_managed_post_verified_identity',
  '20260809234000_preserve_managed_post_manual_link_provenance',
  '20260809235000_propagate_revision_manual_link_provenance',
  '20260813120000_managed_post_inline_buttons',
  '20260813133000_ad_sales_text_and_retention',
  '20260813150000_telegram_channel_auto_sync',
  '20260813170000_due_driven_scheduled_tasks',
  '20260813190000_telegram_custom_emoji',
  '20260813200000_user_editor_shortcuts',
  '20260813210000_telegram_post_metrics_two_hours',
];
const legacyMigrationAliases = new Set([
  // This migration was applied in production under its original timestamp,
  // then renamed to 20260531143000 with the same checksum and resolved again.
  '20260531183000_add_telegram_user_accounts',
]);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(scriptDir, '..');

loadEnv({
  path: resolve(apiDir, '../../.env'),
  // Explicit CI/operator values must always win over a local dotenv file.
  override: false,
});

function runPrisma(args) {
  execFileSync('pnpm', ['exec', 'prisma', ...args], {
    cwd: apiDir,
    env: process.env,
    stdio: 'inherit',
  });
}

function verifySupportedSchema() {
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'prisma',
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'prisma/schema.prisma',
      '--exit-code',
    ],
    { cwd: apiDir, env: process.env, encoding: 'utf8' },
  );

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  if (result.status === 0) return;

  if (output) console.error(output);
  throw new Error('Live schema does not match prisma/schema.prisma.');
}

async function verifyPartialRemoteImportIndex(client) {
  const result = await client.query(`
    SELECT i.indisunique,
           pg_get_indexdef(i.indexrelid) AS definition,
           pg_get_expr(i.indpred, i.indrelid) AS predicate
    FROM pg_index i
    JOIN pg_class table_class ON table_class.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = table_class.relnamespace
    WHERE n.nspname = current_schema()
      AND table_class.relname = 'TelegramManagedPost'
      AND pg_get_indexdef(i.indexrelid) LIKE
        '%("workspaceId", "telegramChannelId", "remoteImportKey")%'
  `);

  const matching = result.rows.filter(
    (row) =>
      row.indisunique &&
      row.predicate?.replaceAll(/[()\s]/g, '') === '"remoteImportKey"ISNOTNULL',
  );
  if (matching.length !== 1) {
    throw new Error(
      'Live schema is missing the expected partial unique remote-import index.',
    );
  }
}

async function recoverSquashedInlineButtonsMigration(client) {
  await client.query(`
    ALTER TABLE "TelegramManagedPost"
    ADD COLUMN IF NOT EXISTS "buttonRows" JSONB,
    ADD COLUMN IF NOT EXISTS "scheduleMode" TEXT;
  `);
  await client.query(`
    ALTER TABLE "TelegramManagedPostRevision"
    ADD COLUMN IF NOT EXISTS "buttonRows" JSONB,
    ADD COLUMN IF NOT EXISTS "scheduleMode" TEXT;
  `);
}

async function markMigrationApplied(client, migrationName) {
  const result = await client.query(
    `
      UPDATE "_prisma_migrations"
      SET finished_at = NOW(), logs = NULL
      WHERE migration_name = $1
        AND finished_at IS NULL
        AND rolled_back_at IS NULL
    `,
    [migrationName],
  );
  if (result.rowCount !== 1) {
    throw new Error(
      `Could not mark recovered migration ${migrationName} as applied.`,
    );
  }
}

async function tableExists(client, tableName) {
  const result = await client.query(
    `SELECT to_regclass(format('%I.%I', current_schema(), $1::text)) IS NOT NULL AS "exists"`,
    [tableName],
  );
  return result.rows[0].exists;
}

async function readMigrationRows(client) {
  if (!(await tableExists(client, '_prisma_migrations'))) return null;
  const result = await client.query(`
    SELECT migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    ORDER BY started_at ASC
  `);
  return result.rows;
}

function expectedBaselineChecksum() {
  return createHash('sha256')
    .update(
      readFileSync(
        resolve(
          apiDir,
          'prisma/migrations',
          baselineMigration,
          'migration.sql',
        ),
      ),
    )
    .digest('hex');
}

async function verifyBaselineRecord(client) {
  const recorded = await client.query(
    `
      SELECT checksum, finished_at, rolled_back_at
      FROM "_prisma_migrations"
      WHERE migration_name = $1
      ORDER BY started_at DESC
      LIMIT 1
    `,
    [baselineMigration],
  );
  const row = recorded.rows[0];
  if (
    !row?.finished_at ||
    row.rolled_back_at ||
    row.checksum !== expectedBaselineChecksum()
  ) {
    throw new Error('Baseline migration record verification failed.');
  }
}

async function bootstrapFreshDatabase(client) {
  console.log('Applying the squashed schema baseline to the fresh database...');
  runPrisma([
    'db',
    'execute',
    '--file',
    resolve(apiDir, 'prisma/migrations', baselineMigration, 'migration.sql'),
  ]);
  runPrisma(['migrate', 'resolve', '--applied', baselineMigration]);
  for (const migration of freshDatabaseSkippedMigrations) {
    console.log(
      `Recording tenant-specific migration ${migration} as not applicable to the fresh database...`,
    );
    runPrisma(['migrate', 'resolve', '--applied', migration]);
  }
  await verifyBaselineRecord(client);
  await verifyPartialRemoteImportIndex(client);
}

async function reconcileBaseline(options = {}) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const databaseSchema = new URL(databaseUrl).searchParams.get('schema');
    if (databaseSchema) {
      await client.query(`SELECT set_config('search_path', $1, false)`, [
        databaseSchema,
      ]);
    }
    await client.query(`SELECT pg_advisory_lock(hashtext($1::text))`, [
      reconciliationLockKey,
    ]);
    if (options.verifySchemaOnly) {
      verifySupportedSchema();
      await verifyPartialRemoteImportIndex(client);
      console.log('Deployed Prisma schema verification passed.');
      return;
    }
    const rows = await readMigrationRows(client);
    if (rows === null) {
      await bootstrapFreshDatabase(client);
      return;
    }

    const successful = new Set(
      rows
        .filter((row) => row.finished_at && !row.rolled_back_at)
        .map((row) => row.migration_name),
    );

    if (successful.has(baselineMigration)) {
      await verifyBaselineRecord(client);
      await verifyPartialRemoteImportIndex(client);
      console.log(
        'Squashed Prisma baseline is already recorded; pending migrations may be deployed.',
      );
      return;
    }

    const unresolved = rows.filter(
      (row) => !row.finished_at && !row.rolled_back_at,
    );
    if (unresolved.length) {
      const unresolvedNames = unresolved.map((row) => row.migration_name);
      if (
        unresolvedNames.length !== 1 ||
        unresolvedNames[0] !== recoverableSquashedMigration
      ) {
        throw new Error(
          `Refusing baseline reconciliation: unresolved migrations: ${unresolvedNames.join(', ')}`,
        );
      }
      if (process.env.PRISMA_BASELINE_RECONCILE !== '1') {
        throw new Error(
          'The known failed inline-buttons migration can only be recovered during an approved baseline rollout. ' +
            'Run once with PRISMA_BASELINE_RECONCILE=1.',
        );
      }

      console.log(
        `Recovering ${recoverableSquashedMigration} before baseline reconciliation...`,
      );
      await recoverSquashedInlineButtonsMigration(client);
      verifySupportedSchema();
      await verifyPartialRemoteImportIndex(client);
      await markMigrationApplied(client, recoverableSquashedMigration);
      successful.add(recoverableSquashedMigration);
    }

    const missing = legacyMigrations.filter((name) => !successful.has(name));
    const unknown = [...successful].filter(
      (name) =>
        !legacyMigrations.includes(name) && !legacyMigrationAliases.has(name),
    );
    if (missing.length || unknown.length) {
      throw new Error(
        `Refusing baseline reconciliation: legacy history is not the expected complete set. ` +
          `Missing: ${missing.join(', ') || 'none'}. ` +
          `Unknown: ${unknown.join(', ') || 'none'}.`,
      );
    }

    if (process.env.PRISMA_BASELINE_RECONCILE !== '1') {
      throw new Error(
        'Legacy migration history detected. Verify the rollout, then run once with ' +
          'PRISMA_BASELINE_RECONCILE=1. No database changes were made.',
      );
    }

    console.log('Verifying the live schema matches prisma/schema.prisma...');
    verifySupportedSchema();
    await verifyPartialRemoteImportIndex(client);

    console.log(`Recording ${baselineMigration} as already applied...`);
    runPrisma(['migrate', 'resolve', '--applied', baselineMigration]);

    await verifyBaselineRecord(client);
  } finally {
    try {
      await client.query(`SELECT pg_advisory_unlock(hashtext($1::text))`, [
        reconciliationLockKey,
      ]);
    } catch {}
    await client.end();
  }
}

reconcileBaseline({
  verifySchemaOnly: process.argv.includes('--verify-schema'),
}).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

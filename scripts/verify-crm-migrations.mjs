#!/usr/bin/env node
/** Development-only migration verifier: owns its local PostgreSQL cluster, never accepts a database URL. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationRoot = join(root, 'apps/api/prisma/migrations');
const outputRoot = join(root, 'docs/qa/ai-sales-crm-final/migrations');
export const FORWARD_BASELINE = '20261028100000_bot_profile_asset_hash';
export function mode(args) {
  if (args.length !== 1 || !['--disposable-local', '--audit-only'].includes(args[0])) {
    throw new Error('Use --disposable-local or --audit-only only. External database URLs/configuration are not accepted.');
  }
  return args[0];
}
export function localDatabaseUrl(socket, database) {
  if (!socket.startsWith('/tmp/crm-migration-') || !/^crm_[a-z_]+$/.test(database)) throw new Error('Invalid owned local database target');
  return `postgresql://crm_migration_test@localhost:55491/${database}?host=${encodeURIComponent(socket)}`;
}
export function migrationInventory() {
  const names = readdirSync(migrationRoot).filter(name => /^\d+_/.test(name)).sort();
  const stageNames = names.filter(name => name > FORWARD_BASELINE);
  const instagramEnum = stageNames.indexOf('20261101120000_crm_instagram_contact_type');
  const instagramFields = stageNames.indexOf('20261101120100_crm_instagram_manual_contacts');
  if (instagramEnum < 0 || instagramFields <= instagramEnum) throw new Error('Instagram enum must commit before typed data migration');
  return { names, stageNames, baseline: FORWARD_BASELINE, enumCommitSeparated: true };
}
function command(bin, args, env, logName, cwd = root) {
  const result = spawnSync(bin, args, { cwd, env, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  const content = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error.message}\n` : ''}`;
  writeFileSync(join(outputRoot, logName), content);
  return { exitCode: result.status ?? 1, log: logName, error: result.error?.message };
}
function configFile(path, migrations) {
  const configuration = {schema:join(root,'apps/api/prisma/schema.prisma'),migrations:{path:migrations}};
  // Only the generated local URL enters this isolated config; no dotenv/repository config is loaded.
  writeFileSync(path, `export default { ...${JSON.stringify(configuration)}, datasource: { url: process.env.DATABASE_URL } };\n`);
}
export function run(args = process.argv.slice(2)) {
  const selected = mode(args);
  mkdirSync(outputRoot, {recursive:true});
  const inventory = migrationInventory();
  writeFileSync(join(outputRoot,'inventory.json'),JSON.stringify(inventory,null,2)+'\n');
  if (selected === '--audit-only') { process.stdout.write(`${inventory.names.length} ordered migrations; ${inventory.stageNames.length} stage migrations. No database was accessed.\n`);return; }
  const pgBin = '/opt/homebrew/opt/postgresql@17/bin';
  const directory = mkdtempSync('/tmp/crm-migration-');
  const socket = join(directory,'socket'); const data = join(directory,'data');
  mkdirSync(socket,{mode:0o700});
  const report = {startedAt:new Date().toISOString(), postgresBin:pgBin, network:'Unix socket only; listen_addresses empty', target:'new disposable local cluster', productionDatabaseAccessed:false, clusterStarted:false, clusterStopped:false, stages:{}};
  let started = false;
  try {
    const init = command(join(pgBin,'initdb'),['-D',data,'-U','crm_migration_test','-A','trust','--no-locale','-E','UTF8'],process.env,'initdb.log');
    if (init.exitCode) throw new Error('initdb failed');
    const start = command(join(pgBin,'pg_ctl'),['-D',data,'-l',join(directory,'postgres.log'),'-o',`-k ${socket} -p 55491 -c listen_addresses=''`,'-w','start'],process.env,'start.log');
    if(start.exitCode) throw new Error('local cluster start failed');
    started = true; report.clusterStarted = true;
    const clientEnv = {...process.env,PGHOST:socket,PGPORT:'55491',PGUSER:'crm_migration_test'};
    for(const database of ['crm_clean','crm_forward']) {
      const created = command(join(pgBin,'createdb'),[database],clientEnv,`${database}-createdb.log`);
      if(created.exitCode) throw new Error(`Unable to create ${database}`);
    }
    const allConfig = join(directory,'all.config.mjs'); configFile(allConfig,migrationRoot);
    const cleanEnv = {...clientEnv,DATABASE_URL:localDatabaseUrl(socket,'crm_clean')};
    const prisma = args => ['--filter','api','exec','prisma',...args];
    report.stages.clean = command('pnpm',prisma(['migrate','deploy','--config',allConfig]),cleanEnv,'clean-deploy.log');
    if(report.stages.clean.exitCode===0) {
      report.stages.cleanDrift = command('pnpm',prisma(['migrate','diff','--from-config-datasource','--to-schema',join(root,'apps/api/prisma/schema.prisma'),'--exit-code','--config',allConfig]),cleanEnv,'clean-drift.log');
      report.stages.constraints = command(join(pgBin,'psql'),['-d','crm_clean','-v','ON_ERROR_STOP=1','-c',`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE tablename IN ('TelegramCrmChatOperation','TelegramCrmDeletedMessage','AiOperation','TelegramLeadObservation') ORDER BY tablename,indexname;`],clientEnv,'constraints.log');
    }
    const baselineMigrations=join(directory,'baseline-migrations');mkdirSync(baselineMigrations);
    cpSync(join(migrationRoot,'migration_lock.toml'),join(baselineMigrations,'migration_lock.toml'));
    for(const name of inventory.names.filter(name=>name<=FORWARD_BASELINE)) cpSync(join(migrationRoot,name),join(baselineMigrations,name),{recursive:true});
    const baselineConfig=join(directory,'baseline.config.mjs');configFile(baselineConfig,baselineMigrations);
    const forwardEnv={...clientEnv,DATABASE_URL:localDatabaseUrl(socket,'crm_forward')};
    const bootstrapMigrations=join(directory,'bootstrap-migrations');mkdirSync(bootstrapMigrations);
    cpSync(join(migrationRoot,'migration_lock.toml'),join(bootstrapMigrations,'migration_lock.toml'));
    cpSync(join(migrationRoot,inventory.names[0]),join(bootstrapMigrations,inventory.names[0]),{recursive:true});
    const bootstrapConfig=join(directory,'bootstrap.config.mjs');configFile(bootstrapConfig,bootstrapMigrations);
    report.stages.forwardBootstrap=command('pnpm',prisma(['migrate','deploy','--config',bootstrapConfig]),forwardEnv,'forward-bootstrap.log');
    if(report.stages.forwardBootstrap.exitCode!==0) throw new Error('Forward bootstrap failed');
    const legacyAccessSql=readFileSync(join(migrationRoot,'20260814000001_enable_finance_for_business_workspace/migration.sql'),'utf8');
    const legacyWorkspaceId=legacyAccessSql.match(/'finance-access-([a-z0-9]+)'/)?.[1];
    if(!legacyWorkspaceId) throw new Error('Cannot identify documented legacy workspace precondition');
    report.stages.forwardSyntheticFixture=command(join(pgBin,'psql'),['-d','crm_forward','-v','ON_ERROR_STOP=1','-c',`INSERT INTO "Workspace" (id,name,"updatedAt") VALUES ('${legacyWorkspaceId}','SYNTHETIC migration compatibility fixture',NOW());`],clientEnv,'forward-synthetic-fixture.log');
    if(report.stages.forwardSyntheticFixture.exitCode!==0) throw new Error('Forward synthetic fixture failed');
    report.representativeExistingData='Synthetic Workspace only, explicitly satisfies historical data-migration precondition; no production snapshot/data used';
    report.stages.forwardBaseline=command('pnpm',prisma(['migrate','deploy','--config',baselineConfig]),forwardEnv,'forward-baseline.log');
    if(report.stages.forwardBaseline.exitCode===0) {
      const priorData=join(outputRoot,'representative-fixture.sql');
      writeFileSync(priorData,`-- Synthetic offline-only existing rows; account sync/send stay disabled.
INSERT INTO "TelegramUserAccountIntegration" (id,"workspaceId",label,"apiId","apiHashEncrypted","apiHashIv","apiHashAuthTag","updatedAt") VALUES ('crm_migration_account','${legacyWorkspaceId}','Synthetic offline migration account','0','not-real','not-real','not-real',NOW());
INSERT INTO "TelegramAdvertiser" (id,"workspaceId","displayName","updatedAt") VALUES ('crm_migration_advertiser','${legacyWorkspaceId}','Synthetic existing migration client',NOW());
INSERT INTO "TelegramAdvertiserContact" (id,"workspaceId","advertiserId",type,value,"normalizedValue",label,"updatedAt") VALUES ('crm_migration_legacy_other','${legacyWorkspaceId}','crm_migration_advertiser','OTHER','@synthetic_profile','synthetic_profile','Instagram',NOW());
`);
      report.stages.representativeFixture=command(join(pgBin,'psql'),['-d','crm_forward','-v','ON_ERROR_STOP=1','-f',priorData],clientEnv,'representative-fixture.log');
      if(report.stages.representativeFixture.exitCode!==0) throw new Error('Representative prior data insertion failed');
      report.representativeExistingData='Synthetic existing Workspace, disabled account, advertiser and legacy OTHER Instagram method; no production snapshot or personal data';
      report.stages.forward=command('pnpm',prisma(['migrate','deploy','--config',allConfig]),forwardEnv,'forward-deploy.log');
      if(report.stages.forward.exitCode===0) report.stages.forwardDrift=command('pnpm',prisma(['migrate','diff','--from-config-datasource','--to-schema',join(root,'apps/api/prisma/schema.prisma'),'--exit-code','--config',allConfig]),forwardEnv,'forward-drift.log');
      if(report.stages.forward.exitCode===0) {
        report.stages.forwardCatalog=command(join(pgBin,'psql'),['-d','crm_forward','-v','ON_ERROR_STOP=1','-c',`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE tablename IN ('TelegramCrmChatOperation','TelegramCrmDeletedMessage','AiOperation','TelegramLeadObservation','TelegramAdvertiserActivity') ORDER BY tablename,indexname;`],clientEnv,'forward-catalog.log');
        const probes=join(outputRoot,'constraint-probes.sql');
        writeFileSync(probes,`-- Synthetic constraint and existing-data checks; all probe writes roll back.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "TelegramAdvertiserContact" WHERE id='crm_migration_legacy_other' AND type='OTHER' AND value='@synthetic_profile' AND "identityState"='ACTIVE' AND "ownershipConfirmedAt" IS NULL) THEN RAISE EXCEPTION 'Legacy OTHER identity changed during additive migrations'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='TelegramCrmChatOperation_unknown_target_key' AND indexdef LIKE '%WHERE%UNKNOWN%') THEN RAISE EXCEPTION 'Pending target partial index missing'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='TelegramAdvertiserActivity_instagram_manual_retention_idx' AND indexdef LIKE '%WHERE%INSTAGRAM%') THEN RAISE EXCEPTION 'Instagram retention partial index missing'; END IF;
END $$;
INSERT INTO "Workspace" (id,name,"updatedAt") VALUES ('crm_migration_other_workspace','Synthetic other workspace',NOW());
DO $$ BEGIN
 BEGIN
  INSERT INTO "TelegramCrmChatOperation" (id,"workspaceId","operationId","actorUserId","conversationId","mtprotoAccountId",kind,"requestFingerprint",request,"updatedAt") VALUES ('cross_scope','crm_migration_other_workspace','cross_scope','synthetic_actor','synthetic_conversation','crm_migration_account','EDIT','synthetic','{}',NOW());
  RAISE EXCEPTION 'Cross-workspace account receipt unexpectedly accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
INSERT INTO "TelegramCrmChatOperation" (id,"workspaceId","operationId","actorUserId","conversationId","mtprotoAccountId","targetMessageId",kind,"requestFingerprint",request,"updatedAt") VALUES ('valid_operation','${legacyWorkspaceId}','valid_operation','synthetic_actor','synthetic_conversation','crm_migration_account','synthetic_target','EDIT','synthetic','{}',NOW());
DO $$ BEGIN
 BEGIN
  INSERT INTO "TelegramCrmChatOperation" SELECT 'duplicate_operation',"workspaceId",'valid_operation',"actorUserId","conversationId","mtprotoAccountId",NULL,kind,"requestFingerprint",status,request,result,"createdAt","updatedAt" FROM "TelegramCrmChatOperation" WHERE id='valid_operation';
  RAISE EXCEPTION 'Duplicate operation unexpectedly accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  INSERT INTO "TelegramCrmChatOperation" SELECT 'duplicate_target',"workspaceId",'different_operation',"actorUserId","conversationId","mtprotoAccountId","targetMessageId",kind,"requestFingerprint",status,request,result,"createdAt","updatedAt" FROM "TelegramCrmChatOperation" WHERE id='valid_operation';
  RAISE EXCEPTION 'Duplicate pending target unexpectedly accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
INSERT INTO "TelegramCrmDeletedMessage" ("mtprotoAccountId","telegramMessageId","workspaceId") VALUES ('crm_migration_account',123,'${legacyWorkspaceId}');
DELETE FROM "TelegramUserAccountIntegration" WHERE id='crm_migration_account';
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "TelegramCrmChatOperation" WHERE id='valid_operation') OR EXISTS (SELECT 1 FROM "TelegramCrmDeletedMessage" WHERE "mtprotoAccountId"='crm_migration_account') THEN RAISE EXCEPTION 'Account lifecycle cascade failed'; END IF;
END $$;
ROLLBACK;
`);
        report.stages.forwardConstraintProbes=command(join(pgBin,'psql'),['-d','crm_forward','-v','ON_ERROR_STOP=1','-f',probes],clientEnv,'constraint-probes.log');
      }

    } else report.stages.forward={status:'NOT EXECUTED',reason:'Historical predecessor chain did not build; representative seeded existing-data check is blocked.'};
    report.existingProductionCompatibility='NOT EXECUTED: synthetic predecessor/fixture validation is not a production snapshot or existing-data compatibility proof';
  } catch(error) {report.error=error.message;} finally {
    if(started) {
      const stop=command(join(pgBin,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],process.env,'stop.log');
      report.clusterStopped=stop.exitCode===0;
      if(!report.clusterStopped) report.stopError='STOP FAILED: owned cluster directory retained for operator cleanup';
    }
    if(!started || report.clusterStopped) rmSync(directory,{recursive:true,force:true});
    report.finishedAt=new Date().toISOString();
    report.status=report.error || Object.values(report.stages).some(stage=>stage.exitCode>0 || stage.status==='NOT EXECUTED') ? 'BLOCKED' : 'PASSED';
    writeFileSync(join(outputRoot,'report.json'),JSON.stringify(report,null,2)+'\n');
  }
  process.stdout.write(`Migration verification ${report.status}; cluster stopped=${report.clusterStopped}. See docs/qa/ai-sales-crm-final/migrations/report.json\n`);
  if(report.status!=='PASSED') process.exitCode=1;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) run();

import test from 'node:test';
import assert from 'node:assert/strict';
import { mode, localDatabaseUrl, migrationInventory, FORWARD_BASELINE } from './verify-crm-migrations.mjs';
test('execution requires one explicit local disposable or static mode',()=>{
 assert.equal(mode(['--disposable-local']),'--disposable-local');assert.equal(mode(['--audit-only']),'--audit-only');
 for(const args of [[],['--url','postgresql://production/db'],['--disposable-local','--url','x'],['--config','x']]) assert.throws(()=>mode(args));
});
test('database URLs can target only owned local socket and fixed test database name',()=>{
 const url=new URL(localDatabaseUrl('/tmp/crm-migration-fixture/socket','crm_clean'));
 assert.equal(url.hostname,'localhost');assert.equal(url.username,'crm_migration_test');assert.equal(url.searchParams.get('host'),'/tmp/crm-migration-fixture/socket');
 assert.throws(()=>localDatabaseUrl('/var/run/postgresql','crm_clean'));assert.throws(()=>localDatabaseUrl('/tmp/crm-migration-fixture/socket','production'));
});
test('inventory preserves ordered split enum commit and exact stage baseline',()=>{
 const inventory=migrationInventory();assert.equal(inventory.baseline,FORWARD_BASELINE);assert.deepEqual(inventory.names,[...inventory.names].sort());
 assert.equal(inventory.stageNames.length,9);assert.equal(inventory.enumCommitSeparated,true);
});

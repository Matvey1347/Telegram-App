import fs from 'node:fs';
import path from 'node:path';

const migrationSql = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../../../prisma/migrations/20260831233000_guard_crm_manage_automation_permission/migration.sql',
  ),
  'utf8',
);

describe('Telegram CRM permission migration safety', () => {
  it('denies automation management for existing non-owner DENYLIST roles', () => {
    expect(migrationSql).toContain("'adSales.crm.manageAutomation'");
    expect(migrationSql).toContain("'DENY'::\"WorkspaceRolePermissionEffect\"");
    expect(migrationSql).toContain('r."mode" = \'DENYLIST\'');
    expect(migrationSql).toContain('r."systemKey" IS DISTINCT FROM \'OWNER\'');
    expect(migrationSql).toContain(
      'DO UPDATE SET "effect" = EXCLUDED."effect"',
    );
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('operations notifications migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260901150000_operations_notifications/migration.sql',
    ),
    'utf8',
  );

  it('is schema-only and grants no notification or automation work', () => {
    expect(sql).not.toMatch(/INSERT INTO "OperationsNotification"/);
    expect(sql).not.toMatch(/TelegramCrmMessage|AutomationExecution/);
    expect(sql).toContain('OperationsNotification_unread_idx');
    expect(sql).toContain('OperationsNotification_expiry_idx');
    expect(sql).toContain('OperationsNotification_pending_source_idx');
    expect(sql).toContain('OperationsNotification_visibility_resource_idx');
    expect(sql).toMatch(
      /OperationsNotification_publication_due_idx[\s\S]*WHERE "publishedAt" IS NULL/,
    );
    expect(sql).not.toMatch(
      /OperationsNotification_expiry_idx[\s\S]{0,120}WHERE/,
    );
  });

  it('denies the permission for existing non-owner DENYLIST roles', () => {
    expect(sql).toContain("'operations.notifications'");
    expect(sql).toContain(`r."mode" = 'DENYLIST'`);
    expect(sql).toContain(`r."systemKey" IS DISTINCT FROM 'OWNER'`);
    expect(sql).toContain(`'DENY'::"WorkspaceRolePermissionEffect"`);
  });
});

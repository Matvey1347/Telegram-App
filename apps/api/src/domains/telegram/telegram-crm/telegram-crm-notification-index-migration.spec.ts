import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('grouped CRM notification index migration', () => {
  it('indexes the exact workspace/type/source reconciliation predicate', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'prisma/migrations/20260906193000_index_grouped_crm_notifications/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain(
      'ON "OperationsNotification"("workspaceId", "type", "sourceKey")',
    );
  });
});

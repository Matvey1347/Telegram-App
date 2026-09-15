import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Telegram post batch deletion lifecycle schema', () => {
  const schema = readFileSync(
    resolve(__dirname, '../../../../prisma/schema.prisma'),
    'utf8',
  );
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../../../prisma/migrations/20260914130000_add_telegram_post_batches/migration.sql',
    ),
    'utf8',
  );
  const foreignKeyRepairMigration = readFileSync(
    resolve(
      __dirname,
      '../../../../prisma/migrations/20260914131500_reconcile_telegram_post_batch_foreign_keys/migration.sql',
    ),
    'utf8',
  );
  const postEditorMigration = readFileSync(
    resolve(
      __dirname,
      '../../../../prisma/migrations/20260915124500_add_post_batch_post_icons_and_bot_import/migration.sql',
    ),
    'utf8',
  );
  const workflowLinkRemovalMigration = readFileSync(
    resolve(
      __dirname,
      '../../../../prisma/migrations/20260915130000_remove_post_batch_workflow_links/migration.sql',
    ),
    'utf8',
  );

  it('cascades delivery rows when their managed post or channel is hard-deleted', () => {
    const deliveryModel = schema.match(
      /model TelegramPostBatchDelivery \{[\s\S]*?\n\}/,
    )?.[0];
    expect(deliveryModel).toMatch(
      /telegramChannel\s+TelegramChannel\s+@relation\([^\n]+onDelete: Cascade/,
    );
    expect(deliveryModel).toMatch(
      /managedPost\s+TelegramManagedPost\s+@relation\([^\n]+onDelete: Cascade/,
    );
    expect(migration).toContain(
      '"TelegramPostBatchDelivery_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE',
    );
    expect(migration).toContain(
      '"TelegramPostBatchDelivery_managedPostId_fkey" FOREIGN KEY ("managedPostId") REFERENCES "TelegramManagedPost"("id") ON DELETE CASCADE',
    );
    expect(schema).toContain(
      '@@index([status, updatedAt, id], map: "TelegramPostBatch_status_updated_idx")',
    );
    expect(migration).toContain(
      'CREATE INDEX "TelegramPostBatch_status_updated_idx" ON "TelegramPostBatch"("status", "updatedAt", "id")',
    );
    expect(schema).toContain(
      '@@index([batchId, status], map: "TelegramPostBatchDelivery_batch_status_idx")',
    );
    expect(migration).toContain(
      'CREATE INDEX "TelegramPostBatchDelivery_batch_status_idx" ON "TelegramPostBatchDelivery"("batchId", "status")',
    );
  });

  it('keeps post batch foreign-key names aligned with the Prisma schema', () => {
    expect(foreignKeyRepairMigration).toContain(
      'TO "TelegramPostBatch_createdByMemberId_workspaceId_fkey"',
    );
    expect(foreignKeyRepairMigration).toContain(
      'TO "TelegramPostBatchMutualPromotionLink_mutualPromotionFolder_fkey"',
    );
  });

  it('installs the batch editor columns and removes workflow attachment tables', () => {
    expect(postEditorMigration).toContain(
      'ADD COLUMN "iconId" TEXT',
    );
    expect(postEditorMigration).toContain(
      'ADD COLUMN "resultPostBatchPostId" TEXT',
    );
    expect(workflowLinkRemovalMigration).toContain(
      'DROP TABLE IF EXISTS "TelegramPostBatchAdSaleLink"',
    );
    expect(workflowLinkRemovalMigration).toContain(
      'DROP TABLE IF EXISTS "TelegramPostBatchMutualPromotionLink"',
    );
    expect(schema).not.toContain('model TelegramPostBatchAdSaleLink');
    expect(schema).not.toContain('model TelegramPostBatchMutualPromotionLink');
  });
});

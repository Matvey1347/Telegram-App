import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadIngestService } from './lead-ingest.service';
import { prefilterLeadPost } from './lead-prefilter';

const url = process.env.LEAD_METADATA_TEST_DATABASE_URL;
(url ? describe : describe.skip)('metadata refresh with PostgreSQL', () => {
  it('reopens existing incomplete evidence without invoking AI or losing the old queue record', async () => {
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    try {
      const workspaceId = 'metadata-refresh-workspace';
      const sourceId = 'metadata-refresh-source';
      const actor = 'metadata-refresh-actor';
      await prisma.workspace.create({
        data: { id: workspaceId, name: 'Synthetic metadata refresh' },
      });
      await prisma.telegramUserAccountIntegration.create({
        data: {
          id: 'metadata-refresh-account',
          workspaceId,
          label: 'test',
          apiId: '0',
          apiHashEncrypted: 'x',
          apiHashIv: 'x',
          apiHashAuthTag: 'x',
        },
      });
      const source = await prisma.telegramLeadSource.create({
        data: {
          id: sourceId,
          workspaceId,
          type: 'TELEGRAM_CHANNEL',
          normalizedKey: 'telegram:username:metadata_test',
          channelId: '123456',
          username: 'metadata_test',
          title: 'Synthetic source',
          accountId: 'metadata-refresh-account',
          accessType: 'SUBSCRIBED_CHANNEL',
          processingReference: 'policy:test',
          monitoringState: 'ACTIVE',
          monitoringActorUserId: actor,
        },
      });
      await prisma.telegramLeadAutoConfig.create({
        data: { sourceId, workspaceId, enabled: true },
      });
      const authorization = {
        refresh: jest.fn(),
        require: jest.fn().mockResolvedValue({ workspaceId }),
      };
      const grants = JSON.stringify([
        {
          workspaceId,
          sourceKey: source.normalizedKey,
          accountId: source.accountId,
          channelId: source.channelId,
          reference: source.processingReference,
          ingest: true,
          ai: true,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      ]);
      const config = {
        get: (key: string) =>
          key === 'INTERNAL_LEAD_DISCOVERY_ENABLED'
            ? 'true'
            : key === 'INTERNAL_LEAD_DISCOVERY_GRANTS'
              ? grants
              : undefined,
      };
      const policy = new TelegramLeadPolicy(
        prisma as unknown as PrismaService,
        authorization as never,
        config as never,
      );
      const ingest = new TelegramLeadIngestService(
        prisma as unknown as PrismaService,
        policy,
      );
      const item = {
        externalMessageId: '100',
        text: 'Synthetic formatted post',
        publishedAt: new Date(Date.now() - 60_000).toISOString(),
      };
      await ingest.ingest(actor, sourceId, [item], {
        postMetadataComplete: { '100': false },
        postMetadataTextOnly: { '100': false },
        postTargetEvidence: { '100': [] },
      });
      const before = await prisma.telegramLeadObservation.findFirstOrThrow({
        where: { workspaceId, sourceId },
      });
      await prisma.telegramLeadObservation.update({
        where: { id: before.id },
        data: { processingStatus: 'MANUAL_REVIEW_METADATA' },
      });
      await prisma.telegramLeadAnalysisQueue.updateMany({
        where: { workspaceId, observationId: before.id },
        data: { status: 'NEEDS_METADATA', prefilterDecision: 'NEEDS_METADATA' },
      });
      await ingest.ingest(actor, sourceId, [item], {
        postMetadataComplete: { '100': false },
        postMetadataTextOnly: { '100': false },
        postTextMetadataComplete: { '100': true },
        postMediaPresent: { '100': true },
        postTargetEvidence: { '100': [] },
      });
      expect(
        await prisma.telegramLeadObservation.findUniqueOrThrow({
          where: { id: before.id },
        }),
      ).toMatchObject({
        contentHash: before.contentHash,
        metadataComplete: false,
        textMetadataComplete: true,
        mediaPresent: true,
        processingStatus: 'PENDING',
      });
      expect(
        await prisma.telegramLeadAnalysisQueue.findFirstOrThrow({
          where: {
            workspaceId,
            observationId: before.id,
            contentHash: before.contentHash,
          },
        }),
      ).toMatchObject({ status: 'WAIT_AUTH_RECHECK' });
      expect(await prisma.aiOperation.count({ where: { workspaceId } })).toBe(
        0,
      );
      await ingest.ingest(
        actor,
        sourceId,
        [{ externalMessageId: '101', text: '', publishedAt: item.publishedAt }],
        {
          postMetadataComplete: { '101': false },
          postMetadataTextOnly: { '101': false },
          postTextMetadataComplete: { '101': true },
          postMediaPresent: { '101': true },
          postTargetEvidence: { '101': [] },
        },
      );
      const mediaOnly = await prisma.telegramLeadObservation.findFirstOrThrow({
        where: { workspaceId, sourceId, externalMessageId: '101' },
      });
      expect(
        prefilterLeadPost({
          text: mediaOnly.text,
          metadataComplete: mediaOnly.metadataComplete,
          textMetadataComplete: mediaOnly.textMetadataComplete,
          mediaPresent: mediaOnly.mediaPresent,
          sourceChannelId: source.channelId,
          advertisedTargets: [],
        }).decision,
      ).toBe('NEEDS_MEDIA_ANALYSIS');
      await prisma.telegramLeadObservation.update({
        where: { id: before.id },
        data: { processingStatus: 'MANUAL_REVIEW_METADATA' },
      });
      await prisma.telegramLeadAnalysisQueue.updateMany({
        where: { workspaceId, observationId: before.id },
        data: { status: 'NEEDS_METADATA', prefilterDecision: 'NEEDS_METADATA' },
      });
      await ingest.ingest(actor, sourceId, [item], {
        postMetadataComplete: { '100': true },
        postMetadataTextOnly: { '100': true },
        postTargetEvidence: { '100': [] },
      });
      const after = await prisma.telegramLeadObservation.findUniqueOrThrow({
        where: { id: before.id },
      });
      expect(after).toMatchObject({
        metadataComplete: true,
        metadataTextOnly: true,
        processingStatus: 'PENDING',
      });
      const queues = await prisma.telegramLeadAnalysisQueue.findMany({
        where: { workspaceId, observationId: before.id },
      });
      expect(
        queues.some(
          (q) =>
            q.status === 'NEEDS_METADATA' &&
            q.contentHash === before.contentHash,
        ),
      ).toBe(true);
      expect(
        queues.some(
          (q) =>
            q.status === 'WAIT_AUTH_RECHECK' &&
            q.contentHash === after.contentHash,
        ),
      ).toBe(true);
      expect(await prisma.aiOperation.count({ where: { workspaceId } })).toBe(
        0,
      );
    } finally {
      await prisma.$disconnect();
    }
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import {
  claimLeadAnalysis,
  expireLeadAnalysisClaims,
  finishLeadAnalysisClaim,
} from './lead-analysis-claim';

const url = process.env.LEAD_CLAIM_TEST_DATABASE_URL;
const isolated = url ? describe : describe.skip;

isolated('lead analysis claims (isolated PostgreSQL)', () => {
  let first: PrismaClient;
  let second: PrismaClient;
  beforeAll(async () => {
    first = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    second = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    await first.$executeRawUnsafe(
      `CREATE TABLE "TelegramLeadObservation" (id TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "processingStatus" TEXT NOT NULL DEFAULT 'PENDING')`,
    );
    await first.$executeRawUnsafe(
      `CREATE TABLE "AiOperation" ("workspaceId" TEXT NOT NULL, "businessObjectId" TEXT, status TEXT NOT NULL)`,
    );
    await first.$executeRawUnsafe(
      `INSERT INTO "TelegramLeadObservation" (id,"workspaceId","sourceId") VALUES ('o2','w2','s2'),('o3','w3','s3'),('o4','w3','s3'),('o','w','s')`,
    );
    await first.$executeRawUnsafe(`CREATE TABLE "TelegramLeadAnalysisQueue" (
      id TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "sourceId" TEXT NOT NULL,
      "observationId" TEXT NOT NULL, "contentHash" TEXT NOT NULL,
      "bindingRevision" INTEGER NOT NULL, "actorUserId" TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'WAIT_AUTH_RECHECK',
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'prisma/migrations/20261101200000_lead_queue_claim/migration.sql',
      ),
      'utf8',
    );
    for (const statement of migration
      .split(';')
      .map((sql) => sql.trim())
      .filter(Boolean))
      await first.$executeRawUnsafe(statement);
  });
  afterAll(async () => {
    await first.$disconnect();
    await second.$disconnect();
  });
  it('does not claim a queued observation with an unknown AI operation', async () => {
    await first.$executeRaw`INSERT INTO "TelegramLeadObservation" (id, "workspaceId", "sourceId") VALUES ('uncertain-o', 'uncertain-w', 'uncertain-s')`;
    await first.$executeRaw`INSERT INTO "TelegramLeadAnalysisQueue" (id, "workspaceId", "sourceId", "observationId", "contentHash", "bindingRevision", "actorUserId") VALUES ('uncertain-q', 'uncertain-w', 'uncertain-s', 'uncertain-o', 'hash', 1, 'actor')`;
    await first.$executeRaw`INSERT INTO "AiOperation" ("workspaceId", "businessObjectId", status) VALUES ('uncertain-w', 'uncertain-o', 'UNKNOWN')`;
    expect(
      await claimLeadAnalysis(
        first as PrismaService,
        'uncertain-w',
        'uncertain-s',
        60_000,
      ),
    ).toBeNull();
    const rows = await first.$queryRaw<
      Array<{ status: string }>
    >`SELECT status FROM "TelegramLeadAnalysisQueue" WHERE id='uncertain-q'`;
    expect(rows[0].status).toBe('WAIT_AUTH_RECHECK');
  });
  it('completes only the claimed workspace and source', async () => {
    await first.$executeRaw`INSERT INTO "TelegramLeadAnalysisQueue" (id, "workspaceId", "sourceId", "observationId", "contentHash", "bindingRevision", "actorUserId") VALUES ('q2', 'w2', 's2', 'o2', 'hash', 1, 'actor')`;
    expect(
      await claimLeadAnalysis(first as PrismaService, 'w2', 'other', 60_000),
    ).toBeNull();
    const claim = await claimLeadAnalysis(
      first as PrismaService,
      'w2',
      's2',
      60_000,
    );
    expect(claim).not.toBeNull();
    expect(
      await finishLeadAnalysisClaim(
        second as PrismaService,
        claim!,
        'COMPLETED',
      ),
    ).toBe(1);
    expect(
      await finishLeadAnalysisClaim(
        first as PrismaService,
        claim!,
        'COMPLETED',
      ),
    ).toBe(0);
    expect(
      await claimLeadAnalysis(first as PrismaService, 'w2', 's2', 60_000),
    ).toBeNull();
  });
  it('serializes different observations of the same source across API instances', async () => {
    await first.$executeRaw`INSERT INTO "TelegramLeadAnalysisQueue" (id, "workspaceId", "sourceId", "observationId", "contentHash", "bindingRevision", "actorUserId") VALUES ('q3', 'w3', 's3', 'o3', 'hash3', 1, 'actor'), ('q4', 'w3', 's3', 'o4', 'hash4', 1, 'actor')`;
    const claims = await Promise.all([
      claimLeadAnalysis(first as PrismaService, 'w3', 's3', 60000),
      claimLeadAnalysis(second as PrismaService, 'w3', 's3', 60000),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(
      await finishLeadAnalysisClaim(
        first as PrismaService,
        claims.find(Boolean)!,
        'COMPLETED',
      ),
    ).toBe(1);
    expect(
      await claimLeadAnalysis(second as PrismaService, 'w3', 's3', 60000),
    ).not.toBeNull();
  });
  it('claims only once across clients and fences an expired owner without retry', async () => {
    await first.$executeRaw`INSERT INTO "TelegramLeadAnalysisQueue" (id, "workspaceId", "sourceId", "observationId", "contentHash", "bindingRevision", "actorUserId") VALUES ('q1', 'w', 's', 'o', 'hash', 1, 'actor')`;
    const [a, b] = await Promise.all([
      claimLeadAnalysis(first as PrismaService, 'w', 's', 60_000),
      claimLeadAnalysis(second as PrismaService, 'w', 's', 60_000),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const claim = (a ?? b)!;
    await first.$executeRaw`UPDATE "TelegramLeadAnalysisQueue" SET "claimUntil"=CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id='q1'`;
    expect(
      await expireLeadAnalysisClaims(second as PrismaService, 'w', 's'),
    ).toBe(1);
    expect(
      await finishLeadAnalysisClaim(first as PrismaService, claim, 'COMPLETED'),
    ).toBe(0);
    expect(
      await claimLeadAnalysis(second as PrismaService, 'w', 's', 60_000),
    ).toBeNull();
    const rows = await first.$queryRaw<
      Array<{ status: string; lastErrorCode: string }>
    >`SELECT status, "lastErrorCode" FROM "TelegramLeadAnalysisQueue" WHERE id='q1'`;
    expect(rows[0]).toEqual({
      status: 'UNKNOWN',
      lastErrorCode: 'LEAD_CLAIM_EXPIRED',
    });
  });
});

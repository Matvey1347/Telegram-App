import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { DashboardInsightsReadService } from './dashboard-insights-read.service';

const connectionString = process.env.DASHBOARD_TEST_DATABASE_URL;
const integration = connectionString ? describe : describe.skip;

integration('Dashboard sales in PostgreSQL', () => {
  let db: PrismaClient;
  beforeAll(() => {
    const target = new URL(connectionString!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))
      throw new Error(
        'Dashboard integration tests require a localhost database',
      );
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  });
  afterAll(async () => db?.$disconnect());

  it('counts booked deals in the ledger period without counting unpaid or deleted receipts', async () => {
    const { id: workspaceId } = await db.workspace.create({
      data: { name: 'Dashboard sales QA' },
    });
    try {
      const { id: accountId } = await db.account.create({
        data: { workspaceId, name: 'Ledger', currency: 'UAH' },
      });
      const from = new Date('2026-11-01T00:00:00.000Z');
      const to = new Date('2026-11-30T23:59:59.999Z');
      const inPeriod = new Date('2026-11-14T12:00:00.000Z');
      const outOfPeriod = new Date('2026-10-29T12:00:00.000Z');
      const [booked, deleted] = await Promise.all(
        ['Booked', 'Deleted receipt', 'Unpaid'].map((advertiserName) =>
          db.telegramAdSale.create({
            data: {
              workspaceId,
              advertiserName,
              settlementCurrency: 'UAH',
              status: 'RESERVED',
              createdAt: outOfPeriod,
            },
          }),
        ),
      );
      const money = {
        workspaceId,
        accountId,
        currency: 'UAH',
        amount: 100,
        amountInPrimaryCurrency: 100,
        exchangeRateToPrimary: 1,
      };
      for (const deal of [booked, deleted]) {
        const receipt = await db.transaction.create({
          data: {
            ...money,
            type: 'income',
            category: 'Ad Sales',
            date: inPeriod,
            deletedAt: deal.id === deleted.id ? inPeriod : null,
          },
        });
        await db.telegramAdSalePayment.create({
          data: {
            ...money,
            transactionId: receipt.id,
            telegramAdSaleId: deal.id,
            paidAt: outOfPeriod,
          },
        });
      }
      const read = new DashboardInsightsReadService(
        db as PrismaService,
        {} as never,
      );
      await expect(
        read.salesForPeriod(workspaceId, from, to, true),
      ).resolves.toMatchObject({
        total: 1,
        unassigned: 1,
        revenueBySeller: [{ id: null, name: null, amount: 100 }],
      });
    } finally {
      await db.telegramAdSalePayment.deleteMany({ where: { workspaceId } });
      await db.transaction.deleteMany({ where: { workspaceId } });
      await db.workspace.delete({ where: { id: workspaceId } });
    }
  });
});

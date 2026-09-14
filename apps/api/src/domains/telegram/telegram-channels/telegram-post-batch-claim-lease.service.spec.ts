/* eslint-disable @typescript-eslint/no-unsafe-assignment -- focused Prisma test double */
import { TelegramPostBatchClaimLeaseService } from './telegram-post-batch-claim-lease.service';

describe('TelegramPostBatchClaimLeaseService', () => {
  it('does not run an external action after the claim was lost', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const service = new TelegramPostBatchClaimLeaseService({
      telegramPostBatchDelivery: { updateMany },
    } as never);
    const work = jest.fn();

    await expect(
      service.runWithClaims(
        [{ id: 'delivery-1', claimOwner: 'old-owner' }],
        'PUBLISHING',
        work,
      ),
    ).resolves.toEqual({ held: false });
    expect(work).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'delivery-1',
          claimOwner: 'old-owner',
          status: 'PUBLISHING',
          claimExpiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
  });
});

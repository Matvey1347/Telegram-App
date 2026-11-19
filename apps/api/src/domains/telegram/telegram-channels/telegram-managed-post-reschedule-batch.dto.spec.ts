import { validate } from 'class-validator';
import { TelegramManagedPostRescheduleBatchDto } from './telegram-managed-post-reschedule-batch.dto';

describe('channel recovery batch admission', () => {
  it('admits a whole 72-post queue and the bounded 100-post maximum', async () => {
    for (const count of [72, 100]) {
      const dto = Object.assign(new TelegramManagedPostRescheduleBatchDto(), {
        postIds: Array.from({ length: count }, (_, index) => `post-${index}`),
      });
      expect(await validate(dto)).toEqual([]);
    }
  });
  it('rejects oversized batches and non-string identifiers', async () => {
    for (const postIds of [Array.from({ length: 101 }, (_, index) => `post-${index}`), [42]]) {
      const dto = Object.assign(new TelegramManagedPostRescheduleBatchDto(), { postIds });
      expect(await validate(dto)).not.toHaveLength(0);
    }
  });
});

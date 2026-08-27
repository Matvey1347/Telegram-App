import { runBounded } from './run-bounded';

describe('runBounded', () => {
  it('preserves input order while limiting concurrent work', async () => {
    let active = 0;
    let peak = 0;
    const results = await runBounded([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return value * 2;
    });

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
  });
});

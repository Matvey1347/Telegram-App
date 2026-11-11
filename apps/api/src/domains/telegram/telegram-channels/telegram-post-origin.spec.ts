import { classifyPostOrigin } from './telegram-post-origin';

describe('classifyPostOrigin', () => {
  it('classifies generated, manual, ad, mutual and external posts', () => {
    expect(
      classifyPostOrigin({ managedPost: { aiPostingGeneration: { id: 'g' } } }),
    ).toBe('AI');
    expect(classifyPostOrigin({ managedPost: {} })).toBe('SYSTEM_MANUAL');
    expect(classifyPostOrigin({ adSalePlacement: true })).toBe('AD');
    expect(classifyPostOrigin({ crossPromotion: true })).toBe('MUTUAL_PROMO');
    expect(classifyPostOrigin({})).toBe('EXTERNAL');
  });

  it('prioritizes AI provenance while keeping promotions excluded', () => {
    expect(
      classifyPostOrigin({
        managedPost: {
          aiPostingGeneration: { id: 'g' },
          adSalePlacements: [{ id: 'ad' }],
        },
      }),
    ).toBe('AI');
    expect(
      classifyPostOrigin({ managedPost: { adSalePlacements: [{ id: 'ad' }] } }),
    ).toBe('AD');
  });
});

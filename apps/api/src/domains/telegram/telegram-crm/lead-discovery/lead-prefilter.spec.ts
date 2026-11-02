import { prefilterLeadPost } from './lead-prefilter';
import {
  reciprocalPromotion,
  type PromotionEvidence,
} from './lead-reciprocity';

const textOnly = (text: string) =>
  prefilterLeadPost({
    text,
    metadataComplete: false,
    sourceChannelId: '11',
    advertisedTargets: [],
  });
describe('conservative lead prefilter', () => {
  it.each([
    'A short quotation.',
    '🔗 editorial post',
    'An editorial post with a source footer',
    'Реклама без ссылки',
    'Подписывайтесь @example',
  ])('never skips ambiguous input: %s', (text) => {
    expect(textOnly(text).decision).toBe('NEEDS_METADATA');
  });
  it('does not skip a quotation with an advertised entity', () => {
    expect(
      prefilterLeadPost({
        text: 'Цитата',
        metadataComplete: false,
        sourceChannelId: '11',
        advertisedTargets: ['22'],
      }).decision,
    ).toBe('NEEDS_METADATA');
  });
  it('treats media-only missing metadata as unresolved', () => {
    expect(textOnly('').decision).toBe('NEEDS_METADATA');
  });
  it.each([
    [
      'psychology service without a link',
      'Индивидуальные консультации психолога. Запись на приём открыта.',
    ],
    [
      'finance article with commercial vocabulary',
      'Как сравнить кредит и скидку при составлении личного бюджета.',
    ],
    [
      'channel advertisement without an explicit link',
      'Читайте наш новый канал о привычках и саморазвитии.',
    ],
  ])('routes %s to further analysis', (_scenario, text) => {
    expect(
      prefilterLeadPost({
        text,
        metadataComplete: true,
        sourceChannelId: '11',
        advertisedTargets: [],
      }),
    ).toMatchObject({ decision: 'NEEDS_AI', ruleVersion: 'lead-prefilter-v3' });
  });
  it('does not interpret a source channel footer as a third-party ad target', () => {
    expect(
      prefilterLeadPost({
        text: 'Редакционная заметка. Реклама и сотрудничество: подписывайтесь на наш канал.',
        metadataComplete: true,
        sourceChannelId: '11',
        advertisedTargets: ['11'],
      }),
    ).toMatchObject({ decision: 'NEEDS_AI', advertisedTargets: [] });
  });
  it('does not skip a short post when media or keyboard metadata is unavailable', () => {
    expect(textOnly('Подробности ниже 👇').decision).toBe('NEEDS_METADATA');
  });
  it('reuses repeated creatives only after a current successful result is verified', () => {
    const creative = {
      text: 'Узнайте больше о проекте',
      metadataComplete: true,
      sourceChannelId: '11',
      advertisedTargets: [],
      contentHash: 'same-creative',
    };
    expect(prefilterLeadPost(creative).decision).toBe('NEEDS_AI');
    expect(
      prefilterLeadPost({
        ...creative,
        verifiedDuplicate: {
          contentHash: 'same-creative',
          resultId: 'earlier-result',
          current: false,
          successful: true,
        },
      }).decision,
    ).toBe('NEEDS_AI');
    expect(
      prefilterLeadPost({
        ...creative,
        verifiedDuplicate: {
          contentHash: 'same-creative',
          resultId: 'earlier-result',
          current: true,
          successful: true,
        },
      }),
    ).toMatchObject({
      decision: 'SAFE_SKIP',
      reusedResultId: 'earlier-result',
    });
  });
  it('does not accept a renamed username as canonical source identity', () => {
    expect(
      prefilterLeadPost({
        text: 'Реклама — подписывайтесь',
        metadataComplete: true,
        sourceChannelId: '@renamed',
        advertisedTargets: ['22'],
      }).decision,
    ).toBe('NEEDS_METADATA');
  });
  it('requires a verified target and multiple signals for likely advertising', () => {
    expect(
      prefilterLeadPost({
        text: 'Реклама — подписывайтесь',
        metadataComplete: true,
        sourceChannelId: '11',
        advertisedTargets: ['22'],
      }).decision,
    ).toBe('LIKELY_AD');
    expect(
      prefilterLeadPost({
        text: 'Реклама',
        metadataComplete: true,
        sourceChannelId: '11',
        advertisedTargets: ['22'],
      }).decision,
    ).toBe('NEEDS_AI');
    expect(
      prefilterLeadPost({
        text: 'Реклама — подписывайтесь',
        metadataComplete: true,
        sourceChannelId: '11',
        advertisedTargets: ['11', '@example'],
      }).decision,
    ).toBe('NEEDS_AI');
  });
  it('marks explicit mutual-promotion wording as a hypothesis only', () => {
    expect(
      prefilterLeadPost({
        text: 'Взаємопіар',
        metadataComplete: true,
        sourceChannelId: '11',
        advertisedTargets: ['22'],
      }).decision,
    ).toBe('LIKELY_VP');
  });
  it('skips only a verified current successful duplicate and supplies its result', () => {
    const item = {
      text: 'x',
      metadataComplete: true,
      sourceChannelId: '11',
      advertisedTargets: [],
      contentHash: 'hash',
      verifiedDuplicate: {
        contentHash: 'hash',
        resultId: 'result',
        current: true,
        successful: true,
      },
    };
    expect(prefilterLeadPost(item)).toMatchObject({
      decision: 'SAFE_SKIP',
      reusedResultId: 'result',
    });
    expect(
      prefilterLeadPost({
        ...item,
        verifiedDuplicate: { ...item.verifiedDuplicate, successful: false },
      }).decision,
    ).toBe('NEEDS_AI');
    expect(
      prefilterLeadPost({ ...item, contentHash: 'changed' }).decision,
    ).toBe('NEEDS_AI');
  });
  it('routes text and uninspected media independently without treating media as organic', () => {
    const item = {
      metadataComplete: false,
      textMetadataComplete: true,
      mediaPresent: true,
      sourceChannelId: '11',
      advertisedTargets: ['22'],
    };
    expect(
      prefilterLeadPost({ ...item, text: 'Реклама — подписывайтесь' }).decision,
    ).toBe('LIKELY_AD');
    expect(prefilterLeadPost({ ...item, text: 'Обычный текст' }).decision).toBe(
      'NEEDS_MEDIA_ANALYSIS',
    );
    expect(prefilterLeadPost({ ...item, text: '' }).decision).toBe(
      'NEEDS_MEDIA_ANALYSIS',
    );
    expect(
      prefilterLeadPost({
        ...item,
        text: 'Реклама — подписывайтесь',
        textMetadataComplete: false,
      }).decision,
    ).toBe('LIKELY_AD');
    expect(
      prefilterLeadPost({
        ...item,
        text: 'Обычный текст',
        contentHash: 'x',
        verifiedDuplicate: {
          contentHash: 'x',
          resultId: 'p',
          current: true,
          successful: true,
        },
      }).decision,
    ).toBe('NEEDS_MEDIA_ANALYSIS');
  });
});

describe('reciprocal promotion evidence', () => {
  const forward: PromotionEvidence = {
    postId: 'post-a',
    sourceChannelId: '11',
    targetChannelId: '22',
    publishedAt: '2026-01-01T00:00:00Z',
    creativeHash: 'a',
    promotionVerified: true,
    catalog: false,
  };
  const reverse: PromotionEvidence = {
    postId: 'post-b',
    sourceChannelId: '22',
    targetChannelId: '11',
    publishedAt: '2026-01-08T00:00:00Z',
    creativeHash: 'b',
    promotionVerified: true,
    catalog: false,
  };
  it('keeps independently verified reciprocal posts as pending human review', () => {
    expect(reciprocalPromotion(forward, reverse)).toMatchObject({
      reviewStatus: 'PENDING',
      windowDays: 7,
    });
  });
  it('allows two independently verified posts with identical creative', () => {
    expect(
      reciprocalPromotion(forward, {
        ...reverse,
        creativeHash: forward.creativeHash,
      }),
    ).not.toBeNull();
  });
  it.each([
    { ...reverse, targetChannelId: '33' },
    { ...reverse, publishedAt: '2026-01-08T00:00:01Z' },
    { ...reverse, promotionVerified: false },
    { ...reverse, catalog: true },
    { ...reverse, sourceChannelId: '@renamed' },
    { ...reverse, postId: 'post-a' },
  ])('rejects unproven reciprocity %#', (item) => {
    expect(reciprocalPromotion(forward, item)).toBeNull();
  });
});

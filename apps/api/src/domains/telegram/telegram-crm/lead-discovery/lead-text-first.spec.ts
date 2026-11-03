import { prefilterLeadPost } from './lead-prefilter';
describe('text-first promotion hints', () => {
  const base = {
    metadataComplete: false,
    textMetadataComplete: true,
    mediaPresent: true,
    sourceChannelId: '123',
    advertisedTargets: [] as string[],
  };
  const target = [
    { kind: 'PUBLIC_URL', origin: 'TEXT', value: 'https://merchant.example/' },
  ];
  it('detects a text offer with an unverified site even when media and other entities are incomplete', () => {
    expect(
      prefilterLeadPost({
        ...base,
        textMetadataComplete: false,
        text: 'Розпродаж. Ціна 100 грн. Замовити https://merchant.example/',
        externalEvidence: target,
      }),
    ).toMatchObject({
      decision: 'LIKELY_AD',
      confidenceBand: 'MEDIUM',
      advertisedTargets: [],
    });
  });
  it('does not infer advertising from an isolated link or a call to action', () => {
    expect(
      prefilterLeadPost({
        ...base,
        text: 'Наші новини',
        externalEvidence: target,
      }).decision,
    ).toBe('NEEDS_MEDIA_ANALYSIS');
    expect(
      prefilterLeadPost({ ...base, text: 'Підписуйтесь на оновлення' })
        .decision,
    ).toBe('NEEDS_MEDIA_ANALYSIS');
  });
  it('treats a mutual promotion marker as a hint, not proof of reciprocity', () => {
    expect(
      prefilterLeadPost({
        ...base,
        text: 'Взаємопіар з іншим проєктом',
        externalEvidence: target,
      }),
    ).toMatchObject({ decision: 'LIKELY_VP' });
  });
  it('does not infer organic content with unexamined media or unknown entities', () => {
    expect(
      prefilterLeadPost({ ...base, text: 'Звичайна стаття' }).decision,
    ).toBe('NEEDS_MEDIA_ANALYSIS');
    expect(
      prefilterLeadPost({
        ...base,
        textMetadataComplete: false,
        text: 'Звичайна стаття',
      }).decision,
    ).toBe('NEEDS_METADATA');
  });
});

import 'reflect-metadata';
import {
  CreateMutualPromotionPostDto,
  MutualPromotionScheduledPostDraftDto,
} from './dto';

describe('Mutual promotion DTO runtime metadata', () => {
  it('loads the nested scheduled-post class before emitting array metadata', () => {
    expect(MutualPromotionScheduledPostDraftDto).toBeDefined();
    expect(
      Reflect.getMetadata(
        'design:type',
        CreateMutualPromotionPostDto.prototype,
        'posts',
      ),
    ).toBe(Array);
  });
});

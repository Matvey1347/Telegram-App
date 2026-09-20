import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TelegramUnifiedImportDto } from './telegram-unified-import.dto';

describe('TelegramUnifiedImportDto', () => {
  it('lets preview report malformed image URL strings as item errors', () => {
    const dto = plainToInstance(TelegramUnifiedImportDto, {
      version: 1,
      posts: [
        {
          ref: 'post-1',
          action: 'CREATE',
          title: 'Publication',
          imageUrls: ['image search phrase'],
        },
      ],
    });

    expect(validateSync(dto)).toEqual([]);
  });

  it('still rejects non-string image URL entries at the HTTP boundary', () => {
    const dto = plainToInstance(TelegramUnifiedImportDto, {
      version: 1,
      posts: [
        {
          ref: 'post-1',
          action: 'CREATE',
          title: 'Publication',
          imageUrls: [42],
        },
      ],
    });

    expect(validateSync(dto)).not.toEqual([]);
  });

  it('accepts resumable imported markers in every manifest section', () => {
    const dto = plainToInstance(TelegramUnifiedImportDto, {
      version: 1,
      groups: [
        { ref: 'group-1', action: 'CREATE', title: 'Group', imported: false },
      ],
      hypotheses: [
        {
          ref: 'hypothesis-1',
          action: 'CREATE',
          imported: false,
          value: { name: 'Hypothesis' },
        },
      ],
      posts: [
        { ref: 'post-1', action: 'CREATE', title: 'Post', imported: false },
      ],
      schedule: [
        {
          action: 'SCHEDULE',
          postRef: 'post-1',
          slotId: 'slot-1',
          scheduledAt: '2026-09-21T08:10:00+02:00',
          imported: false,
        },
      ],
      delete: {
        groups: [{ id: 'group-old', imported: false }],
        hypotheses: [{ id: 'hypothesis-old', imported: false }],
        posts: [{ id: 'post-old', imported: false }],
      },
    });

    expect(
      validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
  });

  it('accepts a custom schedule without a publication slot', () => {
    const dto = plainToInstance(TelegramUnifiedImportDto, {
      version: 1,
      schedule: [
        {
          action: 'SCHEDULE',
          placementMode: 'CUSTOM',
          postId: 'post-1',
          scheduledAt: '2026-09-21T08:10:00+02:00',
          imported: false,
        },
      ],
    });

    expect(
      validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
  });
});

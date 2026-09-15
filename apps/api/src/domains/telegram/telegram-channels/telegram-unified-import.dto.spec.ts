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
});

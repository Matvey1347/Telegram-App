import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateTelegramManagedPostDto,
  TelegramChannelListQueryDto,
  UpdateTelegramManagedPostDto,
} from './dto';

const buttonRows = [
  [
    {
      text: 'Open',
      url: 'https://example.com',
      style: 'primary',
    },
  ],
];

describe('managed post button DTOs', () => {
  it.each([CreateTelegramManagedPostDto, UpdateTelegramManagedPostDto])(
    'accepts array-based inline button rows for %p',
    (Dto) => {
      const dto = plainToInstance(Dto, { title: 'Post', buttonRows });

      expect(
        validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
      ).toEqual([]);
    },
  );
});

describe('TelegramChannelListQueryDto', () => {
  it('preserves false query flags instead of coercing their strings to true', () => {
    const dto = plainToInstance(TelegramChannelListQueryDto, {
      archived: 'false',
      owned: 'true',
    });

    expect(dto.archived).toBe(false);
    expect(dto.owned).toBe(true);
    expect(validateSync(dto)).toEqual([]);
  });
});

import 'reflect-metadata';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateTelegramManagedPostDto,
  TelegramChannelListQueryDto,
  TelegramManagedPostsQueryDto,
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

type ManagedPostDto =
  | CreateTelegramManagedPostDto
  | UpdateTelegramManagedPostDto;

const managedPostDtoConstructors: Array<ClassConstructor<ManagedPostDto>> = [
  CreateTelegramManagedPostDto,
  UpdateTelegramManagedPostDto,
];

describe('managed post button DTOs', () => {
  it.each(managedPostDtoConstructors)(
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

describe('TelegramManagedPostsQueryDto', () => {
  it('accepts repeated or comma-separated status filters and bounds page size', () => {
    const dto = plainToInstance(TelegramManagedPostsQueryDto, {
      status: ['DRAFT,SCHEDULED', 'FAILED'],
      page: '2',
      pageSize: '100',
    });

    expect(dto.status).toEqual(['DRAFT', 'SCHEDULED', 'FAILED']);
    expect(validateSync(dto)).toEqual([]);

    const oversized = plainToInstance(TelegramManagedPostsQueryDto, {
      pageSize: '101',
    });
    expect(validateSync(oversized)).not.toEqual([]);
  });
});

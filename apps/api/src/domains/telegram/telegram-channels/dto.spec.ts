import 'reflect-metadata';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateTelegramManagedPostDto,
  ImportTelegramChannelsBatchDto,
  SyncNowDto,
  TelegramChannelListQueryDto,
  TelegramManagedPostsQueryDto,
  UpdateTelegramChannelDto,
  UpdateTelegramManagedPostDto,
} from './dto';
import { TelegramChannelPerformanceHistoryQueryDto } from './telegram-channel-bounded-read.dto';

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

describe('SyncNowDto', () => {
  it('accepts post counts above 100 and rejects values above the Telegram sync cap', () => {
    const valid = plainToInstance(SyncNowDto, { postLimit: '750' });
    expect(valid.postLimit).toBe(750);
    expect(validateSync(valid)).toEqual([]);

    const oversized = plainToInstance(SyncNowDto, { postLimit: '10001' });
    expect(validateSync(oversized)).not.toEqual([]);
  });
});

describe('ImportTelegramChannelsBatchDto', () => {
  it('accepts up to 20 channel references and rejects empty or oversized batches', () => {
    expect(
      validateSync(
        plainToInstance(ImportTelegramChannelsBatchDto, {
          inputs: ['https://t.me/one', 'https://t.me/+two'],
        }),
      ),
    ).toEqual([]);
    expect(
      validateSync(
        plainToInstance(ImportTelegramChannelsBatchDto, { inputs: [] }),
      ),
    ).not.toEqual([]);
    expect(
      validateSync(
        plainToInstance(ImportTelegramChannelsBatchDto, {
          inputs: Array.from({ length: 21 }, (_, index) => `channel-${index}`),
        }),
      ),
    ).not.toEqual([]);
  });
});

describe('UpdateTelegramChannelDto', () => {
  it('accepts an explicit no-seed setting', () => {
    const dto = plainToInstance(UpdateTelegramChannelDto, {
      seedDisabled: true,
    });

    expect(dto.seedDisabled).toBe(true);
    expect(validateSync(dto)).toEqual([]);
  });

  it('accepts a saved post sync limit above 100', () => {
    const dto = plainToInstance(UpdateTelegramChannelDto, {
      postSyncLimit: '750',
    });

    expect(dto.postSyncLimit).toBe(750);
    expect(validateSync(dto)).toEqual([]);
  });
});

describe('TelegramManagedPostsQueryDto', () => {
  it('accepts repeated or comma-separated status filters and bounds page size', () => {
    const dto = plainToInstance(TelegramManagedPostsQueryDto, {
      status: ['DRAFT,SCHEDULED', 'FAILED'],
      all: 'true',
      page: '2',
      pageSize: '100',
    });

    expect(dto.status).toEqual(['DRAFT', 'SCHEDULED', 'FAILED']);
    expect(dto.all).toBe(true);
    expect(validateSync(dto)).toEqual([]);

    const oversized = plainToInstance(TelegramManagedPostsQueryDto, {
      pageSize: '101',
    });
    expect(validateSync(oversized)).not.toEqual([]);
  });
});

describe('TelegramChannelPerformanceHistoryQueryDto', () => {
  it('accepts only supported history ranges', () => {
    const valid = plainToInstance(TelegramChannelPerformanceHistoryQueryDto, {
      range: '90d',
    });
    expect(valid.range).toBe('90d');
    expect(validateSync(valid)).toEqual([]);

    const unsupported = plainToInstance(
      TelegramChannelPerformanceHistoryQueryDto,
      { range: '365d' },
    );
    expect(validateSync(unsupported)).not.toEqual([]);
  });
});

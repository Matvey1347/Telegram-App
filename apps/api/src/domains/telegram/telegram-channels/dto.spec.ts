import 'reflect-metadata';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateTelegramManagedPostDto,
  ImportTelegramChannelsBatchDto,
  SyncNowDto,
  TelegramChannelListQueryDto,
  TelegramChannelInviteLinksQueryDto,
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

  it('accepts one invite link selected for bot publications', () => {
    const dto = plainToInstance(UpdateTelegramChannelDto, {
      botInviteLinkId: 'invite-bot',
    });

    expect(dto.botInviteLinkId).toBe('invite-bot');
    expect(validateSync(dto)).toEqual([]);
  });

  it('accepts broadcast, audience-transfer and internal CPM settings', () => {
    const dto = plainToInstance(UpdateTelegramChannelDto, {
      broadcastInviteLinkId: 'invite-broadcast',
      audienceTransferInviteLinkId: 'invite-transfer',
      internalCpm: '175.5',
    });

    expect(dto.broadcastInviteLinkId).toBe('invite-broadcast');
    expect(dto.audienceTransferInviteLinkId).toBe('invite-transfer');
    expect(dto.internalCpm).toBe(175.5);
    expect(validateSync(dto)).toEqual([]);
  });

  it('rejects a negative internal CPM', () => {
    const dto = plainToInstance(UpdateTelegramChannelDto, {
      internalCpm: -1,
    });

    expect(validateSync(dto)).not.toEqual([]);
  });

  it('limits the channel short description to 240 characters', () => {
    const valid = plainToInstance(UpdateTelegramChannelDto, {
      shortDescription: 'a'.repeat(240),
    });
    const oversized = plainToInstance(UpdateTelegramChannelDto, {
      shortDescription: 'a'.repeat(241),
    });

    expect(validateSync(valid)).toEqual([]);
    expect(validateSync(oversized)).not.toEqual([]);
  });
});

describe('TelegramChannelInviteLinksQueryDto', () => {
  it('accepts the saved link ids required to hydrate closed selectors', () => {
    const dto = plainToInstance(TelegramChannelInviteLinksQueryDto, {
      initial: 'true',
      selectedIds: 'main,vp,folder,bot',
    });

    expect(dto.selectedIds).toEqual(['main', 'vp', 'folder', 'bot']);
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

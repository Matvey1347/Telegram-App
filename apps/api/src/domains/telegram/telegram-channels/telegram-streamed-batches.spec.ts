import { TelegramPostCalendarPlannerService } from './telegram-post-calendar-planner.service';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';

describe('streamed Telegram batches', () => {
  it('hydrates emoji saved by the legacy group importer', async () => {
    const service = new TelegramManagedPostGroupPresentationService({
      icon: {
        findFirst: jest.fn().mockResolvedValue({ id: 'system-icon' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as never);

    const [group] = await service.attachPostGroupIcons([
      { workspaceId: 'workspace-1', title: 'Heart', icon: '❤️' },
    ]);

    expect(group.iconPresentation).toMatchObject({
      type: 'unicode',
      value: '❤️',
    });
  });

  it('imports all groups and reports individual failures without ending the stream', async () => {
    const service = Object.create(
      TelegramPostGroupsService.prototype,
    ) as TelegramPostGroupsService & { createPostGroup: jest.Mock };
    service.createPostGroup = jest
      .fn()
      .mockResolvedValueOnce({ id: 'group-1' })
      .mockRejectedValueOnce(new Error('duplicate title'));
    const progress = jest.fn();

    const result = await service.importPostGroups(
      'user-1',
      {
        groups: [
          { telegramChannelId: 'channel-1', title: 'One' },
          { telegramChannelId: 'channel-1', title: 'Two' },
        ],
      },
      progress,
    );

    expect(result).toMatchObject({ total: 2, successCount: 1, failedCount: 1 });
    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ success: false, error: 'duplicate title' }),
      2,
      2,
    );
  });

  it('streams mixed auto-posting slot mutations and keeps processing failures', async () => {
    const service = Object.create(
      TelegramPostCalendarPlannerService.prototype,
    ) as TelegramPostCalendarPlannerService & {
      createSlot: jest.Mock;
      deleteSlot: jest.Mock;
    };
    service.createSlot = jest.fn().mockResolvedValue({ id: 'slot-1' });
    service.deleteSlot = jest.fn().mockRejectedValue(new Error('slot missing'));
    const progress = jest.fn();

    const result = await service.mutateSlotsBatch(
      'user-1',
      'channel-1',
      {
        items: [
          { action: 'CREATE', data: { weekday: 1, time: '10:00' } },
          { action: 'DELETE', slotId: 'missing' },
        ],
      },
      progress,
    );

    expect(result).toMatchObject({ total: 2, successCount: 1, failedCount: 1 });
    expect(progress).toHaveBeenCalledTimes(2);
  });
});

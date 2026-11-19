import type { TelegramManagedPost } from '@prisma/client';
import {
  assertExistingNativeScheduleIdentity,
  assertMissingNativeScheduleRepairable,
  historyCandidatesForReschedule,
  preservedScheduleStage,
} from './telegram-managed-post-rescheduler-repair';
import type { ReschedulerAccountContext } from './telegram-managed-post-rescheduler.remote';

const future = new Date(Date.now() + 86_400_000);
function post(patch: Partial<TelegramManagedPost> = {}): TelegramManagedPost {
  return {
    id: 'post',
    sourceId: 'original',
    scheduleMode: 'TELEGRAM_NATIVE',
    scheduledAt: future,
    text: '**A useful post** with an_under_score',
    imageUrls: [],
    mediaItems: [],
    publishMode: 'TEXT_ONLY',
    telegramScheduledMessageIds: ['101'],
    telegramMessageIds: [],
    ...patch,
  } as TelegramManagedPost;
}
function message(patch: Record<string, unknown> = {}) {
  return {
    id: '101',
    date: future.toISOString(),
    text: 'A useful post with an_under_score',
    hasMedia: false,
    html: '',
    mediaKind: null,
    groupedId: null,
    ...patch,
  } as NonNullable<ReschedulerAccountContext['scheduledMessages']>[number];
}
function alternate(messages = [message()]): ReschedulerAccountContext {
  return {
    scheduledIds: new Set(),
    error: 'original sender unavailable',
    confirmationOnlyScheduledMessages: messages,
  };
}

describe('positive native schedule confirmation', () => {
  it('preserves exact content and time confirmed by another connected channel reader', () => {
    const context = alternate();
    expect(preservedScheduleStage(post(), context, false)).toBe(
      'NATIVE_SCHEDULE_PRESERVED',
    );
    expect(context.error).toBe('original sender unavailable');
    expect(context.scheduledIds.size).toBe(0);
    expect(
      historyCandidatesForReschedule(
        [post()],
        new Map([['original', context]]),
        new Date(),
      ),
    ).toEqual([]);
  });

  it.each([
    ['wrong text', [message({ text: 'A completely different post' })]],
    [
      'wrong timestamp',
      [message({ date: new Date(future.getTime() + 1000).toISOString() })],
    ],
    ['missing ID', [message({ id: 'other' })]],
    ['unexpected media', [message({ hasMedia: true })]],
    ['duplicate remote IDs', [message(), message()]],
    ['empty alternate queue', []],
  ])('does not preserve %s from an alternate reader', (_reason, messages) => {
    expect(
      preservedScheduleStage(post(), alternate(messages), false),
    ).toBeUndefined();
    expect(
      historyCandidatesForReschedule(
        [post()],
        new Map([['original', alternate(messages)]]),
        new Date(),
      ),
    ).toHaveLength(1);
  });

  it('checks content for the original sender as well as for an alternate reader', () => {
    expect(
      preservedScheduleStage(
        post(),
        {
          scheduledIds: new Set(['101']),
          scheduledMessages: [message({ text: 'Wrong text' })],
        },
        false,
      ),
    ).toBeUndefined();
  });

  it('requires every multipart ID, expected media count, and complete visible text', () => {
    const multipart = post({
      telegramScheduledMessageIds: ['101', '102'],
      imageUrls: ['https://media.example/photo.jpg'],
      publishMode: 'IMAGES_THEN_TEXT',
    });
    const snapshot = [
      message({ hasMedia: true, text: '' }),
      message({ id: '102' }),
    ];
    expect(preservedScheduleStage(multipart, alternate(snapshot), false)).toBe(
      'NATIVE_SCHEDULE_PRESERVED',
    );
    expect(
      preservedScheduleStage(multipart, alternate(snapshot.slice(0, 1)), false),
    ).toBeUndefined();
    expect(
      preservedScheduleStage(
        multipart,
        alternate([snapshot[0], message({ id: '102', text: 'A useful post' })]),
        false,
      ),
    ).toBeUndefined();
  });

  it('never uses alternate absence as repair permission', async () => {
    await expect(
      assertMissingNativeScheduleRepairable({
        prisma: {} as never,
        identity: {} as never,
        post: post(),
        context: alternate([]),
        workspaceId: 'workspace',
        channelId: 'channel',
        history: undefined,
      }),
    ).rejects.toThrow(
      'Original sender complete scheduled queue is unavailable',
    );
  });

  it('rejects overlapping local IDs even with an exact remote confirmation', () => {
    expect(preservedScheduleStage(post(), alternate(), true)).toBeUndefined();
  });

  it('does not turn past scheduled messages into positive preservation', () => {
    expect(
      preservedScheduleStage(
        post({ scheduledAt: new Date(Date.now() - 1000) }),
        alternate(),
        false,
      ),
    ).toBeUndefined();
  });
});

describe('existing native identity before mutation', () => {
  function original(messages = [message()]): ReschedulerAccountContext {
    return {
      scheduledIds: new Set(messages.map((entry) => entry.id)),
      scheduledMessages: messages,
    };
  }

  it('permits correcting the timestamp only when content and media still identify the stored post', () => {
    expect(() =>
      assertExistingNativeScheduleIdentity(
        post(),
        original([
          message({ date: new Date(future.getTime() + 60_000).toISOString() }),
        ]),
      ),
    ).not.toThrow();
  });

  it.each([
    ['unrelated text', [message({ text: 'An advertising placement' })]],
    ['unexpected media', [message({ hasMedia: true })]],
    ['duplicate IDs', [message(), message()]],
  ])('blocks mutation of %s', (_reason, messages) => {
    expect(() =>
      assertExistingNativeScheduleIdentity(post(), original(messages)),
    ).toThrow('no schedule was changed');
  });

  it('blocks a partial multipart identity before even the surviving message is deleted', () => {
    expect(() =>
      assertExistingNativeScheduleIdentity(
        post({ telegramScheduledMessageIds: ['101', '102'] }),
        original(),
      ),
    ).toThrow('complete post content and media');
  });

  it('blocks ID-only snapshots without content evidence', () => {
    expect(() =>
      assertExistingNativeScheduleIdentity(post(), {
        scheduledIds: new Set(['101']),
      }),
    ).toThrow('no schedule was changed');
  });

  it('leaves complete absence to the stricter missing-schedule repair preflight', () => {
    expect(() =>
      assertExistingNativeScheduleIdentity(post(), original([])),
    ).not.toThrow();
  });

  it('does not reinterpret alternate-reader confirmation as original cancellation evidence', () => {
    const context = alternate();
    expect(() =>
      assertExistingNativeScheduleIdentity(post(), context),
    ).not.toThrow();
    expect(context.scheduledIds.size).toBe(0);
    expect(context.error).toBeDefined();
  });
});

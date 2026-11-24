import type { TelegramPublicationSlotOccurrence } from '@telegram-system/shared';
import { autopilotContentSlots } from './telegram-ai-posting-autopilot-policy';

describe('Autopilot optional content slots', () => {
  const occurrence = (
    slotId: string,
    scheduledAt: string,
    isOptional: boolean,
  ): TelegramPublicationSlotOccurrence => ({
    slotId,
    scheduledAt,
    isOptional,
    title: slotId,
    kind: 'CONTENT',
    state: 'AVAILABLE',
    time: '00:30',
    timezone: 'Europe/Warsaw',
  });

  it('alternates optional slots by local date and keeps required and occupied slots', () => {
    const first = '2026-01-01T23:30:00.000Z';
    const second = '2026-01-02T23:30:00.000Z';
    const optional = [
      occurrence('optional-first', first, true),
      occurrence('optional-second', second, true),
    ];
    const selected = autopilotContentSlots(optional);
    expect(selected).toHaveLength(1);
    expect(
      autopilotContentSlots([
        ...optional,
        occurrence('required-first', first, false),
        occurrence('required-second', second, false),
      ]).map(({ slotId }) => slotId),
    ).toEqual(['required-first', 'required-second']);
    const omitted = optional.find((slot) => !selected.includes(slot))!;
    expect(
      autopilotContentSlots([{ ...omitted, state: 'OCCUPIED' }]),
    ).toHaveLength(1);
  });
});

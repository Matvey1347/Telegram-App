import {
  publicationScheduleOccurrenceAt,
  publicationScheduleTimeAtInstant,
  publicationScheduleTimeForDisplay,
  publicationScheduleTimeForStorage,
} from './telegram-publication-schedule-times';

describe('publication schedule times', () => {
  it('stores and presents a slot as workspace-local wall-clock time', () => {
    expect(publicationScheduleTimeForStorage('09:10')).toBe('09:10');
    expect(publicationScheduleTimeForDisplay('09:10')).toBe('09:10');
  });

  it('keeps the same Kyiv wall-clock slot across the autumn DST boundary', () => {
    expect(
      publicationScheduleOccurrenceAt(
        { year: 2026, month: 10, day: 24 },
        '07:10',
        'Europe/Kyiv',
      ).toISOString(),
    ).toBe('2026-10-24T04:10:00.000Z');
    expect(
      publicationScheduleOccurrenceAt(
        { year: 2026, month: 10, day: 25 },
        '07:10',
        'Europe/Kyiv',
      ).toISOString(),
    ).toBe('2026-10-25T05:10:00.000Z');
    expect(
      publicationScheduleTimeAtInstant(
        new Date('2026-10-25T07:10:00+02:00'),
        'Europe/Kyiv',
      ),
    ).toBe('07:10');
  });
});

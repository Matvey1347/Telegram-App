import {
  publicationScheduleOccurrenceAt,
  publicationScheduleTimeInTimezone,
  publicationScheduleTimeToUtc,
} from './telegram-publication-schedule-times';

describe('publication schedule times', () => {
  const octoberFourth = new Date('2026-10-04T12:00:00.000Z');

  it('stores a Warsaw-entered slot in UTC and presents it in Kyiv time', () => {
    expect(
      publicationScheduleTimeToUtc('09:10', 'Europe/Warsaw', octoberFourth),
    ).toBe('07:10');
    expect(
      publicationScheduleTimeInTimezone('07:10', 'Europe/Kyiv', octoberFourth),
    ).toBe('10:10');
  });

  it('keeps the Main Publications Plan cadence when its legacy Warsaw slots move to Kyiv', () => {
    const legacyWarsawTimes = [
      '06:10',
      '08:10',
      '09:10',
      '11:10',
      '15:10',
      '16:10',
      '17:10',
      '19:10',
    ];

    expect(
      legacyWarsawTimes.map((time) =>
        publicationScheduleTimeInTimezone(
          publicationScheduleTimeToUtc(time, 'Europe/Warsaw', octoberFourth),
          'Europe/Kyiv',
          octoberFourth,
        ),
      ),
    ).toEqual([
      '07:10',
      '09:10',
      '10:10',
      '12:10',
      '16:10',
      '17:10',
      '18:10',
      '20:10',
    ]);
  });

  it('creates the occurrence at the canonical UTC time for the local calendar date', () => {
    expect(
      publicationScheduleOccurrenceAt(
        { year: 2026, month: 10, day: 4 },
        '04:10',
      ).toISOString(),
    ).toBe('2026-10-04T04:10:00.000Z');
  });
});

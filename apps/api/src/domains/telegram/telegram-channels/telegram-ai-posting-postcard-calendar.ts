export const HOLIDAY_POSTCARD_RUBRIC = 'Святкові листівки';

const fixedOccasions: ReadonlyArray<readonly [number, number, string]> = [
  [1, 1, 'Новий рік'],
  [1, 6, 'Водохреще'],
  [1, 22, 'День Соборності України'],
  [2, 2, 'Стрітення Господнє'],
  [2, 14, 'День святого Валентина'],
  [3, 8, 'Міжнародний жіночий день'],
  [3, 25, 'Благовіщення'],
  [5, 1, 'День праці'],
  [5, 8, 'День пам’яті та перемоги над нацизмом (стримане вшанування)'],
  [6, 28, 'День Конституції України'],
  [7, 15, 'День Української Державності'],
  [8, 6, 'Преображення Господнє'],
  [8, 15, 'Успіння Пресвятої Богородиці'],
  [8, 23, 'День Державного Прапора України'],
  [8, 24, 'День Незалежності України'],
  [9, 8, 'Різдво Пресвятої Богородиці'],
  [9, 14, 'Воздвиження Хреста Господнього'],
  [10, 1, 'День захисників і захисниць України та Покрова'],
  [11, 21, 'День Гідності та Свободи (стримане вшанування)'],
  [12, 6, 'День святого Миколая'],
  [12, 24, 'Різдвяний святвечір'],
  [12, 25, 'Різдво Христове'],
];

const dayMs = 86_400_000;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function easternEaster(year: number) {
  // Julian computus, converted to the Gregorian civil date.
  const lunar = (19 * (year % 19) + 15) % 30;
  const weekday = (2 * (year % 4) + 4 * (year % 7) - lunar + 34) % 7;
  const total = lunar + weekday + 114;
  const offset = Math.floor(year / 100) - Math.floor(year / 400) - 2;
  return Date.UTC(year, Math.floor(total / 31) - 1, total % 31 + 1 + offset);
}

function occasions(year: number) {
  const easter = easternEaster(year);
  const may = new Date(Date.UTC(year, 4, 1));
  const mothersDay = 8 + ((7 - may.getUTCDay()) % 7);
  return [
    ...fixedOccasions,
    [5, mothersDay, 'День матері'] as const,
  ].map(([month, day, name]) => ({ date: isoDate(new Date(Date.UTC(year, month - 1, day))), name }))
    .concat([
      { date: isoDate(new Date(easter - 7 * dayMs)), name: 'Вербна неділя' },
      { date: isoDate(new Date(easter)), name: 'Великдень' },
      { date: isoDate(new Date(easter + 39 * dayMs)), name: 'Вознесіння Господнє' },
      { date: isoDate(new Date(easter + 49 * dayMs)), name: 'Трійця' },
    ]);
}

export function upcomingPostcardOccasions(from: Date, timezone = 'Europe/Kyiv', days = 45) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(from);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  const year = part('year');
  const start = Date.UTC(year, part('month') - 1, part('day'));
  const lower = isoDate(new Date(start));
  const upper = isoDate(new Date(start + days * dayMs));
  return [...occasions(year), ...occasions(year + 1)]
    .filter(({ date }) => date >= lower && date <= upper)
    .sort((a, b) => a.date.localeCompare(b.date));
}

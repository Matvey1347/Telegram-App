import sharp from 'sharp';
import {
  isUnletteredPostcard,
  letterTelegramAiPostingPostcard,
  postcardGenerationInstruction,
  telegramAiPostingPostcardProfile,
} from './telegram-ai-posting-postcard';
import { upcomingPostcardOccasions } from './telegram-ai-posting-postcard-calendar';

describe('AI Posting postcards', () => {
  const wish = 'Мирного й теплого вечора!';

  it('distinguishes the two channel profiles and only enables lettering where intended', () => {
    expect(telegramAiPostingPostcardProfile('💝 Листівки Привітання щодня 💝')).toBe('daily');
    expect(telegramAiPostingPostcardProfile('💌 Улюблені Листівки 💌')).toBe('loved');
    expect(telegramAiPostingPostcardProfile('Жіноча сила🍃')).toBeUndefined();
    expect(postcardGenerationInstruction({ profile: 'daily', wish, ordinal: 0 })).toContain('without letters');
    expect(postcardGenerationInstruction({ profile: 'loved', wish, ordinal: 1 })).toContain('lower quarter');
    expect(postcardGenerationInstruction({ profile: 'loved', wish, ordinal: 1 })).not.toContain(wish);
  });

  it.each([
    { background: '#f8f8f8', lettering: 'light' },
    { background: '#242424', lettering: 'light' },
  ])('renders $lettering letters over $background', async ({ background, lettering }) => {
    const source = await sharp({ create: { width: 600, height: 800, channels: 3, background } }).png().toBuffer();
    const outlined = await letterTelegramAiPostingPostcard(source, { profile: 'daily', wish, ordinal: 0 });
    const { data, info } = await sharp(outlined).raw().toBuffer({ resolveWithObject: true });
    const nearOpposite = data.subarray(0, Math.floor(info.height * .14) * info.width * info.channels)
      .filter((sample, index) => index % info.channels === 0 && sample > 225);
    expect(nearOpposite.length).toBeGreaterThan(200);
    expect(info.width).toBe(600);
    expect(info.height).toBe(800);
  });

  it('only accepts artwork confirmed to have no lettering', () => {
    expect(isUnletteredPostcard({ embeddedGreeting: true, visibleGreeting: wish })).toBe(false);
    expect(isUnletteredPostcard({ embeddedGreeting: false })).toBe(false);
    expect(isUnletteredPostcard({ embeddedGreeting: false, visibleGreeting: '' })).toBe(true);
  });

  it('reports movable festivities and observes the local day at UTC boundaries', () => {
    const spring = upcomingPostcardOccasions(new Date('2026-04-01T00:00:00Z'), 'Europe/Kyiv', 65);
    expect(spring).toEqual(expect.arrayContaining([
      { date: '2026-04-05', name: 'Вербна неділя' },
      { date: '2026-04-12', name: 'Великдень' },
      { date: '2026-05-10', name: 'День матері' },
      { date: '2026-05-31', name: 'Трійця' },
    ]));
    const instant = new Date('2026-12-24T22:30:00Z');
    expect(upcomingPostcardOccasions(instant, 'Europe/Kyiv', 0)).toEqual([
      { date: '2026-12-25', name: 'Різдво Христове' },
    ]);
    expect(upcomingPostcardOccasions(instant, 'America/Toronto', 0)).toEqual([
      { date: '2026-12-24', name: 'Різдвяний святвечір' },
    ]);
  });
});

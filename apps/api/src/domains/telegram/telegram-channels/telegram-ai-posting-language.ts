import type { PrismaService } from '../../../prisma/prisma.service';

export function detectTelegramAiPostingLanguage(
  posts: Array<{ text?: string | null; formattedText?: string | null }>,
) {
  const text = posts
    .map((post) => post.text || post.formattedText || '')
    .join(' ')
    .slice(0, 30_000)
    .toLocaleLowerCase();
  if (!text.trim()) return '';
  const count = (pattern: RegExp) => (text.match(pattern) ?? []).length;
  const ukrainian = count(/[іїєґ]/g);
  const russian = count(/[ыэъё]/g);
  if (ukrainian >= 2 && ukrainian > russian) return 'uk';
  if (russian >= 2 && russian > ukrainian) return 'ru';
  const cyrillic = count(/[а-яёіїєґ]/g);
  const latin = count(/[a-z]/g);
  if (cyrillic >= 20 && cyrillic > latin) return 'ru';
  const scores = [
    [
      'de',
      count(/\b(der|die|das|und|ist|mit|für|nicht|auf)\b/g) +
        count(/[äöüß]/g) * 2,
    ],
    [
      'es',
      count(/\b(el|la|los|las|de|que|con|para|una|por)\b/g) +
        count(/[ñ¿¡áéíóú]/g) * 2,
    ],
    ['en', count(/\b(the|and|is|with|for|not|this|you|your|from)\b/g)],
  ] as const;
  const sorted = [...scores].sort((a, b) => b[1] - a[1]);
  return sorted[0][1] >= 3 && sorted[0][1] > sorted[1][1] ? sorted[0][0] : '';
}

const LANGUAGE_NAMES: Record<string, string> = {
  uk: 'Ukrainian (Українська)',
  ua: 'Ukrainian (Українська)',
  ukrainian: 'Ukrainian (Українська)',
  українська: 'Ukrainian (Українська)',
  ru: 'Russian (Русский)',
  russian: 'Russian (Русский)',
  русский: 'Russian (Русский)',
  en: 'English',
  english: 'English',
  de: 'German (Deutsch)',
  german: 'German (Deutsch)',
  es: 'Spanish (Español)',
  spanish: 'Spanish (Español)',
};

export function telegramAiPostingLanguageName(
  language: string | null | undefined,
) {
  const value = language?.trim();
  if (!value) return '';
  const normalized = value.toLocaleLowerCase();
  if (['auto', 'automatic', 'detect', 'auto-detect', ''].includes(normalized))
    return '';
  if (/^uk(?:-[a-z]{2})?$/i.test(value)) return 'Ukrainian (Українська)';
  if (/^ru(?:-[a-z]{2})?$/i.test(value)) return 'Russian (Русский)';
  if (/^en(?:-[a-z]{2})?$/i.test(value)) return 'English';
  if (/^de(?:-[a-z]{2})?$/i.test(value)) return 'German (Deutsch)';
  if (/^es(?:-[a-z]{2})?$/i.test(value)) return 'Spanish (Español)';
  return LANGUAGE_NAMES[normalized] ?? value;
}
export async function resolveTelegramAiPostingLanguage(
  prisma: Pick<PrismaService, 'telegramChannel' | 'telegramPost'>,
  input: {
    workspaceId: string;
    channelId: string;
    configuredLanguage?: string | null;
    channelLanguage?: string | null;
  },
) {
  const configured = telegramAiPostingLanguageName(input.configuredLanguage);
  if (configured) return configured;
  let channelLanguage = input.channelLanguage;
  if (channelLanguage === undefined) {
    const channel = await prisma.telegramChannel.findFirst({
      where: { id: input.channelId, workspaceId: input.workspaceId },
      select: { language: true },
    });
    channelLanguage = channel?.language;
  }
  const stored = telegramAiPostingLanguageName(channelLanguage);
  if (stored) return stored;
  const recentPosts = await prisma.telegramPost.findMany({
    where: {
      workspaceId: input.workspaceId,
      telegramChannelId: input.channelId,
      OR: [{ text: { not: null } }, { formattedText: { not: null } }],
    },
    select: { text: true, formattedText: true },
    orderBy: { postDate: 'desc' },
    take: 30,
  });
  return telegramAiPostingLanguageName(
    detectTelegramAiPostingLanguage(recentPosts ?? []),
  );
}

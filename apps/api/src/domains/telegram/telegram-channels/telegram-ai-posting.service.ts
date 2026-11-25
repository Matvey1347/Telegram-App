import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { telegramAiPostingImageSourceUrl, telegramAiPostingImageSourceUrls, DEFAULT_TELEGRAM_AI_POSTING_SEARCH_PERCENT, TELEGRAM_AI_POSTING_MAX_MEDIA_GUIDANCE_LENGTH, TELEGRAM_AI_POSTING_MAX_MEDIA_PREFERENCES, TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import {
  detectTelegramAiPostingLanguage,
  telegramAiPostingLanguageName,
} from './telegram-ai-posting-language';
import { resolveAiPostingPreferenceIcons } from './telegram-ai-posting-preference-icons';
import { telegramAiPostingSphereWeights } from './telegram-ai-posting-analysis-configuration';
import { TelegramAiPostingContentModelService } from './telegram-ai-posting-content-model.service';

const defaults = {
  language: '',
  topic: '',
  audience: '',
  historyMode: 'all',
  historyFrom: '',
  variedLength: true,
  emojiPolicy: 'contextual',
  ending: '',
  hashtags: 'disabled',
  imageMode: 'hybrid',
  hybridSearchPercent: DEFAULT_TELEGRAM_AI_POSTING_SEARCH_PERCENT,
  useChannelAvatarInMedia: false,
  channelAvatarWatermarkSize: 12,
  channelAvatarWatermarkOpacity: 100,
};
const defaultLengths = [
  { id: 'ultra-short', name: 'Ультракороткая', emoji: '⚡', minCharacters: 0, maxCharacters: 99 },
  { id: 'short', name: 'Короткая', emoji: '📝', minCharacters: 100, maxCharacters: 299 },
  { id: 'medium', name: 'Средняя', emoji: '📖', minCharacters: 300, maxCharacters: 699 },
  { id: 'long', name: 'Длинная', emoji: '📚', minCharacters: 700, maxCharacters: null },
];


@Injectable()
export class TelegramAiPostingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly contentModel: TelegramAiPostingContentModelService,
  ) {}

  private async owned(userId: string, channelId: string) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: {
        id: true,
        title: true,
        username: true,
        language: true,
        niche: true,
        description: true,
        shortDescription: true,
        photoUrl: true,
        inviteLink: true,
        defaultInviteLink: { select: { url: true, isRevoked: true } },
        publicInviteLink: { select: { url: true, isRevoked: true } },
        presentationIcon: true,
      },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    return { workspaceId, channel };
  }

  async get(userId: string, channelId: string) {
    const { workspaceId, channel } = await this.owned(userId, channelId);
    const [saved, recentPosts] = await Promise.all([
      this.prisma.telegramAiPostingSettings.findFirst({
        where: { workspaceId, telegramChannelId: channelId },
      }),
      telegramAiPostingLanguageName(channel.language)
        ? Promise.resolve([])
        : (this.prisma.telegramPost?.findMany({
            where: {
              workspaceId,
              telegramChannelId: channelId,
              OR: [{ text: { not: null } }, { formattedText: { not: null } }],
            },
            select: { text: true, formattedText: true },
            orderBy: { postDate: 'desc' },
            take: 30,
          }) ?? Promise.resolve([])),
    ]);
    const detectedLanguage =
      (telegramAiPostingLanguageName(channel.language)
        ? channel.language
        : '') || detectTelegramAiPostingLanguage(recentPosts ?? []);
    const stored =
      (saved?.configuration as Record<string, unknown> | null) ?? {};
    const storedText = (key: string) =>
      typeof stored[key] === 'string' ? stored[key] : '';
    const topic = storedText('topic') || channel.niche || '';
    const audience = storedText('audience');
    const editorial = await this.contentModel.read(workspaceId, channelId, this.prisma);
    const mode = saved?.mode === 'REVIEW' ? 'REVIEW' : 'TEST';
    const retainedKeys = [
      'historyMode', 'historyFrom', 'variedLength', 'emojiPolicy', 'ending',
      'hashtags', 'imageMode', 'hybridSearchPercent', 'imageSearchSources',
      'mediaPreferences', 'imageAvoidances', 'useChannelAvatarInMedia',
      'channelAvatarWatermarkSize', 'channelAvatarWatermarkOpacity',
      'channelAvatarWatermarkX', 'channelAvatarWatermarkY', 'style', 'visualStyle', 'visualVariety', 'sphereWeights',
    ];
    const { defaultInviteLink, publicInviteLink, ...channelData } = channel;
    return {
      channel: {
        ...channelData,
        mainInviteLink: defaultInviteLink?.isRevoked ? null : defaultInviteLink?.url ?? null,
        publicInviteLink: publicInviteLink?.isRevoked ? null : publicInviteLink?.url ?? null,
        presentationIcon: undefined,
        presentationIconPresentation: iconToResolvedEmoji(channel.presentationIcon),
      },
      mediaPreferenceIcons: await resolveAiPostingPreferenceIcons(
        this.prisma,
        workspaceId,
        { ...stored, spheres: editorial.spheres, rubrics: editorial.rubrics },
      ),
      detectedLanguage,
      configuration: {
        ...defaults,
        ...Object.fromEntries(retainedKeys.filter((key) => Object.hasOwn(stored, key)).map((key) => [key, stored[key]])),
        audience: editorial.idea.audience || audience,
        topic: editorial.idea.valueProposition || topic,
        language: editorial.idea.language || storedText('language'),
        spheres: editorial.spheres,
        rubrics: editorial.rubrics,
        lengths: editorial.lengths.length ? editorial.lengths : defaultLengths,
      },
      mode,
      draftExpirationDays: saved?.draftExpirationDays ?? 30,
      configured: Boolean(saved),
      configurationVersion: saved?.configurationVersion ?? 1,
    };
  }

  async contentModelForChannel(userId: string, channelId: string) {
    const { workspaceId } = await this.owned(userId, channelId);
    return this.contentModel.read(workspaceId, channelId, this.prisma);
  }

  async exportSettings(userId: string, channelId: string) {
    const settings = await this.get(userId, channelId);
    const configuration = settings.configuration as Record<string, unknown>;
    return {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      channel: {
        id: settings.channel.id,
        title: settings.channel.title,
        username: settings.channel.username,
        language: settings.channel.language,
        niche: settings.channel.niche,
        description: settings.channel.description,
        shortDescription: settings.channel.shortDescription,
      },
      instruction: [
        '# Инструкция для настройки AI Posting канала Telegram',
        '',
        'Цель этой инструкции: помочь владельцу подготовить настройки AI Posting, которые система затем импортирует и применит к выбранному каналу. Внимательно прочитай запрос владельца, сопоставь его с описанными полями и текущим контекстом. Меняй настройки только в соответствии с запросом; не подменяй намерение владельца предположениями.',
        'Рабочий порядок: 1) определи, какие разделы затронуты запросом; 2) изучи текущие значения и контекст канала; 3) сохрани все нетронутые настройки; 4) обнови или добавь только нужные поля/сущности; 5) проверь типы значений, диапазоны и связи ID; 6) верни полный configuration в JSON. Импорт проверяет этот объект и сохраняет настройки для канала.',
        '',
        '## Формат ответа',
        'Верни только один валидный JSON без markdown-блоков и текста вокруг: {"schemaVersion":2,"configuration":{...}}. В configuration передай полный набор изменяемых настроек, а не только изменённые поля. Начинай с текущего configuration и сохраняй всё, о замене чего пользователь явно не просил. Не включай channel, schema и instruction в configuration.',
        '',
        '## Правила безопасного редактирования',
        '• Не удаляй и не обнуляй существующие сущности или поля без прямой просьбы. Пустой массив означает удалить все сущности этого типа, поэтому используй его только если это явно запрошено.',
        '• При изменении сущности сохраняй её id. Новым сферам, подсферам, рубрикам, длинам и предпочтениям назначай уникальные строковые id. Не используй id другой сущности.',
        '• Все ссылки должны быть согласованы: rubric.sphereId указывает на существующую сферу/подсферу или null; sphere.parentId указывает на существующую родительскую сферу или null; sphere.mediaPreferenceId указывает на существующее предпочтение или null; rubric.lengthIds содержит только существующие length.id.',
        '• Не выдумывай адреса сайтов, RSS, факты о канале, визуальные референсы или медиа-ссылки. Сохраняй URL только если он есть в контексте или предоставлен пользователем. Источники сфер можно оставить пустыми: тогда тему нужно исследовать в интернете при подготовке идеи.',
        '• Строковые поля передавай строками, переключатели — true/false, списки — массивами. Не меняй единицы измерения.',
        '',
        '## Контекст канала',
        'channel.title — название канала; channel.username — публичное имя без @ либо null; channel.description — описание Telegram; channel.shortDescription — краткая аудитория/позиционирование; channel.niche — заданная тематика; channel.language — язык метаданных. Это контекст для принятия решений, а не редактируемые поля этой конфигурации.',
        '',
        '## Идея канала',
        '• audience («Для кого этот канал») — кому адресованы публикации, что важно этой аудитории, её потребности и уровень знаний. Это описание читателя, не тема постов. Строка до 4000 символов.',
        '• topic («Что я хочу дать аудитории») — ценность канала: какую пользу, знания или эмоции должны получать читатели. Строка до 4000 символов.',
        '• language — язык публикаций: ru, en, uk, de или es. Пустая строка означает автоопределение по каналу/контексту; не подставляй язык автоматически без причины.',
        '',
        '## Как писать',
        '• historyMode — использование истории публикаций: all = учитывать всю доступную историю; since = учитывать историю начиная с historyFrom; none = не использовать историю. historyFrom обязателен при since и задаётся как YYYY-MM-DD.',
        '• variedLength — true разрешает автоматически выбирать подходящую длину; false оставляет подбор длины правилам рубрик/запроса.',
        '• emojiPolicy — start размещает эмодзи в начале текста; contextual подбирает эмодзи по смыслу.',
        '• ending — постоянная концовка публикаций, пустая строка отключает её. Поддерживается Telegram-разметка.',
        '• hashtags — disabled = без хэштегов; start = в начале; end = в конце; ending_inline = вместе с постоянной концовкой.',
        '',
        '## Медиа',
        '• imageMode — found использует найденные медиа; ai генерирует изображения; hybrid сочетает поиск и генерацию.',
        '• imageSearchSources — массив полных HTTP(S)-ссылок на сайты в порядке поиска. Сохраняй текущий список, если менять его не просили.',
        '• hybridSearchPercent — целая доля поиска от 0 до 100 (по умолчанию 70); оставшаяся доля выделяется генерации.',
        '• useChannelAvatarInMedia — true добавляет аватар канала к создаваемому медиа, если это поддерживается настройками обработки.',
        '• imageAvoidances — массив визуальных направлений/объектов, которых нужно избегать. Не добавляй желаемые стили сюда.',
        '• mediaPreferences — не более 30 предпочтений. Сохраняй id, name, emoji, emojiIconId и references существующих предпочтений без изменений. Каждый объект обязан содержать id, непустое name до 80 символов, emoji, description до 500 символов, references (массив до 8 URL, пустой массив для нового предпочтения без референсов) и purpose: SEARCH, GENERATION или BOTH. generationDescription и searchDescription — строки до 1200 символов каждая. Новое предпочтение создавай только по запросу/контексту.',
        '',
        '## Сферы и подсферы',
        '• spheres — направления содержания канала. Корневая сфера задаёт широкую тему, подсфера уточняет её и имеет parentId родителя. Сфера: id, parentId (null для основной сферы), name, emoji, tier (PRIMARY или SECONDARY), description, sources (необязательные URL, обычно сайты/RSS для этой сферы), mediaPreferenceId (id предпочтения или null).',
        '• sphereWeights: объект, ключи — ID корневых сфер, значения — относительные целые веса 0–100. Ноль исключает сферу, когда у других сфер есть положительные веса. Без заданных весов действует чередование PRIMARY и SECONDARY.',
        '• Если sources пуст, для идеи публикации выполняется самостоятельное исследование. Если источники заданы, сначала проверь их; если материал слабый или неполный, дополни исследованием, не выдумывая факты.',
        '• mediaPreferenceId закрепляет подходящее медиа-предпочтение за сферой. null означает использовать любое подходящее предпочтение.',
        '',
        '## Рубрики',
        '• rubrics задают повторяемый тип публикации. Каждый объект содержит id, sphereId (связанная сфера/подсфера или null), name, emoji, description, goal и lengthIds.',
        '• description объясняет содержание и характер рубрики. goal формулирует конкретное желаемое действие читателя после публикации (например, понять короткую новость, оставить комментарий или поставить реакцию); не дублируй description.',
        '• lengthIds ограничивает выбор допустимыми длинами. Пустой список означает, что конкретные длины не закреплены за рубрикой. Указывай только существующие id.',
        '',
        '## Длины публикаций',
        '• lengths задаёт диапазоны количества символов текста: id, name, emoji, minCharacters, maxCharacters. maxCharacters = null означает отсутствие верхней границы; границы включительные, символы считаются в тексте публикации.',
        '• Стандартные диапазоны: ultra-short 0–99, short 100–299, medium 300–699, long 700 и больше. Их можно редактировать, но сохраняй неперекрывающиеся диапазоны и связь id с рубриками. Для собственных длин используй уникальные id и не создавай случайных пересечений.',
        '',
        '## Полная схема configuration',
        JSON.stringify({
          language: 'ru | en | uk | de | es | ""', audience: 'string (до 4000)', topic: 'string (до 4000)',
          style: 'string (до 1200)', visualStyle: 'string (до 850)', visualVariety: 'boolean', sphereWeights: '{[rootSphereId]: integer 0–100}',
          historyMode: 'all | since | none', historyFrom: 'YYYY-MM-DD | ""', variedLength: 'boolean', emojiPolicy: 'start | contextual', ending: 'string', hashtags: 'disabled | start | end | ending_inline',
          imageMode: 'found | ai | hybrid', hybridSearchPercent: 'integer 0–100', imageSearchSources: 'https://website.example/ []', useChannelAvatarInMedia: 'boolean', imageAvoidances: ['string'],
          mediaPreferences: [{ id: 'string', name: 'string', emoji: 'string', emojiIconId: 'string | optional saved icon ID', description: 'string', generationDescription: 'string', searchDescription: 'string', references: ['URL'], purpose: 'SEARCH | GENERATION | BOTH' }],
          spheres: [{ id: 'string', parentId: 'string | null', name: 'string', emoji: 'string', tier: 'PRIMARY | SECONDARY', description: 'string', sources: ['URL'], mediaPreferenceId: 'string | null' }],
          rubrics: [{ id: 'string', sphereId: 'string | null', name: 'string', emoji: 'string', description: 'string', goal: 'string', lengthIds: ['length id'] }],
          lengths: [{ id: 'string', name: 'string', emoji: 'string', minCharacters: 'integer >= 0', maxCharacters: 'integer >= min | null' }],
        }, null, 2),
      ].join('\n'),
      schema: {
        channelIdea: { audience: 'string, до 4000 символов', topic: 'string, до 4000 символов', language: 'ru | en | uk | de | es | пустая строка для автоопределения' },
        writing: { historyMode: 'all | since | none', historyFrom: 'YYYY-MM-DD при since', variedLength: 'boolean', style: 'редакционная инструкция по голосу и структуре', emojiPolicy: 'start | contextual', ending: 'Telegram-разметка', hashtags: 'disabled | start | end | ending_inline' },
        media: { visualStyle: 'общая инструкция для изображений', imageMode: 'found | ai | hybrid', hybridSearchPercent: 'integer 0–100', imageSearchSources: 'https://website.example/ []', useChannelAvatarInMedia: 'boolean', imageAvoidances: 'string[]', mediaPreferences: '{id,name,emoji,emojiIconId?:string,description,generationDescription?:string,searchDescription?:string,references:string[],purpose:SEARCH|GENERATION|BOTH}[]' },
        sphereWeights: '{[rootSphereId]: integer 0–100}',
        spheres: '{id,parentId,name,emoji,tier:PRIMARY|SECONDARY,description,sources:string[],mediaPreferenceId}[]',
        rubrics: '{id,sphereId,name,emoji,description,goal,lengthIds:string[]}[]',
        lengths: '{id,name,emoji,minCharacters,maxCharacters:number|null}[]',
      },
      fieldGuide: {
        audience: 'Для кого этот канал: кому адресованы публикации и что важно этой аудитории.',
        topic: 'Что канал даёт аудитории: польза, знания или эмоции читателей.',
        language: 'Язык создаваемых публикаций; пустое значение включает автоопределение.',
        style: 'Редакционный стиль: голос, композиция, ритм и характерные форматы.',
        visualStyle: 'Общий визуальный стиль для поиска и генерации.',
        sphereWeights: 'Относительные веса корневых сфер, от 0 до 100.',
        historyMode: 'Какая история публикаций используется при подготовке новых материалов.',
        historyFrom: 'Начальная дата истории при historyMode=since, формат YYYY-MM-DD.',
        variedLength: 'Разрешает автоматический выбор длины публикации.',
        emojiPolicy: 'Правило выбора и размещения эмодзи.', ending: 'Постоянный завершающий текст публикаций.',
        hashtags: 'Включение хэштегов и их размещение.', imageMode: 'Источник изображений: поиск, генерация или гибрид.',
        useChannelAvatarInMedia: 'Добавлять ли аватар канала на создаваемое медиа.', imageAvoidances: 'Визуальные решения, которых следует избегать.',
        mediaPreferences: 'Профили визуального оформления с референсами и областью применения.',
        spheres: 'Смысловые направления и подсферы, их источники и связь с медиа предпочтением.',
        rubrics: 'Повторяемые типы публикаций: описание, целевое действие, сфера и разрешённые длины.',
        lengths: 'Диапазоны символов, определяющие длину текста публикации.',
      },
      configuration,
    };
  }

  async importSettings(userId: string, channelId: string, document: unknown) {
    if (!document || typeof document !== 'object' || Array.isArray(document))
      throw new BadRequestException('AI_POSTING_IMPORT_INVALID');
    const value = document as Record<string, unknown>;
    if (![1, 2].includes(Number(value.schemaVersion)) || !value.configuration || typeof value.configuration !== 'object' || Array.isArray(value.configuration))
      throw new BadRequestException('AI_POSTING_IMPORT_VERSION_UNSUPPORTED');
    const current = await this.get(userId, channelId);
    const imported = value.configuration as Record<string, unknown>;
    const supportedFields = new Set([
      'audience', 'topic', 'language', 'historyMode', 'historyFrom',
      'variedLength', 'emojiPolicy', 'ending', 'hashtags', 'imageMode', 'hybridSearchPercent', 'imageSearchSources',
      'mediaPreferences', 'imageAvoidances', 'useChannelAvatarInMedia',
      'spheres', 'rubrics', 'lengths', 'style', 'visualStyle', 'visualVariety', 'sphereWeights',
    ]);
    if (!Object.keys(imported).some((key) => supportedFields.has(key)))
      throw new BadRequestException('AI_POSTING_IMPORT_NO_SUPPORTED_FIELDS');
    const existing = current.configuration as Record<string, unknown>;
    const configuration = { ...existing, ...imported };
    if (Array.isArray(imported.mediaPreferences)) {
      const previous = Array.isArray(existing.mediaPreferences) ? existing.mediaPreferences : [];
      configuration.mediaPreferences = imported.mediaPreferences.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
        const preference = item as Record<string, unknown>;
        const matches = previous.filter((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
          const saved = entry as Record<string, unknown>;
          return saved.id === preference.id || (
            typeof saved.name === 'string' && typeof preference.name === 'string' &&
            saved.name.trim().toLocaleLowerCase() === preference.name.trim().toLocaleLowerCase()
          );
        });
        const saved = matches.length === 1 ? matches[0] as Record<string, unknown> : {};
        return {
          ...preference,
          emoji: preference.emoji ?? saved.emoji ?? '🎨',
          ...(preference.emojiIconId === undefined && saved.emojiIconId ? { emojiIconId: saved.emojiIconId } : {}),
          references: preference.references ?? saved.references ?? [],
        };
      });
    }
    const saved = await this.save(userId, channelId, {
      configuration,
      draftExpirationDays: current.draftExpirationDays,
    });
    const sections = [
      { id: 'idea', label: 'Идея канала', keys: ['audience', 'topic', 'language'] },
      { id: 'writing', label: 'Как писать', keys: ['historyMode', 'historyFrom', 'variedLength', 'emojiPolicy', 'ending', 'hashtags', 'style'] },
      { id: 'media', label: 'Медиа', keys: ['imageMode', 'hybridSearchPercent', 'imageSearchSources', 'mediaPreferences', 'imageAvoidances', 'useChannelAvatarInMedia', 'visualStyle', 'visualVariety'] },
      { id: 'spheres', label: 'Сферы', keys: ['spheres', 'sphereWeights'] },
      { id: 'rubrics', label: 'Рубрики', keys: ['rubrics'] },
      { id: 'lengths', label: 'Длины', keys: ['lengths'] },
    ];
    const applied = sections.map((section) => {
      const supplied = section.keys.filter((key) => Object.hasOwn(imported, key));
      const rows = imported[section.id];
      const counts = section.id === 'spheres' || section.id === 'rubrics' || section.id === 'lengths'
        ? `: ${Array.isArray(rows) ? rows.length : 0}`
        : '';
      return {
        id: section.id,
        label: section.label,
        status: supplied.length ? 'applied' : 'kept',
        suppliedFields: supplied,
        message: supplied.length
          ? `${section.label}: обновлено${counts}.`
          : `${section.label}: сохранено без изменений (в файле нет этих полей).`,
      };
    });
    return { saved, report: { applied, ignoredFields: Object.keys(imported).filter((key) => !sections.some((section) => section.keys.includes(key))) } };
  }

  async save(
    userId: string,
    channelId: string,
    input: {
      configuration: Record<string, unknown>;
      mode?: 'TEST' | 'REVIEW';
      expectedConfigurationVersion?: number;
      draftExpirationDays?: number;
    },
  ) {
    const { workspaceId } = await this.owned(userId, channelId);
    const configuration = input.configuration;
    const mode = input.mode ?? 'TEST';
    if (!['TEST', 'REVIEW'].includes(mode))
      throw new BadRequestException('AI_POSTING_MODE_INVALID');
    const draftExpirationDays = input.draftExpirationDays ?? 30;
    if (!Number.isInteger(draftExpirationDays) || draftExpirationDays < 1 || draftExpirationDays > 365)
      throw new BadRequestException('AI_POSTING_DRAFT_EXPIRATION_INVALID');
    if (!['all', 'since', 'none'].includes(String(configuration.historyMode)))
      throw new BadRequestException('AI_POSTING_HISTORY_MODE_INVALID');
    if (configuration.historyMode === 'since' && (typeof configuration.historyFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(configuration.historyFrom)))
      throw new BadRequestException('AI_POSTING_HISTORY_DATE_INVALID');
    if (!['disabled', 'start', 'end', 'ending_inline'].includes(String(configuration.hashtags)))
      throw new BadRequestException('AI_POSTING_HASHTAGS_INVALID');
    if (!['found', 'ai', 'hybrid'].includes(String(configuration.imageMode)))
      throw new BadRequestException('AI_POSTING_IMAGE_MODE_INVALID');
    const imageSearchSources = configuration.imageSearchSources ?? [];
    if (!Array.isArray(imageSearchSources) || imageSearchSources.length > 12 ||
        imageSearchSources.some((source) => source !== 'wordpress-photos' && !telegramAiPostingImageSourceUrl(source)))
      throw new BadRequestException('AI_POSTING_IMAGE_SOURCES_INVALID');
    const hybridSearchPercent = configuration.hybridSearchPercent ?? DEFAULT_TELEGRAM_AI_POSTING_SEARCH_PERCENT;
    if (typeof hybridSearchPercent !== 'number' || !Number.isInteger(hybridSearchPercent) || hybridSearchPercent < 0 || hybridSearchPercent > 100)
      throw new BadRequestException('AI_POSTING_SEARCH_PERCENT_INVALID');
    if (configuration.useChannelAvatarInMedia !== undefined && typeof configuration.useChannelAvatarInMedia !== 'boolean')
      throw new BadRequestException('AI_POSTING_AVATAR_OPTION_INVALID');
    const watermarkSize = configuration.channelAvatarWatermarkSize;
    const watermarkOpacity = configuration.channelAvatarWatermarkOpacity;
    if ((watermarkSize !== undefined && (!Number.isInteger(watermarkSize) || Number(watermarkSize) < 5 || Number(watermarkSize) > 30)) ||
      (watermarkOpacity !== undefined && (!Number.isInteger(watermarkOpacity) || Number(watermarkOpacity) < 10 || Number(watermarkOpacity) > 100)))
      throw new BadRequestException('AI_POSTING_AVATAR_OPTION_INVALID');
    if (configuration.mediaPreferences !== undefined && (!Array.isArray(configuration.mediaPreferences) || configuration.mediaPreferences.length > TELEGRAM_AI_POSTING_MAX_MEDIA_PREFERENCES || configuration.mediaPreferences.some((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
      const preference = value as Record<string, unknown>;
      if ([preference.generationDescription, preference.searchDescription].some(
        (value) => value !== undefined && (typeof value !== 'string' || value.length > TELEGRAM_AI_POSTING_MAX_MEDIA_GUIDANCE_LENGTH),
      )) return true;
      return typeof preference.id !== 'string' || preference.id.length > 100 || typeof preference.name !== 'string' || !preference.name.trim() || preference.name.length > 80 || typeof preference.description !== 'string' || preference.description.length > 500 || typeof preference.emoji !== 'string' || preference.emoji.length > 32 || (preference.emojiIconId !== undefined && (typeof preference.emojiIconId !== 'string' || preference.emojiIconId.length > 128)) || (preference.purpose !== undefined && !['SEARCH', 'GENERATION', 'BOTH'].includes(String(preference.purpose))) || !Array.isArray(preference.references) || preference.references.length > TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES || preference.references.some((url) => {
        if (typeof url !== 'string' || url.length > 2000) return true;
        try { const parsed = new URL(url); return !['http:', 'https:'].includes(parsed.protocol) || Boolean(parsed.username || parsed.password); }
        catch { return true; }
      });
    }))) throw new BadRequestException('AI_POSTING_MEDIA_PREFERENCES_INVALID');
    const configurationToSave = {
      language: typeof configuration.language === 'string' ? configuration.language.slice(0, 32) : '',
      style: typeof configuration.style === 'string' ? configuration.style.trim().slice(0, 1200) : '',
      visualVariety: configuration.visualVariety === true,
      visualStyle: typeof configuration.visualStyle === 'string' ? configuration.visualStyle.trim().slice(0, 850) : '',
      sphereWeights: telegramAiPostingSphereWeights(configuration.sphereWeights, configuration.spheres),
      audience: typeof configuration.audience === 'string' ? configuration.audience.slice(0, 4000) : '',
      topic: typeof configuration.topic === 'string' ? configuration.topic.slice(0, 4000) : '',
      historyMode: configuration.historyMode,
      historyFrom: typeof configuration.historyFrom === 'string' ? configuration.historyFrom : '',
      variedLength: configuration.variedLength !== false,
      emojiPolicy: configuration.emojiPolicy === 'start' ? 'start' : 'contextual',
      ending: typeof configuration.ending === 'string' ? configuration.ending.slice(0, 4000) : '',
      hashtags: configuration.hashtags,
      imageMode: configuration.imageMode,
      hybridSearchPercent,
      imageSearchSources: telegramAiPostingImageSourceUrls(imageSearchSources),
      mediaPreferences: Array.isArray(configuration.mediaPreferences) ? configuration.mediaPreferences.map((value) => {
        const preference = value as Record<string, unknown>;
        return {
          id: preference.id,
          name: preference.name,
          emoji: preference.emoji,
          emojiIconId: typeof preference.emojiIconId === 'string' ? preference.emojiIconId : undefined,
          description: preference.description,
          generationDescription: typeof preference.generationDescription === 'string' ? preference.generationDescription.trim() : undefined,
          searchDescription: typeof preference.searchDescription === 'string' ? preference.searchDescription.trim() : undefined,
          references: preference.references,
          purpose: preference.purpose ?? 'BOTH',
        };
      }) : [],
      imageAvoidances: Array.isArray(configuration.imageAvoidances) ? configuration.imageAvoidances.filter((item): item is string => typeof item === 'string').slice(0, 100) : [],
      useChannelAvatarInMedia: configuration.useChannelAvatarInMedia === true,
      channelAvatarWatermarkX: normalizeWatermarkPosition(configuration.channelAvatarWatermarkX),
      channelAvatarWatermarkY: normalizeWatermarkPosition(configuration.channelAvatarWatermarkY),
      channelAvatarWatermarkSize: Math.min(30, Math.max(5, Number(configuration.channelAvatarWatermarkSize) || 12)),
      channelAvatarWatermarkOpacity: Math.min(100, Math.max(10, Number(configuration.channelAvatarWatermarkOpacity) || 100)),
      spheres: Array.isArray(configuration.spheres) ? configuration.spheres : [],
      rubrics: Array.isArray(configuration.rubrics) ? configuration.rubrics : [],
      lengths: Array.isArray(configuration.lengths) ? configuration.lengths.map((value) => {
        const length = value as Record<string, unknown>;
        return {
          id: length.id,
          name: length.name,
          emoji: length.emoji,
          minCharacters: length.minCharacters,
          maxCharacters: length.maxCharacters ?? null,
        };
      }) : [],
    };
    const saved = await this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(tx, `ai-posting-structure:${workspaceId}:${channelId}`);
      if (input.expectedConfigurationVersion !== undefined) {
        const [current] = await tx.$queryRaw<Array<{ configurationVersion: number }>>`
          select "configurationVersion" from "TelegramAiPostingSettings"
          where "workspaceId" = ${workspaceId} and "telegramChannelId" = ${channelId}
          for update`;
        if ((current?.configurationVersion ?? 1) !== input.expectedConfigurationVersion)
          throw new ConflictException('AI_POSTING_SETTINGS_CHANGED');
      }
      const result = await tx.telegramAiPostingSettings.upsert({
        where: { telegramChannelId: channelId },
        create: { workspaceId, telegramChannelId: channelId, configuration: configurationToSave as Prisma.InputJsonObject, mode, draftExpirationDays },
        update: { configuration: configurationToSave as Prisma.InputJsonObject, configurationVersion: { increment: 1 }, ...(input.mode === undefined ? {} : { mode }), ...(input.draftExpirationDays === undefined ? {} : { draftExpirationDays }) },
        select: { configuration: true, configurationVersion: true, mode: true, draftExpirationDays: true, updatedAt: true },
      });
      await this.contentModel.replace(tx, workspaceId, channelId, configurationToSave);
      return result;
    });
    return saved;
  }
}

function normalizeWatermarkPosition(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : 100;
}

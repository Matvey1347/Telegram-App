import type {
  CrmAutomationLocale,
  CrmCustomerAutomationType,
} from '@telegram-system/shared';

export const CRM_AUTOMATION_TEMPLATE_KEYS = {
  PRE_PUBLICATION_SINGLE: 'crm.automation.prePublication.singleTime',
  PRE_PUBLICATION_MULTI: 'crm.automation.prePublication.multiTime',
  PUBLISHED_COMPLETE: 'crm.automation.publishedLinks.complete',
  FOLLOW_UP: 'crm.automation.followUp.configured',
} as const;

export type CrmAutomationPlacementTemplateInput = {
  channelTitle: string;
  scheduledAt: Date;
  timezone: string;
  url?: string;
};

type RenderInput = {
  automationType: CrmCustomerAutomationType;
  locale: CrmAutomationLocale;
  contactName: string;
  dealTitle: string;
  placements?: CrmAutomationPlacementTemplateInput[];
};

const COPY = {
  en: {
    greeting: (name: string) => `Hello, ${name}.`,
    single: 'Your advertising placement is scheduled for:',
    multi: 'Your advertising placements are scheduled for:',
    published: 'All advertising placements are live:',
    followUp: (title: string) => `Following up about “${title}”.`,
  },
  ru: {
    greeting: (name: string) => `Здравствуйте, ${name}.`,
    single: 'Ваша рекламная публикация запланирована:',
    multi: 'Ваши рекламные публикации запланированы:',
    published: 'Все рекламные публикации вышли:',
    followUp: (title: string) => `Возвращаемся к вопросу «${title}».`,
  },
  uk: {
    greeting: (name: string) => `Вітаємо, ${name}.`,
    single: 'Ваша рекламна публікація запланована:',
    multi: 'Ваші рекламні публікації заплановані:',
    published: 'Усі рекламні публікації вийшли:',
    followUp: (title: string) => `Повертаємося до питання «${title}».`,
  },
} satisfies Record<CrmAutomationLocale, unknown>;

export function renderCrmAutomationTemplate(input: RenderInput): {
  templateKey: string;
  locale: CrmAutomationLocale;
  text: string;
} | null {
  const locale = COPY[input.locale] ? input.locale : 'en';
  const copy = COPY[locale];
  if (input.automationType === 'FOLLOW_UP') {
    return {
      templateKey: CRM_AUTOMATION_TEMPLATE_KEYS.FOLLOW_UP,
      locale,
      text: `${copy.greeting(input.contactName)}\n\n${copy.followUp(input.dealTitle)}`,
    };
  }
  const placements = [...(input.placements ?? [])].sort(
    (left, right) =>
      left.scheduledAt.getTime() - right.scheduledAt.getTime() ||
      left.channelTitle.localeCompare(right.channelTitle),
  );
  if (!placements.length) return null;
  if (
    input.automationType === 'PUBLISHED_LINKS' &&
    placements.some((item) => !item.url)
  ) {
    return null;
  }
  const distinctTimes = new Set(
    placements.map(
      (item) => `${item.scheduledAt.toISOString()}\0${item.timezone}`,
    ),
  );
  const multi = distinctTimes.size > 1;
  const templateKey =
    input.automationType === 'PUBLISHED_LINKS'
      ? CRM_AUTOMATION_TEMPLATE_KEYS.PUBLISHED_COMPLETE
      : multi
        ? CRM_AUTOMATION_TEMPLATE_KEYS.PRE_PUBLICATION_MULTI
        : CRM_AUTOMATION_TEMPLATE_KEYS.PRE_PUBLICATION_SINGLE;
  const heading =
    input.automationType === 'PUBLISHED_LINKS'
      ? copy.published
      : multi
        ? copy.multi
        : copy.single;
  const lines = placements.map((item) => {
    const time = formatInTimezone(item.scheduledAt, item.timezone, locale);
    return `• ${item.channelTitle} — ${time} (${item.timezone})${item.url ? ` — ${item.url}` : ''}`;
  });
  return {
    templateKey,
    locale,
    text: `${copy.greeting(input.contactName)}\n\n${heading}\n${lines.join('\n')}`,
  };
}

function formatInTimezone(
  value: Date,
  timezone: string,
  locale: CrmAutomationLocale,
) {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
      hourCycle: 'h23',
    }).format(value);
  } catch {
    return value.toISOString();
  }
}

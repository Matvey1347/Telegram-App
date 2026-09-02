import { translateBackend } from '../../../../common/i18n/backend-translator';

const catalog = {
  en: {
    workspaceName: "{name}'s Workspace",
    resetSubject: 'Reset your Telegram System password',
    resetIntro: 'Reset your password using the link below.',
    resetAction: 'Reset password',
    resetExpiry: 'This link expires in 60 minutes and can be used once.',
  },
  ru: {
    workspaceName: 'Рабочее пространство {name}',
    resetSubject: 'Сброс пароля Telegram System',
    resetIntro: 'Чтобы сбросить пароль, перейдите по ссылке ниже.',
    resetAction: 'Сбросить пароль',
    resetExpiry:
      'Ссылка действует 60 минут и может быть использована только один раз.',
  },
} as const;

export type AuthOutputKey = keyof (typeof catalog)['en'];

export function translateAuthOutput(
  locale: string | null | undefined,
  key: AuthOutputKey,
  params: Record<string, string | number> = {},
) {
  return translateBackend(catalog, locale, key, params);
}

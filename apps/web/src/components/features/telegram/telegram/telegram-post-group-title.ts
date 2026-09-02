import { TELEGRAM_POST_GROUP_SYSTEM_TITLE_KEYS } from "@telegram-system/shared";
import type { TranslationKey } from "@/i18n/catalog";

export function telegramPostGroupTitle(
  group: { title: string; systemKey?: string | null },
  translate: (key: TranslationKey) => string,
) {
  const key =
    TELEGRAM_POST_GROUP_SYSTEM_TITLE_KEYS[
      group.systemKey as keyof typeof TELEGRAM_POST_GROUP_SYSTEM_TITLE_KEYS
    ];
  return key ? translate(key) : group.title;
}

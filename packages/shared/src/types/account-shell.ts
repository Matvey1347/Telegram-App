import type { AppLocale } from "../i18n/locales";
import type { ResolvedEmoji } from "./resolved-emoji";

/** Compact identity data rendered by the persistent application shell. */
export type AccountShell = {
  id: string;
  workspaceMemberId: string;
  email: string;
  name: string;
  locale: AppLocale;
  avatarPresentation: ResolvedEmoji | null;
};

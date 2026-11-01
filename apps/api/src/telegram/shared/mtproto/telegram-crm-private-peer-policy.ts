import { Api } from 'telegram';
import type { TelegramCrmMtprotoUpdate } from './telegram-crm-mtproto.types';

const TELEGRAM_SERVICE_USER_ID = '777000';
const EXCLUDED_USER_CACHE_LIMIT = 1024;

/** A missing access hash is incomplete information, not proof of ineligibility. */
export function isCrmExcludedTelegramUser(user: Api.User) {
  return (
    user.id.toString() === TELEGRAM_SERVICE_USER_ID ||
    Boolean(user.bot || user.self || user.deleted || user.support)
  );
}

/** Per-handle bounded metadata cache; no lookups, timers or persistence. */
export function rememberCrmExcludedTelegramUsers(
  users: Api.TypeUser[],
  excluded: Set<string>,
) {
  const currentFrame = new Set<string>();
  for (const user of users) {
    if (!(user instanceof Api.User)) continue;
    const id = user.id.toString();
    if (isCrmExcludedTelegramUser(user)) {
      currentFrame.add(id);
      excluded.delete(id);
      excluded.add(id);
    } else if (user.accessHash != null) excluded.delete(id);
    while (excluded.size > EXCLUDED_USER_CACHE_LIMIT) {
      const oldest = excluded.values().next();
      if (oldest.done) break;
      excluded.delete(oldest.value);
    }
  }
  return new Set([...excluded, ...currentFrame]);
}

/** Keep unknown legitimate peers for canonical resolution, and keep global delete/gap events. */
export function filterCrmPrivatePeerUpdates(
  updates: TelegramCrmMtprotoUpdate[],
  excluded: ReadonlySet<string>,
) {
  return updates
    .map((update) =>
      update.type === 'folders.changed' && update.telegramUserIds
        ? {
            ...update,
            telegramUserIds: update.telegramUserIds.filter(
              (id) => id !== TELEGRAM_SERVICE_USER_ID && !excluded.has(id),
            ),
          }
        : update,
    )
    .filter((update) => {
      const id =
        update.type === 'message.new' || update.type === 'message.edited'
          ? update.message.telegramUserId
          : 'telegramUserId' in update
            ? update.telegramUserId
            : null;
      return !id || (id !== TELEGRAM_SERVICE_USER_ID && !excluded.has(id));
    });
}

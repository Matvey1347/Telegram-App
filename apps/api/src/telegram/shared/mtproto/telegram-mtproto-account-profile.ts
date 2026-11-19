import type { TelegramAccountCapabilities } from '@telegram-system/shared';

export type TelegramAccountProfile = {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  nameColor: number | null;
  capabilities: TelegramAccountCapabilities;
};

export function telegramPublicPhotoUrl(username: string | null) {
  return username ? `https://t.me/i/userpic/320/${username}.jpg` : null;
}

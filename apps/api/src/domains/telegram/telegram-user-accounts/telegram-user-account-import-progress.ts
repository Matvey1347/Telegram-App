import type {
  BulkActionResultItem,
  TelegramChannelSyncProgressItem,
} from '@telegram-system/shared';
import type { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';

export type TelegramUserAccountProgressCallback = (
  item: TelegramChannelSyncProgressItem,
  current: number,
  total: number,
) => void | Promise<void>;

export type ImportedTelegramUserAccountChannel = {
  channelId: string;
  workspaceChannelId: string;
  title: string;
  username: string | null;
  role: ReturnType<
    TelegramSourceAccessService['normalizeMtprotoPermissions']
  >['role'];
  permissions: ReturnType<
    TelegramSourceAccessService['normalizeMtprotoPermissions']
  >['permissions'];
  canBeUsedForAnalytics: boolean;
};

const UNITS_PER_CHANNEL = 100;
const SETUP_UNITS = 10;

export function channelImportProgress(params: {
  onProgress?: TelegramUserAccountProgressCallback;
  channelIndex: number;
  channelCount: number;
}) {
  const total = params.channelCount * UNITS_PER_CHANNEL;
  const start = params.channelIndex * UNITS_PER_CHANNEL;
  const emit = async (message: string, current: number) => {
    await params.onProgress?.({ phase: 'sync_step', message }, current, total);
  };

  return {
    total,
    preparing: () => emit('Preparing selected Telegram channels', 0),
    adding: (title: string) =>
      emit(`Adding ${title} to workspace`, start + SETUP_UNITS / 2),
    syncing: (title: string) =>
      emit(`Importing data for ${title}`, start + SETUP_UNITS),
    completed: (title: string) =>
      emit(`${title}: synchronization completed`, start + UNITS_PER_CHANNEL),
    forward:
      (title: string) =>
      async (
        item: BulkActionResultItem | TelegramChannelSyncProgressItem,
        current: number,
        nestedTotal: number,
      ) => {
        if (!params.onProgress) return;
        const syncItem: TelegramChannelSyncProgressItem =
          'phase' in item
            ? item
            : {
                phase: 'sync_step',
                message: item.message || 'Synchronizing channel data',
              };
        const nestedRatio = nestedTotal > 0 ? current / nestedTotal : 0;
        const mappedCurrent =
          start +
          SETUP_UNITS +
          Math.round((UNITS_PER_CHANNEL - SETUP_UNITS) * nestedRatio);
        await params.onProgress(
          { ...syncItem, message: `${title}: ${syncItem.message}` },
          Math.min(start + UNITS_PER_CHANNEL, mappedCurrent),
          total,
        );
      },
  };
}

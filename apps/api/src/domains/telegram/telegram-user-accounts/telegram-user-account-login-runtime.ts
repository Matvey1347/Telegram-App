import { TelegramAccountRuntimeNotifier } from '../../../common/telegram-account-runtime-notifier.service';

/**
 * Starts live CRM updates only after the login flow has released its temporary
 * MTProto connection used for the initial channel sync.
 */
export async function syncDialogsThenWakeTelegramRuntime<T>(
  workspaceId: string,
  accountId: string,
  sync: () => Promise<T>,
  notifier: TelegramAccountRuntimeNotifier,
) {
  try {
    return await sync();
  } finally {
    notifier.wake({
      workspaceId,
      accountId,
      reason: 'login',
    });
  }
}

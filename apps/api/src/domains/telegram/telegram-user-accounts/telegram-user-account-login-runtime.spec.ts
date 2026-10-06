import { syncDialogsThenWakeTelegramRuntime } from './telegram-user-account-login-runtime';

describe('syncDialogsThenWakeTelegramRuntime', () => {
  it('opens the CRM runtime only after initial channel sync settles', async () => {
    const wake = jest.fn();
    const result = await syncDialogsThenWakeTelegramRuntime(
      'workspace-1',
      'account-1',
      jest.fn().mockResolvedValue({ success: true }),
      { wake } as never,
    );

    expect(result).toEqual({ success: true });
    expect(wake).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      accountId: 'account-1',
      reason: 'login',
    });
  });

  it('still wakes CRM after a handled login-sync failure', async () => {
    const wake = jest.fn();
    await expect(
      syncDialogsThenWakeTelegramRuntime(
        'workspace-1',
        'account-1',
        jest.fn().mockRejectedValue(new Error('sync failed')),
        { wake } as never,
      ),
    ).rejects.toThrow('sync failed');

    expect(wake).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceApi } from './workspace-api';

describe('workspace auth api', () => {
  it('posts forgot and reset password payloads to the auth contract', async () => {
    const post = vi.fn().mockResolvedValue({ data: { success: true } });
    const client = createWorkspaceApi({ api: { post } as never, crud: vi.fn() as never, silentFeedbackConfig: {}, withFeedback: (config) => config });
    await client.authApi.forgotPassword('user@example.com');
    await client.authApi.resetPassword('reset-token', 'new-password');
    expect(post).toHaveBeenNthCalledWith(1, '/auth/forgot-password', { email: 'user@example.com' });
    expect(post).toHaveBeenNthCalledWith(2, '/auth/reset-password', { token: 'reset-token', password: 'new-password' });
  });

  it('persists locale silently without global loading or success feedback', async () => {
    const patch = vi.fn().mockResolvedValue({ data: { locale: 'ru' } });
    const silentFeedbackConfig = { feedback: { mode: 'silent' } } as never;
    const client = createWorkspaceApi({
      api: { patch } as never,
      crud: vi.fn() as never,
      silentFeedbackConfig,
      withFeedback: (config) => config,
    });

    await client.accountApi.updateLocale('ru');

    expect(patch).toHaveBeenCalledWith(
      '/account/locale',
      { locale: 'ru' },
      silentFeedbackConfig,
    );
  });
});

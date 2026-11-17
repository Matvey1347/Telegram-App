import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { TestI18nProvider } from '@/test/render-with-i18n';
import { RescheduleChannelPostsButton } from './reschedule-channel-posts-button';
const mocks = vi.hoisted(() => ({ plan: vi.fn(), execute: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/api', () => ({ telegramChannelsApi: { listChannelRescheduleCandidates: mocks.plan, rescheduleChannelScheduledPosts: mocks.execute } }));
vi.mock('@/providers/toast-provider', () => ({ useAppToast: () => ({ pushToast: mocks.toast }) }));
vi.mock('./managed-post-cache', () => ({ invalidateManagedPostScheduleReads: vi.fn() }));

describe('reschedule results', () => {
  it('keeps the modal and precise per-post errors visible and retries failed IDs', async () => {
    mocks.plan.mockResolvedValue({ postIds: ['failed-post'] });
    mocks.execute.mockResolvedValue({ rescheduledCount: 0, returnedToDraftCount: 0, alreadyPublishedCount: 0, locallyScheduledCount: 0, failedCount: 1, failedPostIds: ['failed-post'], results: [{ postId: 'failed-post', title: 'News post', stage: 'FAILED', message: 'Original account cannot cancel this schedule' }] });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><TestI18nProvider><RescheduleChannelPostsButton channelId="channel-1" channelTitle="News" /></TestI18nProvider></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button'));
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(screen.getByText(/Original account cannot cancel/)).toBeVisible());
    expect(screen.getByText('News post')).toBeVisible();
    const retry = screen.getAllByRole('button').at(-1)!;
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2));
    expect(mocks.plan).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.calls[1][1]).toEqual(['failed-post']);
  });
});

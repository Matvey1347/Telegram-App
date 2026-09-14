import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TelegramContentHypothesesService } from './telegram-content-hypotheses.service';

describe('TelegramContentHypothesesService', () => {
  const tx: any = { telegramManagedPostContentHypothesis: { deleteMany: jest.fn(), createMany: jest.fn() } };
  const prisma: any = {
    telegramChannel: { findFirst: jest.fn() },
    telegramManagedPost: { findFirst: jest.fn() },
    telegramContentHypothesis: { count: jest.fn() },
    $transaction: jest.fn((callback) => callback(tx)),
  };
  const workspace: any = { resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1') };
  const service = new TelegramContentHypothesesService(prisma, workspace);

  beforeEach(() => { jest.clearAllMocks(); prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'channel-1' }); });

  it('does not attach a hypothesis from another channel or workspace', async () => {
    prisma.telegramManagedPost.findFirst.mockResolvedValue({ id: 'post-1' });
    prisma.telegramContentHypothesis.count.mockResolvedValue(0);
    await expect(service.setPostHypotheses('user-1', 'channel-1', 'post-1', { hypothesisIds: ['foreign'] })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.telegramManagedPostContentHypothesis.deleteMany).not.toHaveBeenCalled();
  });

  it('returns not found when the managed post is outside the channel scope', async () => {
    prisma.telegramManagedPost.findFirst.mockResolvedValue(null);
    await expect(service.setPostHypotheses('user-1', 'channel-1', 'post-1', { hypothesisIds: [] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('atomically replaces post hypotheses', async () => {
    prisma.telegramManagedPost.findFirst.mockResolvedValue({ id: 'post-1' });
    prisma.telegramContentHypothesis.count.mockResolvedValue(2);
    await expect(service.setPostHypotheses('user-1', 'channel-1', 'post-1', { hypothesisIds: ['h1', 'h2'] })).resolves.toEqual({ postId: 'post-1', hypothesisIds: ['h1', 'h2'] });
    expect(tx.telegramManagedPostContentHypothesis.deleteMany).toHaveBeenCalledWith({ where: { managedPostId: 'post-1' } });
    expect(tx.telegramManagedPostContentHypothesis.createMany).toHaveBeenCalledTimes(1);
  });
});

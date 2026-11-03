import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TelegramCrmInboxConversationsService } from './telegram-crm-inbox-conversations.service';

describe('Unread exclusions', () => {
  const setup = (own = false) => {
    const prisma = { telegramCrmConversation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findFirst: jest.fn().mockResolvedValue(null) } };
    const auth = { require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-a' }), scope: jest.fn().mockResolvedValue(own ? { assignedMemberId: 'member-a' } : {}) };
    return { prisma, auth, service: new TelegramCrmInboxConversationsService(prisma as never, auth as never) };
  };
  it('stores and reverses the exclusion only in the authorized workspace and owner scope', async () => {
    const { service, prisma } = setup(true);
    await expect(service.setIgnoreInUnread('user', 'dialog', true)).resolves.toEqual({ id: 'dialog', ignoreInUnread: true });
    expect(prisma.telegramCrmConversation.updateMany).toHaveBeenCalledWith({ where: { id: 'dialog', workspaceId: 'workspace-a', contact: { ownerMemberId: 'member-a' }, ignoreInUnread: { not: true } }, data: { ignoreInUnread: true } });
    await service.setIgnoreInUnread('user', 'dialog', false);
    expect(prisma.telegramCrmConversation.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { ignoreInUnread: false } }));
  });
  it('rejects a viewer without edit permission before writing', async () => {
    const { service, prisma, auth } = setup();
    auth.scope.mockResolvedValueOnce({}).mockRejectedValueOnce(new ForbiddenException());
    await expect(service.setIgnoreInUnread('viewer', 'dialog', true)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.telegramCrmConversation.updateMany).not.toHaveBeenCalled();
    expect(auth.scope).toHaveBeenLastCalledWith('viewer', 'adSales.crm.editOwn', 'adSales.crm.editAny');
  });
  it('rejects an inaccessible conversation without leaking its presence', async () => {
    const { service, prisma } = setup(true);
    prisma.telegramCrmConversation.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.setIgnoreInUnread('user', 'foreign', true)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.telegramCrmConversation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'workspace-a', contact: { ownerMemberId: 'member-a' } }) }));
  });
  it('accepts repeated identical requests without rewriting', async () => {
    const { service, prisma } = setup();
    prisma.telegramCrmConversation.updateMany.mockResolvedValue({ count: 0 });
    prisma.telegramCrmConversation.findFirst.mockResolvedValue({ id: 'dialog' } as never);
    await expect(service.setIgnoreInUnread('user', 'dialog', true)).resolves.toEqual({ id: 'dialog', ignoreInUnread: true });
  });
});

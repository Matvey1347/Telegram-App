const containing = (value: Record<string, unknown>): unknown =>
  expect.objectContaining(value);
import { ForbiddenException } from '@nestjs/common';
import { TelegramCrmChatAccess } from './telegram-crm-chat-access.service';
const row = {
  id: 'conversation',
  workspaceId: 'workspace',
  mtprotoAccountId: 'account',
  telegramAccessHash: '123',
  contact: { ownerMemberId: 'owner', manualSalesStatus: null },
  peer: { telegramUserId: '42', username: null },
};
function setup() {
  const prisma = {
    telegramCrmConversation: { findFirst: jest.fn().mockResolvedValue(row) },
  };
  const authorization = {
    refresh: jest.fn().mockResolvedValue({}),
    require: jest
      .fn()
      .mockResolvedValue({ workspaceId: 'workspace', memberId: 'member' }),
    requireOwnOrAny: jest.fn().mockResolvedValue({}),
  };
  const runtime = {
    withAccountHandle: jest.fn(
      (_w: string, _a: string, _p: string, fn: (h: unknown) => unknown) =>
        fn({}),
    ),
  };
  return {
    prisma,
    authorization,
    runtime,
    service: new TelegramCrmChatAccess(
      prisma as never,
      authorization as never,
      runtime as never,
    ),
  };
}
describe('TelegramCrmChatAccess', () => {
  it('queries workspace and enforces view/edit ownership for mutation', async () => {
    const x = setup();
    await x.service.conversation('user', 'conversation', true);
    expect(x.prisma.telegramCrmConversation.findFirst).toHaveBeenCalledWith(
      containing({
        where: { id: 'conversation', workspaceId: 'workspace' },
      }),
    );
    expect(x.authorization.requireOwnOrAny).toHaveBeenCalledWith(
      'user',
      { assignedMemberId: 'owner' },
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    expect(x.authorization.requireOwnOrAny).toHaveBeenCalledWith(
      'user',
      { assignedMemberId: 'owner' },
      'adSales.crm.editOwn',
      'adSales.crm.editAny',
    );
  });
  it('rejects DNC before runtime handle', async () => {
    const x = setup();
    x.prisma.telegramCrmConversation.findFirst.mockResolvedValue({
      ...row,
      contact: { ownerMemberId: 'owner', manualSalesStatus: 'DO_NOT_CONTACT' },
    });
    await expect(
      x.service.withHandle('user', 'conversation', true, true, jest.fn()),
    ).rejects.toThrow(ForbiddenException);
    expect(x.runtime.withAccountHandle).not.toHaveBeenCalled();
  });
  it('rechecks ownership/DNC after runtime acquisition', async () => {
    const x = setup();
    x.prisma.telegramCrmConversation.findFirst
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({
        ...row,
        contact: {
          ownerMemberId: 'owner',
          manualSalesStatus: 'DO_NOT_CONTACT',
        },
      });
    const callback = jest.fn();
    await expect(
      x.service.withHandle('user', 'conversation', true, true, callback),
    ).rejects.toThrow(ForbiddenException);
    expect(callback).not.toHaveBeenCalled();
  });
  it('does not let foreign conversation reach transport', async () => {
    const x = setup();
    x.prisma.telegramCrmConversation.findFirst.mockResolvedValue(null);
    await expect(x.service.conversation('user', 'foreign')).rejects.toThrow(
      'NOT_FOUND',
    );
    expect(x.runtime.withAccountHandle).not.toHaveBeenCalled();
  });
});

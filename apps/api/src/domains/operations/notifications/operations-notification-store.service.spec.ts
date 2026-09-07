import { BadRequestException } from '@nestjs/common';
import {
  OperationsNotificationPriority,
  OperationsNotificationType,
} from '@prisma/client';
import { OperationsNotificationStoreService } from './operations-notification-store.service';

describe('OperationsNotificationStoreService', () => {
  const input = {
    workspaceId: 'workspace-1',
    recipientMemberId: 'member-1',
    type: OperationsNotificationType.CRM_MESSAGE_RECEIVED,
    priority: OperationsNotificationPriority.NORMAL,
    sourceKey: 'message:1',
    copyKey: 'crm.notification.messageReceived',
    title: 'Message',
    body: 'Preview',
    metadata: {},
    targetUrl: '/ad-sales/inbox?workspaceId=workspace-1',
  };

  it('uses a concurrent-safe returning insert with the unique source key', async () => {
    const createManyAndReturn = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'notification-1' }])
      .mockResolvedValueOnce([]);
    const service = new OperationsNotificationStoreService();
    const tx = { operationsNotification: { createManyAndReturn } };

    await expect(service.insertMany(tx as never, [input])).resolves.toEqual([
      { id: 'notification-1' },
    ]);
    await expect(service.insertMany(tx as never, [input])).resolves.toEqual([]);
    expect(createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('rejects an external stored target', async () => {
    const service = new OperationsNotificationStoreService();
    await expect(
      service.insertMany({} as never, [
        { ...input, targetUrl: 'https://evil.example/steal' },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reactivates one stable grouped notification instead of appending rows', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ id: 'notification-1' }]);
    const service = new OperationsNotificationStoreService();

    await expect(
      service.upsertMany({ $queryRaw: queryRaw } as never, [
        { ...input, sourceKey: 'conversation:conversation-1' },
      ]),
    ).resolves.toEqual([{ id: 'notification-1' }]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('upserts many grouped conversations in one database statement', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValue([{ id: 'notification-1' }, { id: 'notification-2' }]);
    const service = new OperationsNotificationStoreService();

    await expect(
      service.upsertMany({ $queryRaw: queryRaw } as never, [
        { ...input, sourceKey: 'conversation:conversation-1' },
        { ...input, sourceKey: 'conversation:conversation-2' },
      ]),
    ).resolves.toHaveLength(2);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('revokes published previews and transfers only pending rows on resource reassignment', async () => {
    const operationsNotification = {
      findMany: jest
        .fn()
        .mockResolvedValue([{ recipientMemberId: 'member-old' }]),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    };
    const service = new OperationsNotificationStoreService();

    await expect(
      service.reassignVisibility({ operationsNotification } as never, {
        workspaceId: 'workspace-1',
        visibilityResourceKey: 'crm-contact:contact-1',
        recipientMemberId: 'member-new',
        visibilityMemberId: 'member-new',
      }),
    ).resolves.toEqual(['member-old']);

    const deleteInput = (
      operationsNotification.deleteMany.mock.calls as unknown[][]
    )[0]?.[0] as { where: { publishedAt: unknown } };
    const updateInput = (
      operationsNotification.updateMany.mock.calls as unknown[][]
    )[0]?.[0] as {
      where: { publishedAt: unknown };
      data: {
        recipientMemberId: 'member-new';
        visibilityMemberId: 'member-new';
      };
    };
    expect(deleteInput.where.publishedAt).toEqual({ not: null });
    expect(updateInput.where.publishedAt).toBeNull();
    expect(updateInput.data).toEqual({
      recipientMemberId: 'member-new',
      visibilityMemberId: 'member-new',
    });
  });
});

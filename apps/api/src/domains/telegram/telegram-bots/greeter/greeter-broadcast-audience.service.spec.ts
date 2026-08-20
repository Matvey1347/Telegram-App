import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  GreeterBroadcastAudience,
  GreeterJoinRequestStatus,
  GreeterUserState,
} from '@prisma/client';
import { GreeterBroadcastAudienceService } from './greeter-broadcast-audience.service';

describe('GreeterBroadcastAudienceService', () => {
  it('uses the same exact deliverable acquisition predicate for estimate/materialization', async () => {
    const prisma = {
      greeterJoinRequest: { findMany: jest.fn().mockResolvedValue([]) },
      greeterChannel: { findFirst: jest.fn() },
    } as any;
    const service = new GreeterBroadcastAudienceService(prisma);
    await service.resolve({
      workspaceId: 'w',
      botIntegrationId: 'b',
      audience: { audience: GreeterBroadcastAudience.ALL_ALIVE },
    });

    expect(prisma.greeterJoinRequest.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'w',
        botIntegrationId: 'b',
        environment: 'PRODUCTION',
        telegramUser: {
          blockedAt: null,
          telegramChatId: { not: null },
          OR: [
            { startedAt: { not: null } },
            {
              greeterJoinRequests: {
                some: {
                  botIntegrationId: 'b',
                  environment: 'PRODUCTION',
                  OR: [
                    { status: GreeterJoinRequestStatus.APPROVED },
                    { captchaPassedAt: { not: null } },
                  ],
                },
              },
            },
          ],
        },
      },
      distinct: ['telegramBotUserId'],
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      select: expect.any(Object),
    });
  });

  it('requires a channel connected to the same workspace and bot', async () => {
    const prisma = {
      greeterChannel: { findFirst: jest.fn().mockResolvedValue(null) },
      greeterJoinRequest: { findMany: jest.fn() },
    } as any;
    const service = new GreeterBroadcastAudienceService(prisma);
    await expect(
      service.resolve({
        workspaceId: 'w',
        botIntegrationId: 'b',
        audience: {
          audience: GreeterBroadcastAudience.CHANNEL,
          channelId: 'foreign',
        },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.greeterChannel.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: 'w',
        botIntegrationId: 'b',
        channelId: 'foreign',
        enabled: true,
      },
      select: { id: true },
    });
    expect(prisma.greeterJoinRequest.findMany).not.toHaveBeenCalled();
  });

  it('materializes DID_NOT_INTERACT with the inverse interaction predicate', async () => {
    const prisma = {
      greeterJoinRequest: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    const service = new GreeterBroadcastAudienceService(prisma);
    await service.resolve({
      workspaceId: 'w',
      botIntegrationId: 'b',
      audience: {
        audience: GreeterBroadcastAudience.USER_STATE,
        userState: GreeterUserState.DID_NOT_INTERACT,
      },
    });
    expect(prisma.greeterJoinRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          telegramUser: expect.objectContaining({
            blockedAt: null,
            telegramChatId: { not: null },
            startedAt: null,
            greeterJoinRequests: {
              none: expect.objectContaining({
                botIntegrationId: 'b',
                environment: 'PRODUCTION',
              }),
            },
          }),
        }),
      }),
    );
  });

  it('rejects a USER_STATE audience without a state', async () => {
    const service = new GreeterBroadcastAudienceService({} as any);
    await expect(
      service.resolve({
        workspaceId: 'w',
        botIntegrationId: 'b',
        audience: { audience: GreeterBroadcastAudience.USER_STATE },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

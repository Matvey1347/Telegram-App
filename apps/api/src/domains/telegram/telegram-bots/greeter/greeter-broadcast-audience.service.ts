import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GreeterAutomationEnvironment,
  GreeterBroadcastAudience,
  GreeterJoinRequestStatus,
  GreeterUserState,
} from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

export type GreeterAudienceInput = {
  audience: GreeterBroadcastAudience;
  channelId?: string | null;
  userState?: GreeterUserState | null;
};

@Injectable()
export class GreeterBroadcastAudienceService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(input: {
    workspaceId: string;
    botIntegrationId: string;
    audience: GreeterAudienceInput;
  }) {
    await this.validateChannel(
      input.workspaceId,
      input.botIntegrationId,
      input.audience,
    );
    const interactionWhere = {
      OR: [
        { startedAt: { not: null } },
        {
          greeterJoinRequests: {
            some: {
              botIntegrationId: input.botIntegrationId,
              environment: GreeterAutomationEnvironment.PRODUCTION,
              OR: [
                { status: GreeterJoinRequestStatus.APPROVED },
                { captchaPassedAt: { not: null } },
              ],
            },
          },
        },
      ],
    };
    const userState = input.audience.userState;
    const telegramUserWhere =
      input.audience.audience === GreeterBroadcastAudience.USER_STATE &&
      userState === GreeterUserState.DID_NOT_INTERACT
        ? {
            blockedAt: null,
            telegramChatId: { not: null },
            startedAt: null,
            greeterJoinRequests: {
              none: {
                botIntegrationId: input.botIntegrationId,
                environment: GreeterAutomationEnvironment.PRODUCTION,
                OR: [
                  { status: GreeterJoinRequestStatus.APPROVED },
                  { captchaPassedAt: { not: null } },
                ],
              },
            },
          }
        : input.audience.audience === GreeterBroadcastAudience.USER_STATE &&
            userState === GreeterUserState.BLOCKED
          ? { id: '__known_blocked_users_are_not_deliverable__' }
          : {
              blockedAt: null,
              telegramChatId: { not: null },
              ...interactionWhere,
            };

    return this.prisma.greeterJoinRequest.findMany({
      where: {
        workspaceId: input.workspaceId,
        botIntegrationId: input.botIntegrationId,
        environment: GreeterAutomationEnvironment.PRODUCTION,
        ...(input.audience.audience === GreeterBroadcastAudience.CHANNEL
          ? { channelId: input.audience.channelId! }
          : {}),
        telegramUser: telegramUserWhere,
      },
      distinct: ['telegramBotUserId'],
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      select: {
        telegramBotUserId: true,
        channelId: true,
        telegramUser: {
          select: {
            id: true,
            telegramChatId: true,
            telegramUserId: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
        channel: { select: { id: true, title: true, username: true } },
      },
    });
  }

  private async validateChannel(
    workspaceId: string,
    botIntegrationId: string,
    audience: GreeterAudienceInput,
  ) {
    if (
      audience.audience === GreeterBroadcastAudience.USER_STATE &&
      !audience.userState
    ) {
      throw new BadRequestException('User state is required for this audience');
    }
    if (audience.audience !== GreeterBroadcastAudience.CHANNEL) return;
    if (!audience.channelId)
      throw new BadRequestException('Channel is required');
    const channel = await this.prisma.greeterChannel.findFirst({
      where: {
        workspaceId,
        botIntegrationId,
        channelId: audience.channelId,
        enabled: true,
      },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Greeter channel not found');
  }
}

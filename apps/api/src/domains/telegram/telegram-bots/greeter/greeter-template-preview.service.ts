import { BadRequestException } from '@nestjs/common';
import type {
  GreeterButtonRows,
  GreeterTemplateContextInput,
  GreeterTemplatePreview,
} from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import { GreeterAdminService } from './greeter-admin.service';
import {
  assertValidGreeterTemplate,
  GREETER_TEMPLATE_VARIABLES,
  renderGreeterTemplate,
} from './greeter-template.renderer';

export class GreeterTemplatePreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: GreeterAdminService,
  ) {}

  async preview(
    userId: string,
    botId: string,
    input: {
      template: string;
      buttons?: GreeterButtonRows;
      context?: GreeterTemplateContextInput;
    },
  ): Promise<GreeterTemplatePreview> {
    const bot = await this.admin.requireBot(userId, botId);
    try {
      assertValidGreeterTemplate(input.template);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const [channel, user] = await Promise.all([
      input.context?.channelId
        ? this.prisma.telegramChannel.findFirst({
            where: {
              id: input.context.channelId,
              workspaceId: bot.workspaceId,
            },
            select: { title: true, username: true },
          })
        : null,
      input.context?.telegramBotUserId
        ? this.prisma.telegramBotUser.findFirst({
            where: {
              id: input.context.telegramBotUserId,
              workspaceId: bot.workspaceId,
              botIntegrationId: bot.id,
            },
          })
        : null,
    ]);
    const context = {
      channel: {
        title:
          channel?.title ||
          input.context?.sample?.channelTitle ||
          'Sample channel',
        username:
          channel?.username || input.context?.sample?.channelUsername || null,
      },
      user: {
        firstName:
          user?.firstName || input.context?.sample?.firstName || 'Sample user',
        lastName: user?.lastName,
        username: user?.username || input.context?.sample?.username || null,
      },
      captcha: { answer: '4' },
    };
    const variables = Object.fromEntries(
      GREETER_TEMPLATE_VARIABLES.map((key) => [
        key,
        renderGreeterTemplate(`{{${key}}}`, context),
      ]),
    );
    return {
      renderedText: renderGreeterTemplate(input.template, context),
      buttons: input.buttons || [],
      variables,
    };
  }
}

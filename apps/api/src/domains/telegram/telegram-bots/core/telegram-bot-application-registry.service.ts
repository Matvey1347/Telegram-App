import { Injectable } from '@nestjs/common';
import { TelegramBotApplicationType } from '@prisma/client';
import type { TelegramBotApplicationOption } from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';

type Definition = Omit<
  TelegramBotApplicationOption,
  'eligible' | 'unavailableReason'
>;

const DEFINITIONS: Definition[] = [
  {
    type: TelegramBotApplicationType.NONE,
    label: 'No runtime app',
    description: 'Connected token only. Webhook runtime is disabled.',
    availability: 'GLOBAL',
  },
  {
    type: TelegramBotApplicationType.GREETER,
    label: 'Greeter',
    description: 'Basic onboarding runtime for incoming private chats.',
    availability: 'GLOBAL',
  },
  {
    type: TelegramBotApplicationType.FINANCE,
    label: 'Finance',
    description: 'Finance automation runtime for approved workspaces.',
    availability: 'WORKSPACE_RESTRICTED',
  },
];

@Injectable()
export class TelegramBotApplicationRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  definitions() {
    return DEFINITIONS;
  }

  async optionsForWorkspace(
    workspaceId: string,
  ): Promise<TelegramBotApplicationOption[]> {
    const restrictedAccess =
      await this.prisma.telegramBotApplicationWorkspaceAccess.findMany({
        where: { workspaceId, enabled: true },
        select: { applicationType: true },
      });
    const enabled = new Set(
      restrictedAccess.map((item) => item.applicationType),
    );
    return DEFINITIONS.map((definition) => {
      const eligible =
        definition.availability === 'GLOBAL' || enabled.has(definition.type);
      return {
        ...definition,
        eligible,
        unavailableReason: eligible
          ? null
          : 'This bot application is not enabled for this workspace.',
      };
    });
  }

  async isEligible(workspaceId: string, type: TelegramBotApplicationType) {
    const option = (await this.optionsForWorkspace(workspaceId)).find(
      (item) => item.type === type,
    );
    return Boolean(option?.eligible);
  }
}

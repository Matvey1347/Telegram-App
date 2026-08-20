import { TelegramBotApplicationType } from '@prisma/client';
import { TelegramBotApplicationRegistryService } from './telegram-bot-application-registry.service';

describe('TelegramBotApplicationRegistryService', () => {
  it('makes Greeter global and keeps Finance workspace restricted', async () => {
    const prisma = {
      telegramBotApplicationWorkspaceAccess: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new TelegramBotApplicationRegistryService(prisma as never);

    const options = await service.optionsForWorkspace('workspace-1');

    expect(
      options.find((item) => item.type === TelegramBotApplicationType.GREETER),
    ).toMatchObject({
      availability: 'GLOBAL',
      eligible: true,
    });
    expect(
      options.find((item) => item.type === TelegramBotApplicationType.FINANCE),
    ).toMatchObject({
      availability: 'WORKSPACE_RESTRICTED',
      eligible: false,
    });
    expect(
      await service.isEligible(
        'workspace-1',
        TelegramBotApplicationType.FINANCE,
      ),
    ).toBe(false);
  });

  it('enables Finance only from explicit workspace access rows', async () => {
    const prisma = {
      telegramBotApplicationWorkspaceAccess: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { applicationType: TelegramBotApplicationType.FINANCE },
          ]),
      },
    };
    const service = new TelegramBotApplicationRegistryService(prisma as never);

    await expect(
      service.isEligible('workspace-1', TelegramBotApplicationType.FINANCE),
    ).resolves.toBe(true);
  });
});

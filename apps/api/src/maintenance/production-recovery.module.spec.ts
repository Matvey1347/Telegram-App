import { Test } from '@nestjs/testing';
import { ContextIdFactory, ModulesContainer } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { ProductionOperatorBotRelay } from '../telegram/shared/mtproto/production-operator-send-relay';
import { TelegramBotApiClient } from '../telegram/shared/bot/telegram-bot-api.client';
import { ProductionRecoveryMtprotoRelay } from '../telegram/shared/mtproto/production-recovery-mtproto-relay';
import { TelegramMtprotoClient } from '../telegram/shared/mtproto/telegram-mtproto.client';
import { TelegramManagedPostReschedulerService } from '../domains/telegram/telegram-channels/telegram-managed-post-rescheduler.service';
import { ProductionRecoveryModule } from './production-recovery.module';
import { ProductionRecoveryController } from './production-recovery.controller';

jest.mock('../config/production-recovery-config', () => ({
  productionRecoveryConfig: () => ({
    workspaceId: 'workspace-test',
    channelId: 'channel-test',
    productionApiOrigin: 'https://api.example.test/api',
  }),
}));

describe('ProductionRecoveryModule dependency closure', () => {
  it('resolves real request handlers without importing runtime worker modules', async () => {
    const connect = jest.fn();
    const module = await Test.createTestingModule({
      imports: [ProductionRecoveryModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: connect })
      .overrideProvider(ConfigService)
      .useValue({ get: (_key: string, fallback?: unknown) => fallback })
      .compile();
    try {
      await module.init();
      expect(module.get(TelegramMtprotoClient)).toBeInstanceOf(
        ProductionRecoveryMtprotoRelay,
      );
      expect(module.get(TelegramBotApiClient)).toBeInstanceOf(ProductionOperatorBotRelay);
      expect(() =>
        module.get(TokenEncryptionService).decrypt({
          encrypted: '',
          iv: '',
          authTag: '',
        }),
      ).toThrow('decryption is disabled');
      const contextId = ContextIdFactory.create();
      module.registerRequestByContextId(
        { headers: { 'x-workspace-id': 'workspace-test' } },
        contextId,
      );
      const controller = await module.resolve(
        ProductionRecoveryController,
        contextId,
      );
      const rescheduler = await module.resolve(
        TelegramManagedPostReschedulerService,
        contextId,
      );
      expect(controller).toBeInstanceOf(ProductionRecoveryController);
      expect(rescheduler).toBeInstanceOf(TelegramManagedPostReschedulerService);
      const modules = [...module.get(ModulesContainer).values()].map(
        (entry) => entry.metatype.name,
      );
      for (const forbidden of [
        'AppModule',
        'ScheduleModule',
        'TelegramChannelsModule',
        'TelegramCrmModule',
        'TelegramBotsModule',
        'ScheduledTasksModule',
        'ApplicationLogsModule',
      ]) {
        expect(modules).not.toContain(forbidden);
      }
      expect(modules).toEqual(
        expect.arrayContaining([
          'ProductionRecoveryModule',
          'PrismaModule',
          'RequestContextModule',
        ]),
      );
      expect(connect).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });
});

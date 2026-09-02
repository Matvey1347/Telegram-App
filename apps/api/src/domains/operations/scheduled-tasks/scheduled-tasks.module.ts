import { Module } from '@nestjs/common';
import { ApplicationLogsModule } from '../application-logs/application-logs.module';
import { CurrenciesModule } from '../../finance/currencies/currencies.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { TelegramAdSalesModule } from '../../telegram/telegram-ad-sales/telegram-ad-sales.module';
import { TelegramCrmModule } from '../../telegram/telegram-crm/telegram-crm.module';
import { TelegramBotsModule } from '../../telegram/telegram-bots/telegram-bots.module';
import { TelegramSyncModule } from '../../telegram/telegram-sync/telegram-sync.module';
import { ScheduledTaskLockService } from './scheduled-task-lock.service';
import { ScheduledTaskNotificationsService } from './scheduled-task-notifications.service';
import { ScheduledTaskExecutorService } from './scheduled-task-executor.service';
import { ScheduledTaskRegistryService } from './scheduled-task-registry.service';
import { ScheduledTaskRunnerService } from './scheduled-task-runner.service';
import { ScheduledTasksController } from './scheduled-tasks.controller';
import { ScheduledTasksService } from './scheduled-tasks.service';
import { OperationsNotificationsModule } from '../notifications/operations-notifications.module';

@Module({
  imports: [
    PrismaModule,
    TelegramSyncModule,
    CurrenciesModule,
    TelegramAdSalesModule,
    TelegramCrmModule,
    TelegramBotsModule,
    ApplicationLogsModule,
    OperationsNotificationsModule,
  ],
  controllers: [ScheduledTasksController],
  providers: [
    ScheduledTasksService,
    ScheduledTaskExecutorService,
    ScheduledTaskRegistryService,
    ScheduledTaskLockService,
    ScheduledTaskRunnerService,
    ScheduledTaskNotificationsService,
  ],
  exports: [ScheduledTasksService, ScheduledTaskRegistryService],
})
export class ScheduledTasksModule {}

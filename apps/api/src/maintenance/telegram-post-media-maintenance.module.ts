import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { B2ObjectStorageService } from '../common/object-storage/b2-object-storage.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { TelegramPostMediaBackfillService } from '../domains/telegram/telegram-channels/telegram-post-media-backfill.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramMtprotoClient } from '../telegram/shared/telegram-mtproto.client';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
  ],
  providers: [
    B2ObjectStorageService,
    TokenEncryptionService,
    TelegramMtprotoClient,
    TelegramPostMediaBackfillService,
  ],
})
export class TelegramPostMediaMaintenanceModule {}

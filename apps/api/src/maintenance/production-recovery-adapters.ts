import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChannelAccessService } from '../domains/telegram/telegram-channels/telegram-channel-access.service';
import { TelegramChannelSchemaCompatibilityService } from '../domains/telegram/telegram-channels/telegram-channel-schema-compatibility.service';
import { operatorBotActor } from '../telegram/shared/mtproto/production-operator-send-relay';
import { recoveryAccountMarker } from '../telegram/shared/mtproto/production-recovery-relay-context';

export function unavailableRecoveryCredential(): never {
  throw new Error(
    'Credential decryption is disabled in the local operator host',
  );
}

@Injectable()
export class RecoveryChannelAccess extends TelegramChannelAccessService {
  override async botTokenForSource(_workspaceId: string, sourceId: string) {
    return operatorBotActor(sourceId);
  }

  override async refreshSystemBotPublishingAccess() {
    throw new Error('No eligible bot is recorded for this channel. Check the bot permissions in the deployed UI first.');
  }

  override async refreshProductionBotPublishingAccess() {
    throw new Error('No eligible production bot is recorded for this channel.');
  }

  override accountCredentials(
    account: Parameters<
      TelegramChannelAccessService['accountCredentials']
    >[0] & { id?: string },
  ) {
    if (!account.id)
      throw new Error('Recovery requires a linked Telegram account ID');
    return { apiId: '0', apiHash: recoveryAccountMarker, session: account.id };
  }
}

@Injectable()
export class RecoverySchemaCompatibility extends TelegramChannelSchemaCompatibilityService {
  constructor(private readonly operatorPrisma: PrismaService) {
    super(operatorPrisma);
  }

  override async ensureTelegramManagedPostOriginColumnsAvailable(): Promise<void> {
    throw new Error(
      'Production managed-post schema must be deployed before recovery',
    );
  }

  override async ensureTelegramChannelSyncScopeColumnsAvailable(): Promise<void> {
    throw new Error(
      'Production channel schema must be deployed before recovery',
    );
  }

  override async ensurePostGroupSystemColumnsAvailable(): Promise<void> {
    await this.operatorPrisma.postGroup.findFirst({
      select: { isSystem: true, systemKey: true },
    });
  }
}

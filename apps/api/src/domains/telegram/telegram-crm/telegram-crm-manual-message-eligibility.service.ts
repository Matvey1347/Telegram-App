import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmAccountAccessService } from './telegram-crm-account-access.service';
import { TelegramCrmManualMessagePolicyService } from './telegram-crm-manual-message-policy.service';

@Injectable()
export class TelegramCrmManualMessageEligibilityService {
  constructor(
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly accountAccess: TelegramCrmAccountAccessService,
    private readonly policy: TelegramCrmManualMessagePolicyService,
  ) {}

  async evaluate(userId: string, accountId: string) {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const account = await this.accountAccess.find(
      access.workspaceId,
      accountId,
    );
    if (!account)
      throw new NotFoundException('Telegram user account not found');
    return this.policy.evaluate({
      hasSendManualMessagesPermission: await this.authorization.can(
        userId,
        'adSales.crm.sendManualMessages',
      ),
      accountCrmSendEnabled: account.crmSendEnabled,
    });
  }
}

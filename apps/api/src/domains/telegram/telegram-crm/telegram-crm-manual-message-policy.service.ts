import { Injectable } from '@nestjs/common';

export type CrmManualMessagePolicyResult =
  | { allowed: true; reason: 'ELIGIBLE' }
  | {
      allowed: false;
      reason: 'MISSING_PERMISSION' | 'ACCOUNT_SEND_DISABLED';
    };

/**
 * Manual sends deliberately do not accept workspace/contact/deal automation
 * flags. Those flags govern customer automation only.
 */
@Injectable()
export class TelegramCrmManualMessagePolicyService {
  evaluate(input: {
    hasSendManualMessagesPermission: boolean;
    accountCrmSendEnabled: boolean;
  }): CrmManualMessagePolicyResult {
    if (!input.hasSendManualMessagesPermission) {
      return { allowed: false, reason: 'MISSING_PERMISSION' };
    }
    if (!input.accountCrmSendEnabled) {
      return { allowed: false, reason: 'ACCOUNT_SEND_DISABLED' };
    }
    return { allowed: true, reason: 'ELIGIBLE' };
  }
}

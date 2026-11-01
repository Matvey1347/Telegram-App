import { crmChatRollout } from '../../../config/deployment-config';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
/** Reject before multipart buffering. No waiting queue or timer. */
@Injectable()
export class TelegramCrmChatTransferGuard implements CanActivate {
  private active = 0;
  canActivate(context: ExecutionContext) {
    if (!crmChatRollout().media)
      throw new ServiceUnavailableException('CHAT_MEDIA_DISABLED');
    if (this.active >= 2)
      throw new ServiceUnavailableException('CHAT_MEDIA_BUSY_RETRY_LATER');
    this.active++;
    const response = context.switchToHttp().getResponse<Response>();
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        this.active--;
      }
    };
    response.once('finish', release);
    response.once('close', release);
    return true;
  }
}

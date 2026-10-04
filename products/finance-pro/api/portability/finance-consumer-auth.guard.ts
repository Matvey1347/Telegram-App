import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { FinanceConsumerSession } from '../identity/finance-consumer-session.service';
import { FinanceConsumerRequestService } from '../http/finance-consumer-request.service';

export type FinanceImportRequest = Request & {
  financeConsumerSession: FinanceConsumerSession;
};

@Injectable()
export class FinanceConsumerAuthGuard implements CanActivate {
  constructor(private readonly requests: FinanceConsumerRequestService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<FinanceImportRequest>();
    const botId = String(request.params.botId ?? '');
    request.financeConsumerSession = this.requests.authenticate(botId, request);
    return true;
  }
}

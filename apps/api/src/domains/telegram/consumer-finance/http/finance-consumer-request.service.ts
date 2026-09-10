import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { FinanceConsumerSessionService } from '../identity/finance-consumer-session.service';

@Injectable()
export class FinanceConsumerRequestService {
  constructor(private readonly sessions: FinanceConsumerSessionService) {}

  assertMutation(request: Request) {
    const method = request.method?.toUpperCase();
    if (
      method &&
      !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
      request.headers['x-finance-consumer-request'] !== '1'
    ) {
      throw new ForbiddenException('Finance consumer request is not trusted');
    }
  }

  authenticate(botIntegrationId: string, request: Request) {
    this.assertMutation(request);
    return this.sessions.fromRequest(request, botIntegrationId);
  }
}

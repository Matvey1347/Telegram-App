import { Body, Controller, Post } from '@nestjs/common';
import { FinanceAuthService } from './finance-auth.service';

@Controller('finance/session')
export class FinanceAuthController {
  constructor(private readonly auth: FinanceAuthService) {}

  @Post('bootstrap')
  bootstrap(
    @Body()
    input: {
      financeBotId: string;
      telegramUserId: string;
      issuedAt: number;
      signature: string;
    },
  ) {
    return this.auth.bootstrap(input);
  }
}

import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
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

  @Post('telegram-browser')
  async telegramBrowser(@Body() input: { financeBotId: string; initData: string }, @Res({ passthrough: true }) response: Response) {
    const token = await this.auth.telegramBrowserSession(input);
    response.setHeader('Set-Cookie', `finance_session=${token}; HttpOnly; Secure; SameSite=None; Path=/api/finance; Max-Age=28800`);
    return { authenticated: true };
  }
}

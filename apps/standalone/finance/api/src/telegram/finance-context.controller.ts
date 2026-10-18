import { Controller, Get } from '@nestjs/common';
import { FinancePrimaryBotService } from './finance-primary-bot.service';

@Controller('finance')
export class FinanceContextController {
  constructor(private readonly primaryBot: FinancePrimaryBotService) {}

  /** Temporary UI bridge while legacy client routes are removed. */
  @Get('context')
  async context() {
    const bot = await this.primaryBot.resolve();
    return { financeBotId: bot.id };
  }
}

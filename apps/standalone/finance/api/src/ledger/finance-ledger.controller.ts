import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { FinanceSessionService } from '../identity/finance-session.service';
import { FinanceLedgerService } from './finance-ledger.service';

@Controller('finance/:financeBotId')
export class FinanceLedgerController {
  constructor(
    private readonly sessions: FinanceSessionService,
    private readonly ledger: FinanceLedgerService,
  ) {}

  @Post('accounts')
  createAccount(
    @Param('financeBotId') financeBotId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() input: { name: string; currency: string },
  ) {
    return this.ledger.createAccount(this.sessions.authenticate(authorization, financeBotId), input);
  }

  @Post('transactions')
  createTransaction(
    @Param('financeBotId') financeBotId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body()
    input: {
      accountId: string;
      kind: 'INCOME' | 'EXPENSE';
      amountMinor: string;
      economicAmountMinor: string;
      occurredAt?: string;
    },
  ) {
    return this.ledger.createTransaction(
      this.sessions.authenticate(authorization, financeBotId),
      input,
    );
  }
}

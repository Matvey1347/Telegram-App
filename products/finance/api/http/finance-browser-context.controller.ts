import { Controller, Get } from "@nestjs/common";
import { FinanceBrowserContextService } from "@consumer-finance/api/http/finance-browser-context.service";

@Controller("finance")
export class FinanceBrowserContextController {
  constructor(private readonly context: FinanceBrowserContextService) {}

  @Get("context")
  contextForBrowser() {
    return this.context.resolve();
  }
}

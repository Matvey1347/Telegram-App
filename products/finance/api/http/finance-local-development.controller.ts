import { Controller, Headers, Post } from "@nestjs/common";
import { FinanceLocalDevelopmentService } from "@consumer-finance/api/http/finance-local-development.service";

@Controller("finance/local-development")
export class FinanceLocalDevelopmentController {
  constructor(private readonly development: FinanceLocalDevelopmentService) {}

  @Post("synchronize-bot")
  synchronize(
    @Headers("x-local-dev-control-secret") secret: string | undefined,
  ) {
    return this.development.synchronize(secret);
  }
}

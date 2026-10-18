import { FinanceConsumerRuntimeEnvironmentService } from "@consumer-finance/api/identity/finance-consumer-runtime-environment.service";
import { ConfigService } from "@nestjs/config";

describe("FinanceConsumerRuntimeEnvironmentService", () => {
  const previousBot = process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT;
  const previousBrowserLoginBot =
    process.env.FINANCE_BROWSER_LOGIN_BOT_USERNAME;

  afterEach(() => {
    if (previousBot === undefined) {
      delete process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT;
    } else {
      process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT = previousBot;
    }
    if (previousBrowserLoginBot === undefined) {
      delete process.env.FINANCE_BROWSER_LOGIN_BOT_USERNAME;
    } else {
      process.env.FINANCE_BROWSER_LOGIN_BOT_USERNAME = previousBrowserLoginBot;
    }
  });

  it("uses the workspace bot runtime", () => {
    process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT = "PRODUCTION";

    expect(service().current()).toBe("PRODUCTION");
  });

  it("does not guess a runtime when neither selector is valid", () => {
    process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT = "staging";

    expect(service().current()).toBeNull();
  });

  it("uses the profile-selected bot for browser login", () => {
    process.env.FINANCE_BROWSER_LOGIN_BOT_USERNAME =
      "@smart_budgeting_test_bot";

    expect(service().browserLoginBotUsername()).toBe(
      "smart_budgeting_test_bot",
    );
  });

  it("rejects an invalid browser-login bot username", () => {
    process.env.FINANCE_BROWSER_LOGIN_BOT_USERNAME = "not a bot";

    expect(service().browserLoginBotUsername()).toBeNull();
  });
});
function service() {
  return new FinanceConsumerRuntimeEnvironmentService(new ConfigService());
}

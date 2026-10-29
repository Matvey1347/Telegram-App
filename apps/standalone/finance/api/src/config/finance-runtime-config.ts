import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface FinanceEnvironment {
  FINANCE_DATABASE_URL: string;
  FINANCE_SESSION_SIGNING_KEY: string;
  FINANCE_BOOTSTRAP_SIGNING_KEY: string;
  FINANCE_API_PORT: number;
  FINANCE_BOT_RUNTIME_ENVIRONMENT: FinanceBotRuntimeEnvironment;
  FINANCE_BOT_LOCAL_USERNAME?: string;
  FINANCE_BOT_LOCAL_TOKEN?: string;
  FINANCE_BOT_LOCAL_WEBHOOK_SECRET?: string;
  FINANCE_BOT_PRODUCTION_USERNAME?: string;
  FINANCE_BOT_PRODUCTION_TOKEN?: string;
  FINANCE_BOT_PRODUCTION_WEBHOOK_SECRET?: string;
  FINANCE_WEB_PUBLIC_URL?: string;
  FINANCE_API_PUBLIC_URL?: string;
  FINANCE_STRIPE_MODE?: "TEST" | "LIVE";
  FINANCE_STRIPE_TEST_SECRET_KEY?: string;
  FINANCE_STRIPE_TEST_WEBHOOK_SECRET?: string;
  FINANCE_STRIPE_LIVE_SECRET_KEY?: string;
  FINANCE_STRIPE_LIVE_WEBHOOK_SECRET?: string;
  /** Shared only with the Nexeloq API for its authenticated admin read model. */
  FINANCE_ADMIN_ANALYTICS_TOKEN?: string;
  FINANCE_ADMIN_ANALYTICS_WORKSPACE_ID?: string;
}

export type FinanceBotRuntimeEnvironment = "DISABLED" | "LOCAL" | "PRODUCTION";

export interface SelectedFinanceBotConfig {
  environment: Exclude<FinanceBotRuntimeEnvironment, "DISABLED">;
  username: string;
  token: string;
  webhookSecret: string;
}

export function validateFinanceEnvironment(
  input: Record<string, unknown>,
): FinanceEnvironment {
  const databaseUrl = requiredUrl(
    input.FINANCE_DATABASE_URL,
    "FINANCE_DATABASE_URL",
  );
  const botEnvironment = parseBotRuntimeEnvironment(
    input.FINANCE_BOT_RUNTIME_ENVIRONMENT,
  );
  if (botEnvironment === "PRODUCTION" && input.FINANCE_STRIPE_MODE === "TEST")
    throw new Error("Production Finance bot cannot use Stripe TEST mode");
  // Railway assigns PORT at runtime. Locally, Finance remains on its own
  // default port and never falls back to an API-host setting from Nexeloq.
  const port = optionalPort(input.PORT ?? input.FINANCE_API_PORT);

  return {
    FINANCE_DATABASE_URL: databaseUrl,
    FINANCE_SESSION_SIGNING_KEY: requiredSecret(
      input.FINANCE_SESSION_SIGNING_KEY,
      "FINANCE_SESSION_SIGNING_KEY",
    ),
    FINANCE_BOOTSTRAP_SIGNING_KEY: requiredSecret(
      input.FINANCE_BOOTSTRAP_SIGNING_KEY,
      "FINANCE_BOOTSTRAP_SIGNING_KEY",
    ),
    FINANCE_API_PORT: port,
    FINANCE_BOT_RUNTIME_ENVIRONMENT: botEnvironment,
    ...selectedBotEnvironment(input, botEnvironment),
    ...configuredBotCredentials(input),
    FINANCE_ADMIN_ANALYTICS_TOKEN: optionalString(
      input.FINANCE_ADMIN_ANALYTICS_TOKEN,
    ),
    FINANCE_ADMIN_ANALYTICS_WORKSPACE_ID: optionalString(
      input.FINANCE_ADMIN_ANALYTICS_WORKSPACE_ID,
    ),
    FINANCE_WEB_PUBLIC_URL: optionalPublicUrl(
      input.FINANCE_WEB_PUBLIC_URL,
      "FINANCE_WEB_PUBLIC_URL",
      botEnvironment,
    ),
    FINANCE_API_PUBLIC_URL: optionalPublicUrl(
      input.FINANCE_API_PUBLIC_URL,
      "FINANCE_API_PUBLIC_URL",
      botEnvironment,
    ),
    ...stripeEnvironment(input),
  };
}

@Injectable()
export class FinanceRuntimeConfig {
  readonly databaseUrl: string;
  readonly port: number;
  readonly sessionSigningKey: string;
  readonly bootstrapSigningKey: string;
  readonly botRuntimeEnvironment: FinanceBotRuntimeEnvironment;
  readonly webPublicUrl?: string;
  readonly apiPublicUrl?: string;
  readonly stripeMode?: "TEST" | "LIVE";
  readonly stripeTestSecretKey?: string;
  readonly stripeTestWebhookSecret?: string;
  readonly stripeLiveSecretKey?: string;
  readonly stripeLiveWebhookSecret?: string;
  readonly adminAnalyticsToken?: string;
  readonly adminAnalyticsWorkspaceId?: string;
  readonly selectedBot?: SelectedFinanceBotConfig;
  private readonly configuredBots: Partial<
    Record<
      Exclude<FinanceBotRuntimeEnvironment, "DISABLED">,
      SelectedFinanceBotConfig
    >
  >;

  constructor(config: ConfigService<FinanceEnvironment, true>) {
    this.databaseUrl = config.get("FINANCE_DATABASE_URL", { infer: true });
    this.port = config.get("FINANCE_API_PORT", { infer: true });
    this.sessionSigningKey = config.get("FINANCE_SESSION_SIGNING_KEY", {
      infer: true,
    });
    this.bootstrapSigningKey = config.get("FINANCE_BOOTSTRAP_SIGNING_KEY", {
      infer: true,
    });
    this.botRuntimeEnvironment = config.get("FINANCE_BOT_RUNTIME_ENVIRONMENT", {
      infer: true,
    });
    this.webPublicUrl = config.get("FINANCE_WEB_PUBLIC_URL", { infer: true });
    this.apiPublicUrl = config.get("FINANCE_API_PUBLIC_URL", { infer: true });
    this.stripeMode = config.get("FINANCE_STRIPE_MODE", { infer: true });
    this.stripeTestSecretKey = config.get("FINANCE_STRIPE_TEST_SECRET_KEY", { infer: true });
    this.stripeTestWebhookSecret = config.get("FINANCE_STRIPE_TEST_WEBHOOK_SECRET", { infer: true });
    this.stripeLiveSecretKey = config.get("FINANCE_STRIPE_LIVE_SECRET_KEY", { infer: true });
    this.stripeLiveWebhookSecret = config.get("FINANCE_STRIPE_LIVE_WEBHOOK_SECRET", { infer: true });
    this.adminAnalyticsToken = config.get("FINANCE_ADMIN_ANALYTICS_TOKEN", {
      infer: true,
    });
    this.adminAnalyticsWorkspaceId = config.get(
      "FINANCE_ADMIN_ANALYTICS_WORKSPACE_ID",
      { infer: true },
    );
    this.selectedBot = selectedBotFromEnvironment(
      config,
      this.botRuntimeEnvironment,
    );
    this.configuredBots = configuredBotsFromEnvironment(config);
  }

  botForEnvironment(
    environment: Exclude<FinanceBotRuntimeEnvironment, "DISABLED">,
  ) {
    return this.configuredBots[environment];
  }

  configuredBotRuntimes() {
    return (["LOCAL", "PRODUCTION"] as const).flatMap((environment) => {
      const runtime = this.botForEnvironment(environment);
      return runtime ? [runtime] : [];
    });
  }
}

function stripeEnvironment(input: Record<string, unknown>) {
  const mode = input.FINANCE_STRIPE_MODE;
  if (mode !== undefined && mode !== "" && mode !== "TEST" && mode !== "LIVE")
    throw new Error("FINANCE_STRIPE_MODE must be TEST or LIVE");
  for (const selected of ["TEST", "LIVE"] as const) {
    const key = optionalString(input[`FINANCE_STRIPE_${selected}_SECRET_KEY`]);
    const webhook = optionalString(input[`FINANCE_STRIPE_${selected}_WEBHOOK_SECRET`]);
    if ((key || webhook) && (!key || !webhook))
      throw new Error(`FINANCE_STRIPE_${selected} requires both secret key and webhook secret`);
    if (key && !key.startsWith(selected === "TEST" ? "sk_test_" : "sk_live_"))
      throw new Error(`FINANCE_STRIPE_${selected}_SECRET_KEY has the wrong mode`);
    if (webhook && !webhook.startsWith("whsec_"))
      throw new Error(`FINANCE_STRIPE_${selected}_WEBHOOK_SECRET is invalid`);
  }
  if (mode && (!input[`FINANCE_STRIPE_${mode}_SECRET_KEY`] || !input[`FINANCE_STRIPE_${mode}_WEBHOOK_SECRET`]))
    throw new Error(`FINANCE_STRIPE_${mode} credentials are required`);
  return {
    FINANCE_STRIPE_MODE: (mode || undefined) as "TEST" | "LIVE" | undefined,
    FINANCE_STRIPE_TEST_SECRET_KEY: optionalString(input.FINANCE_STRIPE_TEST_SECRET_KEY),
    FINANCE_STRIPE_TEST_WEBHOOK_SECRET: optionalString(input.FINANCE_STRIPE_TEST_WEBHOOK_SECRET),
    FINANCE_STRIPE_LIVE_SECRET_KEY: optionalString(input.FINANCE_STRIPE_LIVE_SECRET_KEY),
    FINANCE_STRIPE_LIVE_WEBHOOK_SECRET: optionalString(input.FINANCE_STRIPE_LIVE_WEBHOOK_SECRET),
  };
}

function selectedBotEnvironment(
  input: Record<string, unknown>,
  environment: FinanceBotRuntimeEnvironment,
) {
  if (environment === "DISABLED") return {};
  const prefix = `FINANCE_BOT_${environment}`;
  return {
    [`${prefix}_USERNAME`]: requiredUsername(
      input[`${prefix}_USERNAME`],
      `${prefix}_USERNAME`,
    ),
    [`${prefix}_TOKEN`]: requiredSecret(
      input[`${prefix}_TOKEN`],
      `${prefix}_TOKEN`,
    ),
    [`${prefix}_WEBHOOK_SECRET`]: requiredSecret(
      input[`${prefix}_WEBHOOK_SECRET`],
      `${prefix}_WEBHOOK_SECRET`,
    ),
  };
}

function configuredBotCredentials(input: Record<string, unknown>) {
  return Object.fromEntries(
    (["LOCAL", "PRODUCTION"] as const).flatMap((environment) => {
      const prefix = `FINANCE_BOT_${environment}`;
      const username = optionalUsername(input[`${prefix}_USERNAME`]);
      const token = optionalString(input[`${prefix}_TOKEN`]);
      const webhookSecret = optionalString(input[`${prefix}_WEBHOOK_SECRET`]);
      return username && token && webhookSecret
        ? [
            [`${prefix}_USERNAME`, username],
            [`${prefix}_TOKEN`, token],
            [`${prefix}_WEBHOOK_SECRET`, webhookSecret],
          ]
        : [];
    }),
  );
}

function configuredBotsFromEnvironment(
  config: ConfigService<FinanceEnvironment, true>,
) {
  return Object.fromEntries(
    (["LOCAL", "PRODUCTION"] as const).flatMap((environment) => {
      const prefix = `FINANCE_BOT_${environment}`;
      const username = config.get(
        `${prefix}_USERNAME` as keyof FinanceEnvironment,
        {
          infer: true,
        },
      );
      const token = config.get(`${prefix}_TOKEN` as keyof FinanceEnvironment, {
        infer: true,
      });
      const webhookSecret = config.get(
        `${prefix}_WEBHOOK_SECRET` as keyof FinanceEnvironment,
        { infer: true },
      );
      return typeof username === "string" &&
        typeof token === "string" &&
        typeof webhookSecret === "string"
        ? [[environment, { environment, username, token, webhookSecret }]]
        : [];
    }),
  ) as Partial<
    Record<
      Exclude<FinanceBotRuntimeEnvironment, "DISABLED">,
      SelectedFinanceBotConfig
    >
  >;
}

function selectedBotFromEnvironment(
  config: ConfigService<FinanceEnvironment, true>,
  environment: FinanceBotRuntimeEnvironment,
): SelectedFinanceBotConfig | undefined {
  if (environment === "DISABLED") return undefined;
  const prefix = `FINANCE_BOT_${environment}` as const;
  return {
    environment,
    username: config.get(`${prefix}_USERNAME` as keyof FinanceEnvironment, {
      infer: true,
    }) as string,
    token: config.get(`${prefix}_TOKEN` as keyof FinanceEnvironment, {
      infer: true,
    }) as string,
    webhookSecret: config.get(
      `${prefix}_WEBHOOK_SECRET` as keyof FinanceEnvironment,
      {
        infer: true,
      },
    ) as string,
  };
}

function parseBotRuntimeEnvironment(
  value: unknown,
): FinanceBotRuntimeEnvironment {
  if (value === undefined || value === "") return "DISABLED";
  if (value === "LOCAL" || value === "PRODUCTION") return value;
  throw new Error(
    "FINANCE_BOT_RUNTIME_ENVIRONMENT must be LOCAL, PRODUCTION, or empty",
  );
}

function requiredUrl(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be configured`);
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new Error(`${name} must be a PostgreSQL URL`);
  }
  return value;
}

function requiredSecret(value: unknown, name: string) {
  if (typeof value !== "string" || value.length < 32) {
    throw new Error(`${name} must contain at least 32 characters`);
  }
  return value;
}

function requiredUsername(value: unknown, name: string) {
  if (
    typeof value !== "string" ||
    !/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value.trim())
  ) {
    throw new Error(`${name} must be a Telegram username`);
  }
  // Match the existing System Bot environment convention: values are stored
  // without @, while accepting @ avoids a fragile local setup distinction.
  return value.trim().replace(/^@/, "").toLowerCase();
}

function optionalUsername(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return requiredUsername(value, "configured Finance bot username");
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalPublicUrl(
  value: unknown,
  name: string,
  environment: FinanceBotRuntimeEnvironment,
) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${name} must be a URL`);
  try {
    const parsed = new URL(value);
    const allowsLocalHttp =
      environment !== "PRODUCTION" && parsed.hostname === "localhost";
    if (parsed.protocol !== "https:" && !allowsLocalHttp) {
      throw new Error("unsupported protocol");
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    throw new Error(
      `${name} must be an HTTPS URL (or localhost during local development)`,
    );
  }
}

function optionalPort(value: unknown) {
  if (value === undefined || value === "") return 4001;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("PORT or FINANCE_API_PORT must be a valid TCP port");
  }
  return parsed;
}

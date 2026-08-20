# Telegram System Bot configuration

The System Bot is a special integration outside workspace `TelegramBotIntegration`, but it reads the same workspace and business data. Its LOCAL and PRODUCTION runtimes must use different BotFather bots. Both runtimes use webhooks; polling is not supported.

Select exactly one runtime in a process:

- `TELEGRAM_SYSTEM_BOT_ENVIRONMENT=LOCAL` for `pnpm dev:bots`
- `TELEGRAM_SYSTEM_BOT_ENVIRONMENT=PRODUCTION` for the deployed API

An empty, missing, lowercase, or otherwise invalid selector disables the System Bot. There is no fallback to the old unsuffixed token variables.

Environment-specific credentials:

- `TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN`
- `TELEGRAM_SYSTEM_BOT_LOCAL_USERNAME`
- `TELEGRAM_SYSTEM_BOT_LOCAL_WEBHOOK_SECRET`
- `TELEGRAM_SYSTEM_BOT_PRODUCTION_TOKEN`
- `TELEGRAM_SYSTEM_BOT_PRODUCTION_USERNAME`
- `TELEGRAM_SYSTEM_BOT_PRODUCTION_WEBHOOK_SECRET`

Shared process configuration:

- `TELEGRAM_SYSTEM_BOT_WEBHOOK_BASE_URL`: public API origin
- `FRONTEND_URL`: web origin used in secure connection links

Webhook secrets are optional. When the selected environment's secret is empty, the API generates one in memory at startup and registers that value with Telegram. Configure a stable secret for multiple API replicas so every replica validates the same header.

## Dashboard and status semantics

The System Bot settings screen is an observability view of process-managed
configuration, not a credential editor. It identifies `PRODUCTION` and `LOCAL`
separately and marks which environment the current API process selected. Tokens
and webhook secrets remain environment-managed: the dashboard must never imply
that it can save, replace, or reveal them from the database.

Runtime state is last-known operational information. Startup reconciliation and
actual Telegram updates may refresh it; the dashboard refresh control is a
user-requested read, not a background check. There is no heartbeat, frontend
polling, cron, or recurring `getWebhookInfo` call. A stale local result
therefore means that it was last observed by a process, not that a developer's
laptop is currently online.

## Local flow

`pnpm dev` starts the API and web app with HMR and explicitly disables the System Bot runtime. It never deletes or changes either System Bot webhook.

`pnpm dev:bots` (alias: `pnpm dev:webhook`) starts the API, web app, one ngrok gateway, and selects `LOCAL`. The gateway routes `/api` to Nest and all other paths to Next. The API registers only `TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN` at the ngrok webhook URL and configures commands for that local bot. Production credentials are not read.

`pnpm dev:ngrok` exposes the local app without enabling bot runtime side effects.

## Production flow

Set `TELEGRAM_SYSTEM_BOT_ENVIRONMENT=PRODUCTION`, the three `TELEGRAM_SYSTEM_BOT_PRODUCTION_*` credentials, and the production `TELEGRAM_SYSTEM_BOT_WEBHOOK_BASE_URL` in the deployment. Startup registers commands and the webhook only through the production token. It never reads or modifies the local BotFather bot.

The runtime does one bounded Telegram configuration pass at startup. It adds no polling loop, heartbeat, recurring database query, or status write.

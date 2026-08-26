# Telegram System Bot configuration

The System Bot is a special integration outside workspace `TelegramBotIntegration`, but it reads the same workspace and business data. Its LOCAL and PRODUCTION runtimes must use different BotFather bots. Both runtimes use webhooks; polling is not supported.

Select exactly one runtime in a process:

- `TELEGRAM_SYSTEM_BOT_ENVIRONMENT=LOCAL` for `pnpm dev:system-bot` or `pnpm dev:bots`
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

- `API_PUBLIC_URL`: canonical public API origin used for webhook routes
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

`pnpm dev:system-bot` starts the API, web app and a free Cloudflare Quick Tunnel, selects the LOCAL System Bot, and leaves workspace-bot runtimes disabled. The API registers `TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN` at the generated public webhook URL. Production credentials are not selected.

`pnpm dev:bots` starts the API, web app, one free Cloudflare Quick Tunnel gateway, and selects `LOCAL`. The gateway routes `/api` to Nest and all other paths to Next. The API registers only `TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN` at the generated `trycloudflare.com` webhook URL and configures commands for that local bot. Production credentials are never selected and their webhook is never changed. They are read only for an explicit, user-triggered channel-access audit so the local UI can report both LOCAL and PRODUCTION bot permissions.

## Production flow

Set `TELEGRAM_SYSTEM_BOT_ENVIRONMENT=PRODUCTION`, the three
`TELEGRAM_SYSTEM_BOT_PRODUCTION_*` credentials, and the production
`API_PUBLIC_URL` in the deployment. Startup registers commands and the webhook
only through the production token. It never reads or modifies the local
BotFather bot.

The runtime does one bounded Telegram configuration pass at startup. It adds no polling loop, heartbeat, recurring database query, or status write.

## Bot navigation and channel access

The persistent square keyboard contains Channels, Statistics, Posts, Ad Sale,
Finance and workspace switching. Scheduled Tasks are not exposed in the System
Bot. Entity selectors use compact two-column rows; short product choices may use
three columns.

`/posts` opens the Posts hub with Add new, Published and Scheduled views. The
scheduled view labels native Telegram/MTProto reservations separately from the
System Bot scheduler and exposes an explicit Publish now action. `/post` remains
the direct shortcut to the new-post wizard.

The Channels view lists only non-archived own channels in the selected
workspace, using the same `adminLinks.length > 0` ownership rule as the web
channel catalog.
A channel detail renders the stored real channel photo and card data, then
offers Sync and Check bot access. Telegram inline buttons cannot contain an
arbitrary channel image, so the photo belongs to the detail card rather than the
button. LOCAL access checks inspect both configured bots; PRODUCTION checks only
the production bot. A `my_chat_member` update refreshes the canonical access
record and notifies connected workspace members when the active System Bot is
newly promoted to administrator.

Finance transaction and transfer steps edit one control message. Account and
category choices use compact rows, while typed input messages are removed after
processing so the wizard does not leave one message per step.

## Post and Ad Sale workflows

Connected users can use `/post` to create a managed channel post and `/adsale`
to record an advertising sale. Both flows keep a durable, versioned wizard and
edit one bot-owned control message. Back, Cancel and retry remain safe across
API restarts; a double confirmation cannot create a second payment.

A forwarded text/photo post is recreated as an editable managed post. Photos
are downloaded through Bot API and persisted in object storage; Telegram token
URLs are never saved. URL buttons are preserved when Telegram includes them.
The post and Ad Sale wizards can replace the text and URL buttons before the
final action. Enter buttons one per line as `Label | https://example.com`, or
send `-` to remove all buttons.
Source callback, pay, game and Web App buttons are intentionally omitted because
their behavior belongs to the original bot; the wizard shows a warning instead
of silently claiming a complete copy. Video, document, audio and other media are
rejected until the managed-post content model supports them.

The Ad Sale quick flow uses the canonical atomic checkout: sale, placement,
Finance income transaction, payment and allocation are created together with a
stable idempotency key. Its optional post is placed in the system `advertise`
group. Formats `1/24`, `2/48`, `3/72` and `No auto-delete` use the existing
ad-product snapshots. Deletion becomes due exactly 24/48/72 hours after actual
publication; posts older than Bot API's deletion window require an available
MTProto admin source.

Telegram does not allow bots to create native scheduled messages. A post with
buttons therefore uses the existing local due scheduler; a compatible post
without buttons can use the MTProto native scheduled-message path. Neither
wizard adds polling: work occurs only on Telegram updates and existing due-work
notifications. See the official [Bot API](https://core.telegram.org/bots/api)
and [scheduled messages](https://core.telegram.org/api/scheduled-messages)
documentation.

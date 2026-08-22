# Telegram System

Internal system for managing Telegram channels, ad campaigns, finance, currencies and analytics.

## Local development

1. `pnpm install`
2. `pnpm db:up`
3. `pnpm db:migrate`
4. `pnpm dev` (starts the API and frontend locally, with HMR)

`pnpm dev` starts API and frontend directly, without `scripts/dev-tunnel.mjs` or a public tunnel; browser requests use `http://localhost:4000/api`. It explicitly disables workspace-bot and System Bot runtime startup side effects; Telegram-backed Finance consumer authentication is available through `pnpm dev:bots`.

### Local Telegram development

Use `pnpm dev:bots` only when developing Telegram behavior. It starts the API, web app and a free Cloudflare Quick Tunnel, selects the `LOCAL` runtime for workspace bots and the System Bot, and configures only those LOCAL BotFather bots. Install its one local dependency with `brew install cloudflared`; no Cloudflare account or domain is required. The public gateway sends `/api` to Nest and every other path to Next, allowing the local Finance Mini App to open on a phone. When Cloudflare assigns a new `trycloudflare.com` URL, the LOCAL Finance menu button and saved users' reply keyboards are refreshed automatically. On Ctrl+C, the command removes the LOCAL webhook and menu link, removes the reply keyboard, and tells saved LOCAL users that Finance is not running before it stops the processes. It never reads, changes, or rebinds a PRODUCTION token or webhook. Do not run it alongside `pnpm dev`: it owns ports 4000, 3000 and 4100.

### Production

Deploy with `TELEGRAM_BOT_RUNTIME_ENVIRONMENT=PRODUCTION` and `TELEGRAM_SYSTEM_BOT_ENVIRONMENT=PRODUCTION`. Finance consumer authentication uses that same workspace-bot runtime selection. Each deployment performs a bounded startup reconciliation of the selected bot runtime's webhook and presentation configuration. It does not poll Telegram or create recurring status reads/writes merely to keep a status indicator green.

### Finance entry points

Finance has one logical profile and data model across its entry points. Telegram Mini App users bootstrap a scoped consumer browser session with Telegram `initData`; the browser Web App uses a server-validated identity flow and resolves that same profile. **Open in browser** is a browser entry point, not a separate Finance account.

## Environment contract

The project has one environment profile:

- `.env` contains the real runtime/deployment values and is git-ignored.
- `.env.example` contains the same keys and section order with safe example values.
- `.env.prod` is not supported. Do not recreate it.
- Nested app-level `.env*` files are not supported; root scripts inject their
  local/build topology explicitly, and `pnpm env:check` rejects extra profiles.
- Add, rename, move, or remove an environment key in `.env` and `.env.example`
  together, then run `pnpm env:check`. The check compares key names only and
  never prints secret values.

Runtime profile keys are intentionally limited to secrets, deployment topology,
and operational switches that may legitimately differ between deployments:

- Core secrets and topology: `DATABASE_URL`, `API_PORT`, `API_PUBLIC_URL`,
  `FRONTEND_URL`, `NEXT_PUBLIC_API_URL`, `JWT_SECRET`, and
  `BOT_TOKEN_ENCRYPTION_KEY`.
- Telegram credentials and topology: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`,
  `TELEGRAM_BOT_RUNTIME_ENVIRONMENT`, `TELEGRAM_SYSTEM_BOT_ENVIRONMENT`, the
  LOCAL/PRODUCTION System Bot username,
  token and webhook-secret keys.
- Object storage: `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET_NAME`, and `B2_ENDPOINT`.
- Operational switches: `APP_LOG_MIN_LEVEL`, `APP_CONSOLE_LOG_LEVEL`,
  `APP_LOG_HTTP_ENABLED`, `APP_LOG_HTTP_SUCCESS_ENABLED`,
  `MEMORY_MONITOR_ENABLED`, `MEMORY_MONITOR_WARN_RSS_MB`, and
  `MEMORY_MONITOR_DETAILED_TELEMETRY`. The memory warning threshold is a
  deployment concern because it follows the Railway memory tier.

Railway-provided/build-only values such as `PORT`, `RAILWAY_PUBLIC_DOMAIN`,
`RAILWAY_API_PROXY`, and `HOSTNAME`, plus ephemeral local-development values,
are owned by their scripts or platform and are not part of the checked profile.
Seed-only `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME` may be supplied to
`pnpm db:seed`; they are not application runtime configuration.
`PRISMA_BASELINE_RECONCILE=1` is likewise a one-shot migration command flag,
documented in `docs/database-baseline-rollout.md`, not a permanent profile key.

Key generation:

`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

## Workspace members and investments

- `User` is a login account.
- `WorkspaceMember` is access inside workspace.
- `Investment` belongs to `WorkspaceMember`.
- There is no standalone Investors entity anymore.
- A workspace member becomes an investor automatically after first investment.

## Investment share

- UI/analytics show **share of total investments**.
- This is not legal ownership or equity.

## Telegram bots

- Bot tokens are encrypted at rest (AES-256-GCM).
- API responses expose only masked token.
- One bot can manage multiple channels.

## Telegram runtime and public URLs

- `FRONTEND_URL` is the one public web origin. Application URLs are code-owned
  routes below that origin; Finance uses `/finance/:botId` rather than a
  product-specific environment URL.
- `API_PUBLIC_URL` is the canonical public API origin for browser callback and
  webhook flows when it differs from the web origin. There is no legacy alias.
- `NEXT_PUBLIC_API_URL` selects browser-to-API topology at build time. Public
  HTTPS pages never use a configured loopback API: they fall back to
  same-origin `/api`. Railway builds with `/api`; local `localhost:3000` uses
  `http://localhost:4000/api`.
- Workspace and System Bot webhook routes are built from `API_PUBLIC_URL`; there
  are no separate webhook-origin variables while both share the same ingress.
- Workspace bot runtime selection uses `TELEGRAM_BOT_RUNTIME_ENVIRONMENT=LOCAL|PRODUCTION`. Both environments use separate BotFather bots and webhooks while sharing one logical bot's business data.
- Finance consumer authentication uses the same `TELEGRAM_BOT_RUNTIME_ENVIRONMENT` selection as the workspace bot runtime.
- System Bot runtime selection uses `TELEGRAM_SYSTEM_BOT_ENVIRONMENT=LOCAL|PRODUCTION` with distinct `TELEGRAM_SYSTEM_BOT_LOCAL_{TOKEN,USERNAME,WEBHOOK_SECRET}` and `TELEGRAM_SYSTEM_BOT_PRODUCTION_{TOKEN,USERNAME,WEBHOOK_SECRET}` credentials. There is no legacy unsuffixed-token fallback and no polling mode.

Notes:

- Webhook mode requires public HTTPS.
- Workspace bots and the System Bot use webhooks in both LOCAL and PRODUCTION.
- Scheduled Telegram synchronization remains persisted, due-driven work. There
  is no environment-controlled polling interval or status heartbeat.
- Bot should be channel admin for member/admin diagnostics and invite-link management.
- Invite link attribution is most reliable for links created by this system bot.

## Telegram analytics verification checklist

1. Enable webhook: `POST /api/telegram-bots/:id/webhook/enable`.
2. Verify status: `GET /api/telegram-bots/:id/webhook/status`.
3. Create invite link: `POST /api/telegram-channels/:id/invite-links`.
4. Join channel from another account via created invite link.
5. Check raw logs: `GET /api/telegram-channels/:id/update-logs?limit=50&offset=0`.
6. Check member events: `GET /api/telegram-channels/:id/events?limit=50&offset=0`.
7. Publish/edit a post in channel and verify posts endpoint: `GET /api/telegram-channels/:id/posts`.
8. Sync subscriber snapshot: `POST /api/telegram-channels/:id/sync-subscribers-count`.
9. Review aggregate analytics: `GET /api/telegram-channels/:id/analytics`.

Limitations:

- Bot API cannot return full subscriber list.
- Bot API cannot restore old join/leave history.
- Historical post metrics may require MTProto sync.
- Webhook/polling receives only future allowed updates.

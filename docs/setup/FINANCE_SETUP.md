# Finance / Groshly setup

Groshly has its own web host in `apps/standalone/finance/web`. Today its full
consumer API and Telegram dispatcher run in the Nexeloq Nest host
(`apps/api`), with implementation in `products/finance`. The Groshly web origin
proxies `/api/finance/context` and `/api/finance-bots/:id/*` to that host. Browser
and Mini App use the bot-scoped Finance consumer cookie. No Nexeloq admin login
is needed.

The existing consumer tables, logical bot ID, profile IDs, ledger and billing
records are in the compatibility host's `DATABASE_URL`. The standalone
`finance-api` host uses `FINANCE_DATABASE_URL` and has its own analytics and
foundation routes. See the [independence contract](../refactoring/FINANCE_INDEPENDENCE_CONTRACT.md).

## Local commands

Use the repository pnpm version and locked dependencies. Start the checkout's
Docker Compose PostgreSQL and configure root `.env` with a local
`DATABASE_URL` on port 5433. Use an existing local snapshot if you need
previous Finance data. See [local databases](../local-development-database.md).

| Command | Processes | Ports |
| --- | --- | --- |
| `pnpm dev:finance` or `pnpm --filter @telegram-system/finance dev` | Groshly Web and consumer compatibility API | 3001, 4001 |
| `pnpm dev:nexeloq` | Nexeloq Web and API | 3000, 4000 |
| `pnpm dev:all` | Both web hosts and their APIs | 3000, 4000, 3001, 4001 |
| `pnpm dev:finance:tunnel` | Groshly Web/API, LOCAL Finance bot, Cloudflare Quick Tunnel | 3001, 4001, gateway 4100 |
| `pnpm dev:all:tunnel` | Both web/API pairs, two Quick Tunnels, LOCAL Finance and System bots | 3000, 4000, 3001, 4001 |

These commands check the effective `DATABASE_URL`, its local Compose binding
and their listener ports before migration. They run
`pnpm --filter api run db:deploy:safe` on that database before starting either
API. This applies pending Nexeloq schema migrations and checks the resulting
schema. The all-products launcher also generates the shared Prisma client
before either API watcher compiles. The dedicated tunnel launcher retries failed database preparation.
Stop an existing launcher in its own terminal before starting another on the
same ports. A port conflict fails before migration.

Check Finance at `http://localhost:3001/health` and
`http://localhost:3001/api/health`. The proxied
`http://localhost:3001/api/finance/context` additionally requires a configured
LOCAL Finance runtime in the snapshot. Port 4000 can remain offline in
Finance-only mode. Direct development of the independent analytics API and
its separate database migrations are outside these commands.

## LOCAL Telegram acceptance

Copy `products/finance/.env.example` to the ignored
`products/finance/.env.local` if needed. Set
`FINANCE_BOT_RUNTIME_ENVIRONMENT=LOCAL`, `FINANCE_BOT_LOCAL_USERNAME`, and
`FINANCE_BOT_LOCAL_TOKEN` for a distinct BotFather test bot. Keep production
secrets in their production configuration. Install `cloudflared` and stop the
previous LOCAL webhook owner before running `pnpm dev:finance:tunnel`.

The tunnel reads the configured LOCAL token, verifies the Telegram username
and requires any previous webhook owner to release it. It attaches the LOCAL
runtime to the existing Finance integration on the local snapshot, using that
integration's ID for browser data and Mini App authentication. If the snapshot
has no Finance integration, the existing bootstrap uses
`FINANCE_BOT_DASHBOARD_WORKSPACE_ID` from the API environment. The launcher
activates and cleans up only the selected LOCAL runtime. Ordinary
`pnpm dev:finance` does not reconcile Telegram webhooks.

1. Open `/login` on the emitted HTTPS origin. Open the Telegram link, then
   press **Start** in that bot chat. Verify the same profile after reload,
   then log out and repeat the login.
2. Send bare `/start` and open the Mini App from the bot menu. Verify the
   same profile and invoke **Accounts** or another read-only bot command.
3. In that local profile, create one marked ledger record, reload and verify
   it exists exactly once. Remove the test record if it was created on a
   valuable local snapshot.
4. Stop the launcher with Ctrl-C. Check webhook cleanup and that ports 3001,
   4001 and 4100 are released.

The `pnpm dev:all:tunnel` dashboard checks the LOCAL and PRODUCTION bot
credentials for Nexeloq and Finance at startup. An invalid token shows the
environment variable and file to update. Only validated LOCAL bots can
attach to the generated tunnel. The PRODUCTION row reflects the remote
webhook, and the launcher leaves it under the production host's control.

## Production acceptance preparation

Current Railway services are **Nexeloq API** (`api.nexeloq.com`) and the
standalone **Finance API** (`api.groshly.nexeloq.com`). Prepare the Groshly
web build with `NEXT_PUBLIC_FINANCE_API_URL=/api` and an HTTPS
`FINANCE_API_PROXY_URL` pointing to the verified compatibility API.
For the current topology that API is Nexeloq, whose
`TELEGRAM_BOT_RUNTIME_ENVIRONMENT` must select `PRODUCTION`. Keep the existing
`DATABASE_URL` and session/token encryption configuration. Record the
production bot's current webhook owner and destination before any change. Only
one host can own a token's webhook. For rollback, restore the recorded proxy
target and the prior owner and webhook configuration. Deploy and verify the
selected version in the production acceptance task.

If Telegram rejects the production Groshly bot token, verify the replacement
with BotFather and set `FINANCE_BOT_PRODUCTION_TOKEN`,
`FINANCE_BOT_PRODUCTION_USERNAME`, and the existing
`FINANCE_BOT_DASHBOARD_WORKSPACE_ID` on the compatibility API. Startup
verifies the Telegram bot's identity, preserves the logical Finance integration,
and activates the replacement token. The same token must not be operated by
two hosts. Verify `getWebhookInfo` against the expected HTTPS runtime route,
then check browser/PWA sign-in and open the Mini App directly from the Telegram
menu. A Telegram launch uses signed launch data without opening a bot chat.

While Telegram sign-in is unavailable, a signed-in Groshly browser can transfer
access through **Profile → Sign in on another device**. Scan the private QR on
the target phone or enter its code at **Login → Use a code from another device**
in the browser or installed PWA. Confirm on the target device. The existing
server transfer expires in ten minutes and can be consumed once. The QR
credential is in the URL fragment and is removed before use. Generation and
redemption each occur only after a user action and add no recurring work.

The standalone API remains independent of the customer path during recovery.
Before any future data cutover, run the read-only
`pnpm --filter finance-api migration:plan`, verify source/destination identity,
take a restorable backup, and rehearse against staging. The target schema must
represent all required Finance relations before copying data or changing the
webhook owner.

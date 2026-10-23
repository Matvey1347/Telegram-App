# Finance: isolated local and deployment setup

Finance is a separate deployable foundation. Its hosts are `apps/standalone/finance/api`
and `apps/standalone/finance/web`; `products/finance` remains the product implementation.
Finance owns separate selected LOCAL and PRODUCTION Telegram bot credentials.
The browser uses the Finance root URL; the selected bot identity is server-side
and never appears in a public route. Remaining legacy UI/API compatibility and
billing migration are tracked in `docs/refactoring/FINANCE_INDEPENDENCE_CONTRACT.md`.

## Local profiles and commands

Keep Nexeloq values in the existing root `.env`. Do not add a `FINANCE_*` key
there. Create one ignored Finance product profile from its template:

```sh
cp products/finance/.env.example products/finance/.env.local
pnpm env:check
```

`FINANCE_DATABASE_URL` must point to a dedicated disposable local database or
dedicated Finance Neon database, never to Nexeloq `DATABASE_URL`. Generate
independent 32+ character secrets. `NEXT_PUBLIC_*` is public and must never
contain a secret. Configure `FINANCE_BOT_LOCAL_*` and
`FINANCE_BOT_PRODUCTION_*` with two distinct BotFather bots; never reuse a
System Bot token.

| Command                                                            | Processes                                                            | Ports                            |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------- |
| `pnpm dev:nexeloq`                                                 | Nexeloq Web + API                                                    | 3000 + 4000                      |
| `pnpm dev:finance` or `pnpm --filter @telegram-system/finance dev` | Finance Web, compatibility API, and standalone Finance analytics API | 3001 + 4001 + 4002               |
| `pnpm dev:all`                                                     | Nexeloq Web/API plus all three Finance hosts                         | 3000 + 4000 + 3001 + 4001 + 4002 |
| `pnpm dev:all:tunnel`                                              | All local hosts plus a Cloudflare Quick Tunnel for each web app      | 3000 + 4000 + 3001 + 4001 + 4002 |
| `pnpm dev:finance:tunnel`                                          | Finance Web, APIs, and LOCAL Finance bot via HTTPS tunnel            | 3001 + 4001 + 4002               |

Each command checks its target ports first and terminates its child process
group on Ctrl-C. Tunnel commands first stop this workspace's existing local
development listeners and wait for those ports to clear. A listener outside
this workspace is left running and reported as a port conflict. The Finance
command does not apply migrations automatically.
With a dedicated development database, explicitly run
`pnpm --filter finance-api prisma:migrate:deploy` after reviewing the migration.

## Local terminal status

The local launchers present a compact service dashboard instead of forwarding
interleaved Next, Nest, Prisma, and package-manager output. `pnpm dev:all`
shows Nexeloq and Finance in separate columns; each API, analytics host, and
web host moves from waiting to starting to ready only after its health endpoint
responds. Tunnel commands use the same status format for the gateway,
Cloudflare URL, and LOCAL bot activation. A child failure prints the affected
service and a bounded diagnostic excerpt; routine compiler banners, request
logs, and dependency notices do not flood the terminal.

`pnpm dev:all:tunnel` creates one temporary `trycloudflare.com` URL for
Nexeloq Web and one for Finance Web. Each public web app proxies its own
`/api` requests to its local API. It does not activate Telegram runtimes or
change webhooks; use the product-specific bot tunnel commands for that.

Finance Web opens at `http://localhost:3001/`, without a bot ID in the URL.
The local command deliberately disables standalone-host webhook reconciliation:
Telegram webhook activation is explicit and available only through
`pnpm dev:finance:tunnel`, so an ordinary browser-development session never
points a LOCAL bot at a stale deployed URL.
Its production origins are `https://groshly.nexeloq.com/` and
`https://api.groshly.nexeloq.com/` when provisioned. Check `/api/health` and
`/api/health/ready`, then stop `pnpm dev:nexeloq` and repeat the Finance health
request.

## Existing Finance data migration

Before initializing or copying into the Finance database, run the read-only
inventory:

```sh
pnpm --filter finance-api migration:plan
```

It reads the root Nexeloq `.env` database and `products/finance/.env.local`
database independently, verifies that their connection URLs differ, and prints
only table names, column names, and row counts. It never prints credentials or
row contents and never writes to either database.

Do not run `prisma:migrate:deploy` or any copy command against the Finance
database until a source backup location/reference and a restored-staging
rehearsal have been agreed. The target schema must first represent every
legacy Finance relation; copying only profiles, accounts, and transactions
would silently discard categories, payments, investments, and other records.

## Telegram local test boundary

`pnpm dev:finance:tunnel` starts Finance API on port 4001 and Finance Web on
port 3001, opens a Cloudflare HTTPS tunnel through a local gateway, and performs
one explicit activation of the selected LOCAL Finance runtime. The command uses
the selected username from `products/finance/.env.local`; it does not select
the System Bot or a production Finance runtime. On Ctrl-C it performs one
bounded LOCAL cleanup request that removes the local webhook and Mini App
links. Use a local/test bot only; production tokens and URLs must never be
reused locally.

## Railway and Neon

Create separate Railway services (or projects), using the indicated config path:

| Service     | Config                          | Health              | Required variables                                                                                   |
| ----------- | ------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------- |
| Nexeloq     | root `railway.json`             | `/api/health`       | existing Nexeloq profile only                                                                        |
| Finance API | `apps/standalone/finance/api/railway.json` | `/api/health/ready` | `FINANCE_DATABASE_URL`, signing keys, `FINANCE_API_PUBLIC_URL`, and one selected `FINANCE*BOT*{LOCAL | PRODUCTION}\_\*` group |
| Finance Web | `apps/standalone/finance/web/railway.json` | `/health`           | a deliberate same-origin API gateway or a future CORS/auth contract                                  |

Set each service's config path in Railway instead of changing the root Nexeloq
manifest. Finance API runs its own `prisma:migrate:deploy` predeploy command;
take a backup, rehearse on staging, and retain a rollback plan before allowing
it against any shared environment. Confirm the Finance URL resolves to a
different Neon project/database and that neither connection URL equals Nexeloq's.

The Finance Web manifest builds with `/api`, but a deployed web service needs a
same-origin reverse proxy to Finance API before it is user-ready. Direct public
cross-origin API use is intentionally not enabled because the current API has
no CORS/browser-session contract. Do not deploy the web service as a claimed
working customer application until that boundary is implemented and tested.

## BotFather and team workflow

Create separate LOCAL and PRODUCTION bots in BotFather; record their tokens only
in `products/finance/.env.local` locally or in Finance's Railway service
variables, never in a browser variable or root `.env`. Use the Finance root
Mini App URL, not `/finance/<botId>`.

For parallel work, open two VS Code windows from two Git worktrees: one for
Nexeloq and one for Finance. Give each its own `products/finance/.env.local`,
database, ports and test bot. Never copy a
production token, connection string, or webhook secret into the other worktree.

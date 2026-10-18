# Finance independence contract

## Target boundary

`apps/standalone/finance/api` and `apps/standalone/finance/web` are Finance-only hosts in this
monorepo. `products/finance` retains consumer Finance API use cases, bot
presentation, web UI, state, localization, and ledger/billing policy. Nexeloq
continues in `apps/api` and `apps/web`; it must not load Finance runtime code
after the cutover.

The standalone consumer public URL is its root origin (for example
`https://groshly.nexeloq.com/`), with no bot ID in a public route. The existing
Nexeloq `/finance/:botId` route remains a temporary legacy-host compatibility
surface until the complete consumer workflow is cut over. `FINANCE`, existing
Finance record IDs, monetary values, and subscription semantics remain stable.

## Runtime contract

- Finance API owns its own Prisma client and `FINANCE_DATABASE_URL`.
- Finance API owns Finance authentication/session cookies, Finance bot token
  encryption, Telegram webhook verification, update deduplication, paid
  entitlements, refunds, and Finance reminder delivery.
- Finance web calls only Finance API and has no Nexeloq admin routes/providers.
- A selected Finance bot token has exactly one webhook owner. With a selected
  `LOCAL` or `PRODUCTION` Finance runtime and an HTTPS Finance API origin, the
  Finance API reconciles that selected bot's webhook once at startup. It never
  touches System Bot credentials or an unselected Finance bot. Cutover first
  quiesces the former worker and records its prior webhook/configuration;
  rollback restores that recorded owner.
- No new polling or cron is introduced. Existing reminders become Finance-owned
  due-driven delivery only after their data is migrated.

## Data contract and safe migration

Run `pnpm --filter finance-api migration:plan` before any extraction work. It
opens read-only transactions against the root Nexeloq `.env` database and the
Finance product `.env.local` database, proves they are distinct, inventories
Finance-related tables and reports destination schema incompatibilities. It
does not read credentials into output, copy rows, create tables, or change
either database.

Finance DB has local `FinanceBot` and `FinanceTelegramUser` records. Its user
identity is `(financeBotId, telegramUserId)`, never Nexeloq's internal
`TelegramBotUser.id`. Finance records retain their current IDs where possible;
optional legacy IDs are traceability fields, not FKs to Nexeloq.

The extraction migration is a separate, idempotent command. It must perform a
source backup, dry-run counts, source/destination integrity checks, a restored
staging rehearsal, and a recorded rollback plan before a production run. It
migrates bot/runtime, Telegram users, profiles, catalog/ledger, dependent
Finance records, AI/billing records, then pending delivery state. It checks
counts, profile uniqueness, orphan references, monetary sums, and entitlement
states. It does not alter or drop Nexeloq tables.

## Incremental completion rule

Scaffolding a host does not prove isolation. Do not retire the Nexeloq Finance
module or claim standalone production readiness until Finance API starts with
only a Finance DB, authenticates a consumer session, writes an account and
transaction, deduplicates a signed Telegram update, processes idempotent paid
and refund events, and Finance web builds/renders without Nexeloq API or web.

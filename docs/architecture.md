# Architecture

## Overview

Telegram System is a pnpm monorepo with a NestJS API in `apps/api`, a Next.js frontend in `apps/web`, and shared TypeScript contracts in `packages/shared`.

The current architecture is service-oriented rather than heavily layered: controllers call module services, module services orchestrate domain logic and Prisma access, and Telegram-specific protocol logic lives in shared Telegram adapters.

## Backend module boundaries

- Business modules are grouped under `apps/api/src/domains`: `identity`, `workspace`, `finance`, `growth`, `telegram`, and `operations`.
- `apps/api/src/domains/telegram/telegram-channels`: main Telegram channel domain service. Owns import, sync, managed posts, stats, and channel-facing orchestration.
- `apps/api/src/telegram/shared`: Telegram adapter layer. MTProto/Bot API specifics, parsing, entity resolution, formatting, and helper utilities belong here.
- `apps/api/src/domains/telegram/telegram-user-accounts` and `apps/api/src/domains/telegram/telegram-bots`: manage Telegram identities and credentials, then hand channel operations off to channel services.
- `telegram-bots` is divided into `core`, `greeter`, and `finance`; one Nest module remains the composition root so shared runtime and delivery providers are not duplicated.
- Other feature modules keep their own service/controller boundaries inside the matching domain group and use shared workspace/auth primitives.
- `apps/api/src/common`: workspace resolution, auth helpers, security utilities, caching, and shared backend primitives.

## Data flow: API -> service -> adapter -> Prisma

Typical backend flow:

1. Nest controller validates DTOs and authentication.
2. Feature service resolves workspace/user context.
3. Service performs domain logic and selects the correct adapter/helper.
4. Telegram-specific behavior goes through `src/telegram/shared/*`.
5. Persistence goes through Prisma models and migrations in `apps/api/prisma`.

Cross-cutting behavior should be centralized in one service/helper layer instead of repeated in multiple controllers or feature methods.

## Telegram entity identity

Telegram channel identity is based on Telegram channel ID, not mutable username or invite link.

The current stable resolution pattern is:

1. resolve by known dialog/channel ID for the connected account;
2. use stored peer/access hash when available;
3. fall back to username when still valid;
4. use invite link only when necessary and safe.

Mutable metadata such as `username`, `inviteLink`, `accessMode`, `requiresJoinRequest`, and `telegramAccessHash` should be refreshed after successful resolution.

## Telegram bot runtime environments

`TelegramBotIntegration` is the logical product bot. It owns the workspace,
application type, Finance/Greeter configuration, Telegram users, profiles and
other business data shared by every environment. BotFather credentials and
Telegram infrastructure state belong to `TelegramBotRuntimeInstance` instead.

Each logical bot may have at most one `LOCAL` and one `PRODUCTION` runtime.
Webhook URLs contain the runtime instance id, so an incoming update is resolved
to an environment before dispatching to the shared application handler. The
process operates only the environment selected by
`TELEGRAM_BOT_RUNTIME_ENVIRONMENT`; a local process cannot load, reconcile or
send through a production runtime.

Webhook-driven deliveries persist their originating runtime. Scheduled and
background deliveries do not duplicate per runtime: they use the authoritative
`PRODUCTION` runtime. Active credentials are held in a narrow in-process
registry, refreshed on runtime mutation with an environment-scoped database
fallback on cache miss. Startup reconciliation is bounded, environment-scoped,
and does not add status polling, heartbeat writes or per-bot workers.

The bot-list read model contains both compact runtime presentations, so a
logical bot renders once and switching environments does not create client-side
per-runtime HTTP joins. An explicit `Check` targets only the selected runtime
and returns its compact authoritative result. Runtime timestamps mean
"last checked" or "last real update"; they are intentionally not a live
heartbeat. Finance Web App availability and BotFather Telegram Mini App/menu
configuration are independently represented because either may be healthy while
the other is not.

The System Bot is not a workspace logical bot and remains env-managed rather
than persisted as editable credentials. Its dashboard presentation exposes the
two environment configurations and the environment serving the current process,
while secrets remain masked and non-editable.

## Frontend data flow

- Route pages use URL-preserving groups under `apps/web/src/app/(identity|workspace|finance|growth|telegram|operations)`.
- Shared API requests live in `apps/web/src/lib/api.ts`.
- Domain API facades and workflow helpers live in `apps/web/src/lib/features/<domain>`.
- Shared state/feedback lives in `apps/web/src/providers`.
- Domain UI lives in `apps/web/src/components/features/<domain>`; genuinely reusable UI remains in `components/ui`, `components/icons`, and `components/layout`.

When the same UI behavior appears on multiple pages, move it into a shared component or provider rather than patching each page independently.

## React Query ownership

- React Query client setup lives in `apps/web/src/providers/query-provider.tsx`.
- Query persistence and workspace-scoped cache decisions also live there.
- Pages should describe query keys and business intent, but cache ownership and persistence rules belong to the provider layer.

Changes that affect all loading/caching behavior should be made in the provider or shared query utilities, then validated with focused tests.

## Global operation feedback

- Global toast and progress feedback is owned by `apps/web/src/providers/toast-provider.tsx`.
- Mutation feedback events are emitted from `apps/web/src/lib/api.ts`.
- Progress sequencing helpers live in `apps/web/src/lib/progress.ts`.

If operation feedback must change globally, update the provider/lib layer and remove page-local copies.

## Shared contracts

`packages/shared` should contain stable contracts consumed by more than one app, especially:

- bulk action result types;
- operation/sync result types;
- channel access mode;
- other response types that must stay consistent across API and web.

Do not move backend-only DTOs into shared unless the frontend truly consumes the same contract.

## Migrations

- Prisma schema is the source of truth for new fields and relations.
- Every schema change needs a migration.
- Old paths may stay temporarily during migration, but should be removed after the new contract is live.
- If local migration history diverges from `_prisma_migrations`, prefer a deliberate repair instead of silently editing historical SQL.
- The current history starts at `000000000000_squashed_migrations`. A partial
  unique index for `TelegramManagedPost.remoteImportKey` is intentionally kept
  in that SQL because Prisma Schema Language cannot represent its predicate.
- Production reconciliation is documented in
  `docs/database-baseline-rollout.md`; never reset or delete migration-history
  rows to adopt the baseline.

## Error handling

- Controllers should return safe, user-facing errors.
- Services should convert adapter/Prisma failures into domain-meaningful exceptions when possible.
- Generic 500s are acceptable only after specific, expected failure modes were considered.
- Structured operation results are preferred for multi-step sync or bulk flows.

## Observability

Current observability is application-log based:

- Nest logger messages for sync/import flows;
- source attribution persisted through Telegram source access/data source records;
- progress streaming for long-running frontend actions.

When adding long-running or failure-prone behavior, include safe logging and observable status fields rather than hidden best-effort work.

## Background and long-running operations

- Cron/background work lives in `apps/api/src/domains/telegram/telegram-sync` and related services.
- Streamed operations use NDJSON progress endpoints from the API and progress toasts in the web app.
- Multi-step flows should report per-step status and not fail the whole operation when optional capabilities are unavailable.

## How to add a feature safely

1. Read the owning module, adjacent files, and existing tests.
2. Search usages with `rg`.
3. Decide whether the change is local, domain-level, schema/API, or cross-cutting.
4. Reuse existing shared layers before adding another path.
5. Update shared contracts if both API and web consume the same shape.
6. Add tests for happy path, failure path, and the reported regression.
7. Run the relevant checks:
   - UI-only: `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test -- --run`
   - API/domain: `pnpm --filter api test -- --runInBand && pnpm --filter api build`
   - schema/API: `pnpm db:generate && pnpm check`
8. Remove duplicated old behavior once the new path is in place.
9. Write manual QA steps in the final handoff.

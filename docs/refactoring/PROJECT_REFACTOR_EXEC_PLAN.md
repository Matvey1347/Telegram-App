# Project Refactor ExecPlan

Updated: 2026-08-22

## Current State

`telegram-system` is a pnpm monorepo with:

- `apps/api`: NestJS API with Prisma and Telegram Bot/MTProto integration.
- `apps/web`: Next.js App Router frontend with React Query and Tailwind v4 CSS.
- `packages/shared`: serializable cross-stack contracts.

The main architectural issue is concentrated handwritten production files that combine unrelated responsibilities. The former 12978-line Telegram channels god-service is now a 252-line compatibility facade over focused use-case providers. The largest remaining backend file is `apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.ts` at 5884 lines; the largest frontend file is `apps/web/src/app/(internal)/(telegram)/telegram-posts/page.tsx` at 8379 lines.

## Metrics Before Refactoring

Measured before edits:

| Metric                              |                                                                                  Count |
| ----------------------------------- | -------------------------------------------------------------------------------------: |
| Handwritten production TS/TSX files |                                                                                    275 |
| Files > 500 lines                   |                                                                                     32 |
| Files > 1000 lines                  |                                                                                     17 |
| Files > 2000 lines                  |                                                                                     10 |
| Files > 3000 lines                  |                                                                                      8 |
| Largest backend file                | `apps/api/src/domains/telegram/telegram-channels/telegram-channels.service.ts` - 11019 |
| Largest frontend file               |                           `apps/web/src/app/(telegram)/telegram-posts/page.tsx` - 6775 |

## Metrics After Current Milestone

| Metric                              |                                                                                  Count |
| ----------------------------------- | -------------------------------------------------------------------------------------: |
| Handwritten production TS/TSX files |                                                                                    675 |
| Files > 500 lines                   |                                                                                     55 |
| Files > 1000 lines                  |                                                                                     16 |
| Files > 2000 lines                  |                                                                                      7 |
| Files > 3000 lines                  |                                                                                      5 |
| Largest backend file                |        `apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.ts` - 5884 |
| Largest frontend file               |                `apps/web/src/app/(internal)/(telegram)/telegram-posts/page.tsx` - 8379 |

`TelegramChannelsService` was reduced from 12978 lines to a 252-line explicit
delegation facade. Its file-size baseline and both direct GramJS import
exceptions were removed; all newly extracted channel production files remain
below 500 lines. `apps/web/src/lib/api.ts` was reduced from 3575 lines and is currently 764
checker-counted lines after extracting type-only API contracts, focused endpoint
facades, and the neutral HTTP transport. The temporary 1486-line
`apps/web/src/lib/api-types.ts` type warehouse was split into domain modules,
leaving a small compatibility barrel. `packages/shared/src/types/telegram-ad-sales.ts`
is currently 836 lines after moving CRM contracts to `telegram-ad-sales-crm.ts`.
`apps/api/src/domains/growth/ad-campaigns/ad-campaigns.service.ts` is currently
1859 lines after focused extraction. Transitional architecture allowances remain
shrinking-only; current project-wide `pnpm architecture:check` still fails on
exactly two older oversized files that grew before this slice.

## Large Files

### 3000+ Lines

- `apps/web/src/app/(internal)/(telegram)/telegram-posts/page.tsx` - posts page, composer, calendar, groups, bulk operations, scheduling modals.
- `apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.ts` - products, pricing, inventory, analytics, CRM, sales lifecycle, payments.
- `apps/web/src/app/(internal)/(telegram)/telegram/channels/[id]/page.tsx` - channel detail, analytics, settings, posts, access and sync modals.
- `apps/web/src/app/(internal)/(telegram)/telegram-channels/page.tsx` - channel catalog, networks, accounts/bots, import/export, composer.
- `apps/api/src/telegram/shared/telegram-mtproto.client.ts` - login, dialogs, channel resolution, stats, invite links, publishing/edit/delete/media.
- `apps/web/src/components/features/growth/ad-sales/ad-sales-page.tsx` - ad sales tabs, calendar, settings, pricing, analytics, lifecycle flows.

### 2000+ Lines

- All files above.
- `apps/web/src/app/(internal)/(growth)/ad-campaigns/page.tsx` - campaigns/promos/hypotheses page state, tables, modals, analytics.

### 1000+ Lines

- All files above.
- `apps/api/src/domains/growth/ad-campaigns/ad-campaigns.service.ts`
- `apps/web/src/components/ui/primitives.tsx`
- `apps/web/src/components/features/growth/ad-campaigns/campaigns-table.tsx`
- `apps/api/src/domains/telegram/telegram-user-accounts/telegram-user-accounts.service.ts`
- `apps/web/src/components/features/telegram/telegram/telegram-account-panels.tsx`
- `apps/web/src/components/icons/icon-picker.tsx`
- `apps/web/src/components/features/growth/ad-sales/ad-sale-modal.tsx`
- `apps/api/src/domains/growth/ad-campaigns/ad-campaign-admission-analytics.service.ts`

### 500+ Lines

The full machine-readable list is in `docs/refactoring/codebase-inventory.json`.

## Target Architecture

Backend target:

- Business modules are physically grouped under `src/domains/{identity,workspace,finance,growth,telegram,operations}` while shared infrastructure remains in `src/common`, `src/prisma`, and `src/telegram/shared`.
- Telegram Bot code is grouped into `core`, `greeter`, and `finance` behind one Nest composition module.
- Controllers remain thin and delegate to application services.
- `TelegramChannelsService` becomes a compatibility facade while behavior moves into use-case services: channel catalog, import, sync orchestration, invite-link sync, managed posts, managed post publishing, post groups, analytics queries.
- `TelegramAdSalesService` decomposes into product/pricing, inventory, lifecycle, payments, analytics and CRM services.
- MTProto remains behind a single injectable facade while implementation moves into auth, channels, posts, invite links, publishing and stats adapters.
- Workspace isolation remains explicit on every Prisma read/write.

Frontend target:

- Public routes retain their URLs through App Router groups, while domain components and clients live under `components/features/*` and `lib/features/*`.
- Page files read params/search state and render feature containers.
- Data fetching and mutation invalidation move into feature hooks.
- Domain clients remain behind one base API client; endpoint facades are split by domain.
- Query keys are created through typed factories in `apps/web/src/lib/query-keys.ts`.
- Reusable selectors and pickers are composed from existing primitives before adding new UI.

## Architecture Guard Policy

- Recommended handwritten production file size: 100-400 lines.
- Warning threshold: over 500 lines.
- Hard policy: over 800 lines.
- App Router `page.tsx` policy: 300 lines.
- API compatibility facade policy: 400 lines.
- Type barrel/index policy: 250 lines; UI barrel policy: 150 lines.
- `pnpm architecture:check` runs in transitional mode. Current oversized files are baseline entries that may shrink but may not grow.
- `ARCHITECTURE_STRICT=1 pnpm architecture:check` runs the final policy with no transitional baseline and currently fails until the remaining god files are decomposed.
- The transitional baseline must only decrease. Adding entries requires a documented deviation and is not acceptable for completed refactoring.

## Contracts That Must Not Break

- Existing API URLs, response shapes and status codes.
- Workspace scoping via `X-Workspace-Id` and `WorkspaceService`.
- Telegram sync stages and retry/rate-limit behavior.
- Managed post publish/schedule/edit/delete semantics.
- Invite link attribution and campaign linkage.
- Ad sales pricing, availability, payment and transaction behavior.
- Frontend routes and query key cache semantics.

## Completed Decisions

- Consolidate backend source layout into six domain groups without merging independent Nest provider scopes or changing API routes.
- Split the flat Telegram Bots directory into `core`, `greeter`, and `finance`, keeping `telegram-bots.module.ts` as the single composition root.
- Consolidate frontend routes with URL-transparent App Router groups and organize feature components/API clients by the same domain vocabulary.
- Keep `apps/web/src/lib/api.ts` as a compatibility facade while extracting type-only contracts.
- Introduce `apps/web/src/lib/api-types.ts` for frontend API-facing serializable types currently owned by the web client.
- Extract `applicationLogsApi` to `apps/web/src/lib/features/operations/application-logs-api.ts` while preserving `@/lib/api` compatibility exports.
- Introduce `apps/web/src/lib/query-keys.ts` as the global query-key factory module.
- Adopt query-key factories in auth, member select, Telegram access/channel invalidation, Telegram ad-sales invalidation and Telegram channel detail data flows while preserving the existing array key values.
- Align Telegram channel invite-link cache invalidation with the canonical `telegram-channel-invite-links` workspace-scoped key used by the channel detail page and query provider.
- Extract invite-link history payload construction from `AdCampaignsService` into `apps/api/src/domains/growth/ad-campaigns/invite-link-history.ts` with focused characterization tests.
- Add `scripts/check-architecture.mjs` as a baseline-aware guard. Existing legacy files above limits are tracked as shrinking-only transitional entries; new files above hard policy and legacy growth fail.
- Add project-scoped Codex agent definitions under `.codex/agents`.
- Assign stable project call-signs in `.codex/agents`: Linus Backend, Ada Frontend, Dieter Design, Grace Explorer and Turing Review.
- Extract `telegramAdSalesApi` from `apps/web/src/lib/api.ts` to `apps/web/src/lib/features/growth/telegram-ad-sales-api.ts` while preserving the `@/lib/api` compatibility export.
- Extract workspace, finance, prompt-notes, Telegram channels, Telegram source/account, marketing and Ad Sales endpoint implementations from `apps/web/src/lib/api.ts` while preserving `@/lib/api` compatibility exports.
- Extract Telegram Ad Sales CRM shared contracts from `packages/shared/src/types/telegram-ad-sales.ts` to `packages/shared/src/types/telegram-ad-sales-crm.ts`.

## Validation Baseline

Pre-existing results before implementation:

| Command                                 | Result                                                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`        | pass                                                                                                                             |
| `pnpm db:generate`                      | pass                                                                                                                             |
| `pnpm --filter api test -- --runInBand` | pass: 30 suites, 209 tests                                                                                                       |
| `pnpm --filter api lint`                | fail: 5680 errors, 251 warnings, mostly pre-existing prettier/unsafe any                                                         |
| `pnpm --filter api typecheck`           | pass after correcting the `telegram-ad-sales.service.spec.ts` mocked `OVERDUE_PAYMENT.scheduledAt` to match the service contract |
| `pnpm --filter api build`               | pass                                                                                                                             |
| `pnpm --filter web test -- --run`       | pass: 18 files, 89 tests                                                                                                         |
| `pnpm --filter web lint`                | fail: 190 errors, 101 warnings, mostly pre-existing explicit any/react compiler rules                                            |
| `pnpm --filter web typecheck`           | pass                                                                                                                             |
| `pnpm --filter web build`               | pass                                                                                                                             |

## Progress By Milestone

- Milestone 1 - Baseline: completed. Inventory JSON, baseline checks and risk map created.
- Milestone 2 - Agent and architecture guidance: completed for AGENTS, `.codex/agents`, design-system docs and architecture check.
- Milestone 3 - Frontend primitives: started. Query key factories added and adopted in central invalidation/auth/member select/ad-sales invalidation/channel detail.
- Milestone 4 - Frontend migration: started. Routes, feature components, API clients and API types are now grouped by domain; large page decomposition remains.
- Milestone 5 - Backend decomposition: started. Backend modules are grouped by domain, Telegram Bots is split into product folders, and the Telegram channels god-service is decomposed; Telegram ad-sales and MTProto remain.
- Milestone 6 - Shared contracts: planned; no cross-stack API shape changes made.
- Milestone 7 - Final review: partial validation completed.

## Telegram Logical Bot / Runtime Split

- Introduced environment-scoped runtime instances so one logical Finance or
  Greeter bot shares business data while `LOCAL` and `PRODUCTION` keep distinct
  BotFather identities, tokens, webhooks and runtime state.
- Migrated existing integration infrastructure state into a `PRODUCTION`
  runtime and made update idempotency runtime-aware.
- Routed webhook responses through their origin runtime while keeping scheduled
  deliveries production-authoritative and non-duplicated.
- Replaced local production-webhook rebinding and System Bot polling with
  explicit local webhook configuration. Runtime reconciliation remains a
  bounded startup/configuration event with no recurring database activity.
- Completed the management presentation around one logical bot card with
  `PRODUCTION`/`LOCAL` runtime selection. The compact list model avoids
  per-card status requests; explicit checks and configuration mutations patch
  the selected runtime rather than broadly invalidating bot queries. Web App
  availability and Telegram Mini App/menu configuration are shown separately.
- Documented the System Bot as a separately env-managed integration: its UI can
  identify the selected process environment and last-known status, but cannot
  edit or reveal environment credentials. No status heartbeat or polling was
  added for either bot model.

## Telegram Platform Foundation Completion

- Extracted a canonical workspace full-channel sync use case that reuses the existing single-channel sync orchestration and is shared by Scheduled Tasks and the Telegram System Bot.
- Replaced scheduler evaluation cursors with persisted occurrence timestamps, owner-fenced claims and recoverable run identity; notification delivery is now awaited after terminal run persistence.
- Removed the Greeter feature cron in favor of the distributed Scheduled Tasks infrastructure and added terminal operational-history retention.
- Added recoverable Telegram bot webhook transitions, non-fatal application-update failures, workspace-independent recipient subscriptions and durable System Bot finance selection drafts.
- Added focused backend, shared-contract and frontend regression coverage. The new focused API gate passes 58 tests and the web suite passes 127 tests. The full API suite still exposes five unrelated legacy Telegram channel mock failures in `sync-managed-posts.spec.ts` and `managed-post-history.spec.ts`.

## Greeter Product Completion

- Replaced the Greeter schema/service skeleton with workspace-scoped configuration, persisted permission degradation, idempotent join/CAPTCHA decisions, Greeter-only users and aggregated analytics.
- Added immutable automation versions, acquisition-channel enrollments, isolated draft test sessions, restart-safe execution repair, one-time broadcasts and delivery-to-domain reconciliation.
- Added the canonical `/telegram-bots/[botId]/greeter` management route with focused Overview, Channels, CAPTCHA, Users, Analytics, Automations, Broadcasts and Test Mode components backed by shared contracts and query-key factories.
- Kept new production files below the architecture warning threshold by extracting Greeter read models and focused services. No Finance Bot implementation was started.
- Current Greeter-focused API gate passes 13 suites and 66 tests; the final web suite passes 31 files and 149 tests. The full API suite remains at five unrelated legacy Telegram channel mock failures.

## Finance Product Runtime Slice

- Added verified Telegram Mini App context, a consumer-owned Finance API, derived ledger balances, confirmation-based chat proposals, tenant-scoped core CRUD/aggregation/export, and recurring delivery-queue reminders.
- Added reusable Stripe and Telegram Stars checkout/lifecycle paths, immutable provider price synchronization, internal coupon validation, privacy-safe admin billing reads, and the canonical Finance entitlement boundary.
- Added a bounded OpenAI Responses adapter for structured text and receipt proposals with usage metadata and no raw prompt/receipt persistence.
- Removed the personal-token Monobank adapter and hardcoded bank capability runtime. Bank Import is not exposed as an entitlement.
- Completed the consumer Finance product pass: the Finance bot now provides a Web App entry point and concise chat actions, proposal confirmation is atomic, and the Mini App is decomposed into focused Home, Transactions, Budget, Accounts and More workflows backed by typed consumer contracts and narrow query keys.
- New Finance production files remain below architecture thresholds. The existing project-wide architecture failures and five unrelated Telegram channel tests remain outside this slice.

## Finance Consumer Surface Split

- Split the shared consumer layout into explicit Telegram Mini App and browser Web App shells while retaining one auth/bootstrap container, API client, query-key family and mutation implementation.
- Kept Telegram viewport, safe-area, FAB and bottom-navigation behavior inside the Mini App shell. The browser shell now owns its desktop sidebar, operational header, responsive browser navigation and profile context.
- Added browser-only Reminders and Billing destinations that compose the existing settings/reminder/billing workflows with screen-oriented lazy queries rather than duplicating domain logic.
- Added a bounded desktop transaction table over the existing cursor endpoint. Row details remain user-triggered, so collection rendering adds no per-row HTTP joins.
- The browser Overview continues to use the existing bounded dashboard read model and arranges its account, category, budget, goal and recent summaries in a desktop grid without adding a giant endpoint or bootstrap fan-out.

## Domain Layout Consolidation

- Consolidated backend business modules under `apps/api/src/domains/{identity,workspace,finance,growth,telegram,operations}`. Shared infrastructure remains at `common`, `prisma`, and `telegram/shared` so domain grouping does not blur adapter boundaries.
- Split the former flat `telegram-bots` directory into `core`, `greeter`, and `finance`. Kept one `TelegramBotsModule` composition root to avoid duplicate runtime, registry, and delivery providers.
- Consolidated frontend routes into URL-transparent App Router groups and moved domain UI/API helpers under `components/features/*` and `lib/features/*`.
- Updated source imports, architecture baselines, agent guidance, design-system import examples, the codebase inventory, and architecture documentation to the canonical paths.
- Next.js production route output confirms that all existing public route paths are unchanged.

## Product Boundary Architecture Foundation

- Defined the product/application model in `docs/architecture/PRODUCT_BOUNDARIES.md`: internal Finance and consumer Finance are separate products; Finance and Greeter own their behavior and surfaces; `telegram-bots/core` and `telegram/shared` are platform boundaries rather than product implementation homes.
- Kept this slice architecture-only. No production TypeScript, API contract, public URL, Prisma schema, UI behavior, runtime job, connection, query, write, or deployment service changed.
- Extended `pnpm architecture:check` with fast Node policy tests and a static source scan. The scan resolves relative and `@/` imports without loading TypeScript, starting the application, using the database, or accessing the network.
- Enforced product/platform import direction, the separation of the two Finance products, consumer product UI ownership, low-level Telegram SDK placement, controller/Prisma separation, configuration access, bounded frontend polling, and thin App Router pages.
- Recorded current dependency/presentation/environment/polling debt as exact source/target edges or path/rule occurrence ceilings. Every exception has a reason and removal slice; stale ceilings now fail after a violation shrinks, preventing silent regrowth.
- Lowered every already-shrunk file-size allowance to the current size and removed the obsolete allowance for `managed-posts-import-modal.tsx`, which is now below the 800-line hard limit. No file-size allowance was increased.
- The pre-existing architecture failure remains exactly three file-growth violations: `telegram-channels.service.ts` (12978 vs 12788), `telegram-posts/page.tsx` (8379 vs 8370), and `primitives.tsx` (1962 vs 1936).
- Added focused regression coverage for platform-to-product and product-to-product imports, the two-Finance boundary, consumer UI ownership, Telegram SDK placement, Prisma-backed controllers, scattered environment reads, frontend polling, and page-level query/API orchestration.

## Consumer Finance Product Isolation

- Moved Consumer Finance business and HTTP implementation out of the flat
  `telegram-bots/finance` directory into
  `domains/telegram/consumer-finance/{identity,ledger,transfers,catalog,planning,analytics,ultimate,ai,billing,chat-flows,i18n,http,telegram-presentation}`.
  The original `telegram-bots/finance` path now contains only the Finance-owned
  Telegram update/presentation adapter.
- Replaced bot-core imports of Finance and Greeter implementations with narrow
  handler and presentation ports wired in `telegram-bots.module.ts`. Finance
  commands, menus, locale selection and local lifecycle copy are product-owned.
  The chat-flow writer/service cycle was removed through a product-owned types
  module.
- Kept durable reminder delivery sequencing in the platform while moving the
  reminder month calculation, localized payload and Prisma write into Finance.
  The remaining `financeReminderId`/delivery-port seam mirrors the existing
  persisted schema and preserves post-success idempotency without a generic
  plugin framework or new recurring work.
- Gave the browser Web App and Telegram Mini App a Finance-owned presentation
  layer: controls, dates, modal, surfaces/states, icon/avatar wrapper, Unicode
  emoji picker, visual tokens, toast and QueryClient. The two shells remain
  separate and retain their existing URL/bootstrap/session behavior.
- Split the consumer HTTP facade into focused Finance-owned auth, ledger,
  planning and insights clients over one neutral low-level web transport.
  Finance now owns its query keys and money/date/cache helpers; internal Finance
  and bot administration no longer import consumer implementation or the
  reverse.
- Split the shared `consumer-finance` contract warehouse into cohesive identity,
  billing, ledger, transfers, planning, analytics and Ultimate type modules,
  retaining the original public type barrel and serializable API shapes.
- Removed every transitional Consumer Finance import exception. The architecture
  gate now recognizes both the Finance product root and its adapter, forbids
  business-to-adapter direction, and enforces Finance-owned web UI/provider/API/
  query boundaries with focused regression tests.
- No Prisma schema or migration changed. No route, cookie, HTTP status, Telegram
  command/callback, Stripe redirect, entitlement, AI, money, locale, reminder or
  analytics contract was intentionally changed.

## Environment Configuration Contract

- Reduced the checked runtime profile from 48 template keys to 28 keys. The
  remaining profile contains only credentials, deployment/network topology,
  runtime selection, logging controls, and deployment-sensitive monitoring.
- Removed ignored nested web environment files and made web-only local topology
  explicit in the root script. The profile checker now rejects extra `.env*`
  files at the root and app-package levels.
- Established `FRONTEND_URL` as the single public web origin and
  `API_PUBLIC_URL` as the single public API origin. Product URLs are built from
  application routes; workspace and System Bot webhooks use the canonical API
  origin rather than separate ingress aliases.
- Removed product-specific URL/gateway configuration and legacy Telegram sync
  flags. Telegram remains webhook- and due-driven; no polling interval,
  heartbeat, worker, or compatibility runtime was reintroduced.
- Moved capability refresh limits, log buffering/retention, memory sampling and
  recovery, and operational-history retention to focused code constants. The
  memory warning threshold remains deployment configuration because it follows
  the Railway memory tier.
- Unified browser API resolution in a neutral HTTP helper. Localhost continues
  to use the local API; a public HTTPS page cannot call a loopback API and uses
  same-origin `/api`; Railway and separately deployed HTTPS APIs remain
  supported.
- Added pure deployment-origin and environment-contract tests. Configuration
  remains startup/build-time logic with no database-backed settings, polling,
  watchers, persisted history, or new process.

## Risks

- The two largest backend services have broad Prisma and Telegram side effects. They need characterization tests before behavioral extraction.
- Existing lint/typecheck failures make CI noisy. New checks must be judged against this baseline until lint debt is separately fixed.
- Large frontend pages contain local components with shared closure state; mechanical splitting can easily change UI behavior.
- MTProto adapter split is high-risk and should happen behind a facade after adapter tests are expanded.
- Consumer Finance still has cohesive-decomposition debt in several 500–794-line
  files. They remain below the hard limit and did not grow; later slices should
  split them around characterized use cases rather than mechanical line count.
- The durable delivery schema still exposes `financeReminderId` to bot core.
  Core depends only on a narrow continuation port and no Finance implementation;
  removing the discriminator itself would require a separately justified schema
  migration.
- Existing within-product dependency cycles remain in Greeter
  automation/enrollment/sequence services. The Consumer Finance chat-flow
  writer/service cycle was removed in this slice.

## Deviations

- The architecture check uses a transitional shrinking-only baseline for existing files above limits. This is intentional because the repository still has large production files; `ARCHITECTURE_STRICT=1 pnpm architecture:check` enforces the final no-exception policy and currently fails until decomposition is complete.
- Remaining high-risk backend god-service decomposition for Telegram ad sales and MTProto still requires characterization tests around publishing/payment and protocol behavior before moving side-effectful logic.
- Static source rules intentionally target low-noise syntactic violations. Semantic broad invalidation, N+1 HTTP, workspace isolation, transaction preservation, circular runtime dependencies, and false shared abstractions remain mandatory integration-review checks.

## Telegram Channels God-Service Decomposition

- Replaced the 12978-line `TelegramChannelsService` implementation with a
  252-line compatibility facade whose 78 public methods explicitly delegate to
  focused Nest providers. The controller and HTTP DTO/status/response contracts
  remain unchanged.
- Split channel ownership into catalog/lifecycle/financial reads, source access,
  schema compatibility, import policy/preparation/import, insights/content read
  models, workbook writing, historical sync, sync orchestration, post metrics
  and broadcast statistics.
- Split invite ownership into attribution, campaign commands, persistence,
  snapshot/history compatibility and remote sync. Requested-count and missing
  snapshot-table fallbacks have one persistence owner rather than duplicated
  read/sync branches.
- Split managed-post ownership into presentation/rendering, revisions, import,
  commands/history, queries/calendar/links, publishing transport, bulk/group
  operations, moves/deletion, remote scheduled import, reconciliation and
  auto-repair. Existing Telegram identity semantics remain in the focused
  identity service.
- Rewired account, scheduled-task, System Bot, workspace sync, daily analytics,
  user-account, Ad Sales and calendar-planner callers to their narrow use-case
  providers. The facade is retained only for the HTTP compatibility surface.
- Routed HTML parsing through `telegram/shared/telegram-html-parser.ts`, removing
  both direct GramJS domain imports and their exact architecture exceptions.
- Removed the Telegram channels file-size allowance entirely and lowered the
  already-shrunk Telegram user-account allowance from 1193 to 1179 checker
  lines. Every newly extracted production file is below 500 physical lines; no
  new transitional allowance was added.
- Characterization coverage preserves required/optional sync step sequencing,
  publication compensation after remote success/local failure, workspace-scoped
  channel update transactions, missing revision storage, atomic invite
  reattribution, post-group creation/attachment and group-move rollback.
- Private Telegram invite references are redacted at the shared logging boundary;
  regression coverage rejects raw invite URLs and bearer-like hashes in both
  compatibility-persistence warnings and MTProto diagnostic references.
- The refactor adds no schema or API changes, recurring production processes,
  runtime jobs, polling, timers, database operations, snapshots or external calls. The
  existing sequential per-channel pipelines, conditional no-write paths,
  transaction boundaries, due notifications and cache invalidation remain the
  runtime owners.

## Latest Validation

Telegram channels god-service decomposition on 2026-08-22:

| Command / audit                                      | Result                                                                                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| channel/caller/security focused API tests plus AppModule DI smoke | pass: 26 suites, 200 tests                                                                                                                                      |
| `pnpm --filter api test -- --runInBand --silent`     | pass: 139 suites, 865 tests                                                                                                                                                 |
| `pnpm --filter api typecheck`                        | pass                                                                                                                                                                        |
| `pnpm --filter api build`                            | pass                                                                                                                                                                        |
| `node --test scripts/architecture-policy.test.mjs`   | pass: 16 focused policy tests                                                                                                                                               |
| `pnpm architecture:check`                            | expected fail only: the two unrelated existing web growth violations in `telegram-posts/page.tsx` and `primitives.tsx`; Telegram channels has no allowance or import exception |
| `ARCHITECTURE_STRICT=1 pnpm architecture:check`      | expected repository-debt failure; the decomposed facade and every new channels production file satisfy their applicable limits                                             |
| Telegram channels static import graph                | pass: 65 production TypeScript files, zero cycles                                                                                                                           |
| facade surface audit                                 | pass: 78 declarations and 78 assignments with no missing, extra or duplicate delegate                                                                                       |
| extracted-file lint audit                           | actionable/format findings removed; relocated `no-unsafe-*` findings reduced from 427 in the monolith to 425 across extracted implementation files, with no disables or exceptions; the compatibility facade retains legacy inferred-`any` delegate assignments |
| `git diff --check`                                   | pass                                                                                                                                                                        |

No Prisma schema or shared HTTP contract changed, so database generation and
frontend gates are not required for this slice.

Environment configuration contract on 2026-08-22:

| Command                                            | Result                                                                                                                                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm env:check`                                   | pass: `.env` and `.env.example` synchronized at 28 key names without printing values                                                                                                                       |
| `pnpm test:deployment`                             | pass: 7 origin/profile regressions plus Railway artifact verification                                                                                                                                      |
| `pnpm --filter api test -- --runInBand`            | pass: 135 suites, 849 tests                                                                                                                                                                                |
| `pnpm --filter web test -- --run`                  | pass: 79 files, 365 tests                                                                                                                                                                                  |
| `pnpm --filter api typecheck`                      | blocked only by the pre-existing unrelated mock typing error in `telegram-channels/import-managed-posts.spec.ts:389`                                                                                       |
| `pnpm --filter web typecheck`                      | pass                                                                                                                                                                                                       |
| API and web production builds                      | pass; `/finance/[botId]` remains dynamic                                                                                                                                                                   |
| `node --test scripts/architecture-policy.test.mjs` | pass: 16 focused policy tests                                                                                                                                                                              |
| `pnpm architecture:check`                          | expected fail only: the same three pre-existing growth violations in `telegram-channels.service.ts`, `telegram-posts/page.tsx`, and `primitives.tsx`; all environment-access allowances and stale ceilings removed/lowered |
| `git diff --check` and retired-key contract audit  | pass                                                                                                                                                                                                       |

Consumer Finance product isolation on 2026-08-22:

| Command                                                 | Result                                                                                                                                                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| targeted Finance/core API tests                         | pass: 29 suites, 224 tests                                                                                                                                                                                |
| `pnpm --filter api test -- --runInBand`                 | pass: 133 suites, 839 tests                                                                                                                                                                               |
| `pnpm --filter api typecheck`                           | blocked only by the pre-existing unrelated mock typing error in `telegram-channels/import-managed-posts.spec.ts:389`                                                                                      |
| `pnpm --filter api build`                               | pass                                                                                                                                                                                                      |
| shared package typecheck/build                          | pass                                                                                                                                                                                                      |
| Finance-focused web tests                               | pass: 22 files, 105 tests before final toast compatibility regression                                                                                                                                     |
| `pnpm --filter web test -- --run`                       | pass: 77 files, 364 tests; existing jsdom navigation/chart-size stderr remains non-fatal                                                                                                                  |
| `pnpm --filter web typecheck`                           | pass                                                                                                                                                                                                      |
| `pnpm --filter web build`                               | pass; `/finance/[botId]` remains a dynamic route                                                                                                                                                          |
| `node --test scripts/architecture-policy.test.mjs`      | pass: 16 focused product/policy tests                                                                                                                                                                     |
| `pnpm architecture:check`                               | expected fail only: the same three pre-existing growth violations in `telegram-channels.service.ts`, `telegram-posts/page.tsx`, and `primitives.tsx`; no Consumer Finance boundary/config/network failure |
| `git diff --check` and repo-wide forbidden-import audit | pass                                                                                                                                                                                                      |

Architecture-boundary foundation on 2026-08-22:

| Command                                            | Result                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node --test scripts/architecture-policy.test.mjs` | pass: 13 focused static-policy regression tests                                                                                                                                                                                                                                                              |
| `pnpm architecture:check`                          | expected pre-existing fail only: the same three file-growth violations in `telegram-channels.service.ts`, `telegram-posts/page.tsx`, and `primitives.tsx`; no new dependency/presentation/config/network failure                                                                                             |
| `pnpm --filter @telegram-system/shared typecheck`  | pass                                                                                                                                                                                                                                                                                                         |
| `pnpm --filter web typecheck`                      | pass                                                                                                                                                                                                                                                                                                         |
| `pnpm --filter api typecheck`                      | fail in two untouched existing tests: incomplete `UpdateFinanceSettingsDto` at `finance-auth.controller.spec.ts:302` and mock return typing at `import-managed-posts.spec.ts:389`                                                                                                                            |
| `git diff --check`                                 | pass                                                                                                                                                                                                                                                                                                         |
| repo-wide forbidden-pattern audit                  | all current low-level Telegram imports outside `telegram/shared` (2 files), Prisma-backed controller usage (1 file), `refetchInterval` usage (2 files), direct environment reads, page orchestration, and product-boundary edges are represented by exact checker exceptions; no untracked violation remains |

| Command                                                                                                                                            | Result                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm architecture:check`                                                                                                                          | fail: current refactored files are within transitional allowances, but unrelated legacy growth remains in Telegram channels, Telegram posts pages, transactions, UI primitives, icon picker and managed-post import modal |
| `pnpm --filter @telegram-system/shared typecheck`                                                                                                  | pass                                                                                                                                                                                                                      |
| `pnpm --filter api typecheck`                                                                                                                      | pass                                                                                                                                                                                                                      |
| `pnpm --filter api test -- telegram-ad-sales.service.spec.ts telegram-ad-sales-crm-advertisers.service.spec.ts --runInBand`                        | pass: 2 suites, 31 tests                                                                                                                                                                                                  |
| `pnpm --filter api test -- --runInBand`                                                                                                            | pass: 30 suites, 209 tests                                                                                                                                                                                                |
| `pnpm --filter api test -- telegram-ad-sales.service.spec.ts --runInBand`                                                                          | pass: 19 tests                                                                                                                                                                                                            |
| `pnpm --filter api test -- invite-link-history.spec.ts --runInBand`                                                                                | pass                                                                                                                                                                                                                      |
| `pnpm --filter api test -- ad-campaigns invite-link-history ad-campaign-admission-analytics --runInBand`                                           | pass                                                                                                                                                                                                                      |
| `pnpm --filter api build`                                                                                                                          | pass                                                                                                                                                                                                                      |
| `pnpm --filter web typecheck`                                                                                                                      | pass                                                                                                                                                                                                                      |
| `pnpm --filter web test -- --run`                                                                                                                  | pass: 18 files, 89 tests; existing jsdom navigation/chart-size stderr remains non-fatal                                                                                                                                   |
| `pnpm --filter web test -- src/lib/telegram-ad-sales-query.test.ts --run`                                                                          | pass: 1 test                                                                                                                                                                                                              |
| `pnpm --filter web build`                                                                                                                          | pass                                                                                                                                                                                                                      |
| `pnpm db:generate`                                                                                                                                 | pass                                                                                                                                                                                                                      |
| `pnpm --filter @telegram-system/shared build`                                                                                                      | pass                                                                                                                                                                                                                      |
| `pnpm --filter web exec eslint src/lib/application-logs-api.ts src/lib/query-keys.ts`                                                              | pass; pnpm emitted local Node v18 engine warning                                                                                                                                                                          |
| `pnpm --filter api exec eslint src/domains/growth/ad-campaigns/invite-link-history.ts src/domains/growth/ad-campaigns/invite-link-history.spec.ts` | pass                                                                                                                                                                                                                      |
| `pnpm --filter api lint`                                                                                                                           | fail: 5622 errors, 251 warnings; existing repo-wide lint baseline remains                                                                                                                                                 |
| `pnpm --filter web lint`                                                                                                                           | fail: 190 errors, 101 warnings; existing repo-wide lint baseline remains                                                                                                                                                  |
| `ARCHITECTURE_STRICT=1 pnpm architecture:check`                                                                                                    | expected fail until all transitional oversized files are decomposed                                                                                                                                                       |

Domain-layout validation on 2026-08-09:

| Command                                 | Result                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter api typecheck`           | pass                                                                                                                                     |
| `pnpm --filter api build`               | pass                                                                                                                                     |
| focused bot/scheduler/system-bot tests  | pass: 30 suites, 134 tests                                                                                                               |
| `pnpm --filter api test -- --runInBand` | 70 suites and 409 tests pass; the same five legacy Telegram managed-post mock failures remain                                            |
| `pnpm --filter web typecheck`           | pass after regenerating Next route types                                                                                                 |
| `pnpm --filter web test -- --run`       | pass: 31 files, 149 tests                                                                                                                |
| `pnpm --filter web build`               | pass; 36 existing public routes retained                                                                                                 |
| shared package typecheck/build          | pass                                                                                                                                     |
| `pnpm architecture:check`               | path migration is recognized; still fails on pre-existing shrinking-baseline growth and the existing oversized managed-post import modal |

## 2026-08-22 Channel card pricing slice

- Moved the pure Telegram-post expected-views calculation into
  `common/analytics` after the ad-sales setup and channel catalog became two
  real consumers with identical 24h/48h/72h/7d semantics.
- Shrunk `telegram-ad-sales.service.ts` while keeping its public pricing
  contract unchanged. Channel collection pricing uses one bounded, workspace-
  scoped batch instead of per-card API or database reads.
- Lowered the shrinking-only architecture ceilings for the affected ad-sales
  service and Telegram channels page.

## Integration Review

- `integration-reviewer` checked the dirty refactor diff after the frontend/backend/design-system slices.
- Medium finding fixed: restored `AdHypothesisCampaignSummary` re-export from `@/lib/api`.
- Low finding fixed at that milestone: validation docs reported the then-current 289 production files; the 2026-08-22 inventory above now reports 580.
- Follow-up fixed: `apps/web/src/lib/api-types.ts` is no longer a transitional god file; it now re-exports focused type modules from `apps/web/src/lib/api-types/`.
- Remaining artifact note: `telegram-system.zip` is untracked and should stay out of the refactor commit unless intentionally archived.

## Manual QA Plan

- Consumer Finance bot: run `/start`, `/expense`, `/income`, `/recent`,
  `/accounts`, `/categories`, `/transfer`, and `/help` in `uk`, `ru`, and `en`;
  complete and cancel at least one callback-driven chat flow.
- Consumer Finance Mini App: open `/finance/[botId]` through Telegram initData,
  verify safe areas/navigation/FAB, create/edit/delete/undo a transaction, and
  confirm that changing bot/runtime does not reuse another bot's session/cache.
- Consumer Finance browser: complete challenge login, reload the HttpOnly
  session, reject an unsafe `returnTo`, log out, and confirm the Mini App session
  remains correctly bot-scoped.
- Finance correctness: create accounts in two currencies, add income/expense,
  transfer between them, verify source/destination amounts and valuation, then
  inspect dashboard, analytics, limits, goal, reminder and Ultimate read models.
- Billing: exercise Stripe checkout success/cancel return paths and Telegram
  Stars entitlement refresh without leaking internal JWT/workspace headers.
- Presentation isolation: compare current browser and 320–390px Mini App
  screenshots, open modal/date/select/emoji/toast states, and confirm emoji
  selection performs no HTTP request.

- Greeter: activate a GREETER bot, open Configure, connect a channel and refresh live `can_invite_users` permission health.
- Greeter: configure global CAPTCHA and a channel override, preview variables, submit a real join request, pass BUTTON_CONFIRM and SIMPLE_CHOICE, and verify approval plus durable outcome delivery.
- Greeter: verify the acquired user, mutually exclusive state and Today/Total/channel analytics; create 0s/10s/1d draft steps, select an interacted tester, run/reset TEST, then publish once.
- Greeter: confirm real acquisition-channel variables, create/estimate/send/schedule/cancel a broadcast, and observe persisted recipient progress through completion.

- Login, workspace switch and dashboard load.
- Telegram channels list, channel detail, sync-now, import/export and source access.
- Telegram posts list, compose, schedule, publish, edit and return to draft.
- Ad campaigns list/detail and admission analytics.
- Ad sales calendar, create sale, reserve/confirm/cancel, register payment.
- Networks create/edit and member assignment.

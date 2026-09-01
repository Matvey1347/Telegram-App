# Project Refactor ExecPlan

Updated: 2026-08-31

## 2026-08-31 Contact-centered CRM web application

Stage 3 makes `/ad-sales` a Contact-centered CRM while retaining the existing
Sales, Calendar, Analytics, placements, pricing, availability, payment,
checkout, and publication-lifecycle implementations. The former page remains a
route integrator; focused CRM components own Contacts, Inbox, stable Contact +
Conversation deep links, account-specific threads, cursor Message history,
unread state, explicit promotion, and automation safety presentation.

The cross-stack contract adds purpose-built compact Contact/detail,
Conversation, Inbox, unread, and Message cursor read models. It does not return
full histories or introduce frontend joins. CRM cache state is workspace
scoped and non-persisted; one authenticated event stream drives narrow cache
updates, with no polling or root-wide invalidation.

Customer automation remains execution-inert. The UI exposes explicit future
Contact consent, workspace/type configuration, and protected Deal overrides,
but no runner, cron, queue, heartbeat, historical backfill, or implicit opt-in
is added. Account capability controls keep CRM Sync, CRM Send, and MTProto
Publishing independent, and the default sender applies only to a new
Conversation.

## 2026-08-31 Telegram CRM multi-account runtime and Inbox

Stage 2 continues the Contact-centered CRM foundation with an event-driven
MTProto runtime. One process-local client is maintained per eligible account;
there is no global master account, database/Telegram polling, cron, heartbeat,
or new worker service. Existing Conversations keep their fixed account while
the workspace default is consulted only when creating a new Conversation.

The runtime adds explicit bounded private-dialog import, batch-idempotent live
updates, bounded `GetDifference` recovery, lazy history, numeric read state,
manual idempotent sending, Inbox classification, Peer promotion, transactional
Contact merge, and a process-local authenticated event stream. Telegram
protocol details stay in `telegram/shared`, while focused CRM services own
workspace-scoped persistence and authorization. The MTProto facade and account
service continue shrinking and their architecture ceilings are lowered.

The rollout remains automation-inert: no customer automation runner, schedule,
send, execution, opt-in mutation, or historical backfill is introduced. Manual
sending is independently permissioned and account-capability gated. See
`docs/architecture/CRM_ARCHITECTURE.md`.

## 2026-08-31 Contact-centered CRM foundation

Stage 1 evolves the existing Ad Sales CRM without adding parallel Contact or
Deal storage. `TelegramAdvertiser` remains the Contact backing entity and
`TelegramAdSale` remains the Deal. The two persisted advertiser lifecycle
fields are replaced by one authoritative CRM Contact stage; legacy API fields
are compatibility projections only, and active-Deal state remains derived.

The new focused `domains/telegram/telegram-crm` boundary owns Contact, stable
Telegram Peer identity, Conversation/Message persistence, per-account sync
state, CRM settings, independent account capabilities, and a pure fail-closed
customer-automation policy. It does not import the Ad Sales service or Telegram
protocol SDK. Ad Sales continues to own sales, placements, payments, pricing,
calendar, availability, and analytics.

Rollout is deliberately inert: existing/new Contacts have customer automation
off, existing Deals are migration-disabled and ineligible, workspace/type
switches default off, and migration creates no Messages, Conversations, sync
states, due events, or automation executions. No cron, polling, heartbeat,
startup scan, worker, queue, persistent MTProto connection, telemetry writer,
Redis, or Railway service is introduced. See
`docs/architecture/CRM_ARCHITECTURE.md`.

## 2026-08-30 Cross-stack operations slice

The workspace members, Ad Sales, Telegram channel sync, and Internal Finance
flows were extended together while reducing transitional file debt:

- the workspace member modal was extracted from the members section and its
  redundant nested framed surfaces were removed;
- Ad Sales client selection and placement lifecycle presentation were extracted
  into focused components, and publication refresh is bounded to an active due
  event instead of idle polling;
- workspace-wide manual channel sync reuses the canonical channel orchestrator
  through one server request and sequential per-channel execution;
- transaction category/member validation was extracted from the transactions
  service while adding the system Salary expense category.

The slice adds no production cron, recurring idle work, schema migration, or
per-entity browser joins. Shrinking-only architecture baselines are lowered in
the same change after the final measured scan.

## Current State

`telegram-system` is a pnpm monorepo with:

- `apps/api`: NestJS API with Prisma and Telegram Bot/MTProto integration.
- `apps/web`: Next.js App Router frontend with React Query and Tailwind v4 CSS.
- `packages/shared`: serializable cross-stack contracts.

The main architectural issue is concentrated handwritten production files that combine unrelated responsibilities. The former 12978-line Telegram channels god-service is now a 255-line checker-counted compatibility facade over focused use-case providers. The largest remaining backend file is `apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.ts` at 5,825 checker-counted lines; the largest frontend file is `apps/web/src/app/(internal)/(telegram)/telegram-posts/page.tsx` at 8,564 checker-counted lines.

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

## Historical Metrics After the 2026-08-22 Milestone

This table is retained as the milestone record and is not the current inventory.

| Metric                              |                                                                                  Count |
| ----------------------------------- | -------------------------------------------------------------------------------------: |
| Handwritten production TS/TSX files |                                                                                    675 |
| Files > 500 lines                   |                                                                                     55 |
| Files > 1000 lines                  |                                                                                     16 |
| Files > 2000 lines                  |                                                                                      7 |
| Files > 3000 lines                  |                                                                                      5 |
| Largest backend file                |        `apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.ts` - 5884 |
| Largest frontend file               |                `apps/web/src/app/(internal)/(telegram)/telegram-posts/page.tsx` - 8379 |

## Current Working-Tree Metrics — 2026-08-27

| Metric                              |                                                                                  Count |
| ----------------------------------- | -------------------------------------------------------------------------------------: |
| Handwritten production TS/TSX files |                                                                                    852 |
| Files > 500 lines                   |                                                                                     65 |
| Files > 800 lines                   |                                                                                     27 |
| Files > 1000 lines                  |                                                                                     16 |
| Files > 2000 lines                  |                                                                                      7 |
| Files > 3000 lines                  |                                                                                      5 |
| Largest backend file                | `apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.ts` - 5825 |
| Largest frontend file               | `apps/web/src/app/(internal)/(telegram)/telegram-posts/page.tsx` - 8564 |

`TelegramChannelsService` was reduced from 12978 lines to a 255-line explicit
delegation facade. Its file-size baseline and both direct GramJS import
exceptions were removed; all newly extracted channel production files remain
below 500 lines. `apps/web/src/lib/api.ts` was reduced from 3575 lines and is currently 783
checker-counted lines after extracting type-only API contracts, focused endpoint
facades, and the neutral HTTP transport. The temporary 1486-line
`apps/web/src/lib/api-types.ts` type warehouse was split into domain modules,
leaving a small compatibility barrel. `packages/shared/src/types/telegram-ad-sales.ts`
is currently 882 lines after moving CRM contracts to `telegram-ad-sales-crm.ts`.
`apps/api/src/domains/growth/ad-campaigns/ad-campaigns.service.ts` is currently
1859 lines after focused extraction. Transitional architecture allowances remain
shrinking-only. The current project-wide `pnpm architecture:check` fails on
existing grown files, hard/page/facade limits, stale allowances and one product-
boundary import. The live inventory and the exact performance-sensitive
decomposition order are recorded in
`docs/refactoring/PERFORMANCE_AUDIT_2026-08-27.md`.

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

`docs/refactoring/codebase-inventory.json` is the historical refactor inventory
from an earlier milestone; it is not the live file-size source. Use
`scripts/check-architecture.mjs` for the current full list and
`docs/refactoring/PERFORMANCE_AUDIT_2026-08-27.md` for the 2026-08-27 audited
major-file table.

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

- Workspace RBAC foundation (2026-08-29): canonical shared feature/permission
  registry and ownership semantics defined; custom role persistence, request-
  scoped authorization, Role API/editor, permission-aware surfaces and bounded
  domain enforcement are being implemented as separate non-overlapping slices.
  The design stores role permission deltas rather than copying effective rights
  onto members and adds no polling or recurring runtime work. See
  `docs/architecture/WORKSPACE_RBAC.md`.

- 2026-08-28 regression closure: extracted the internal transaction editor from
  the Finance transactions App Router page, reducing that page below the
  300-line policy while restoring category-driven Member/Channel fields and a
  single-row primary-field layout. Restored System Bot slash-command
  registration on both selected environments. Ad-sales list grouping now uses
  the booked placement time; the existing post-metrics task also includes
  channels with active published placements, and legacy deletion can use an
  explicitly linked TelegramPost when an empty managed-post shell has no
  message identity. No timer, polling loop, task frequency, retention, or
  unchanged-state write was added; the existing 100-channel external-call
  ceiling is unchanged.
- Ad Sales network placement slice: added authoritative exact-sum audience-weighted pricing for paid checkout and System Bot sales, exposed the system "all channels" network in the creation flow, added one shared creative cloned to channel-owned managed posts, automatic future scheduling, and workspace-timezone-safe per-channel overrides. No polling or recurring runtime work was introduced.

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

## 2026-08-23 Telegram post image persistence slice

- Added a permanent `TelegramPost.imageUrls` read/storage contract and a
  content-addressed Backblaze B2 adapter for Telegram-origin image bytes.
- New synchronized photos and Telegram scheduled imports use bounded MTProto
  batch downloads and exact-key B2 reuse; repeat metric sync skips stored media.
- Added a manual, cursor-batched maintenance command for legacy managed-post
  data URLs and historical synchronized posts. No cron, startup scan, polling,
  or permanent worker was introduced.
- GPT context and read models expose only permanent HTTP(S) image URLs; the old
  request-time Telegram media endpoint was removed.

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

## 2026-08-27 Repository-Wide Performance Workstream

The evidence and priority register for this workstream live in
`docs/refactoring/PERFORMANCE_AUDIT_2026-08-27.md`. This is an ordered set of
bounded slices, not authorization for a single repository-wide rewrite.

### Constraints and measurement contract

- Preserve every API, authorization, workspace-isolation, idempotency,
  financial-calculation, Telegram and UI contract unless a slice explicitly
  introduces and migrates a shared contract.
- Do not add a Railway service, worker, replica, cache, polling loop, cron,
  heartbeat, recurring telemetry write or higher Neon/Railway resource floor.
  Idle database activity and unchanged-state writes must not increase.
- Before each production slice, record a local/test baseline for Prisma client
  calls, HTTP requests, Telegram API calls and response shape where applicable.
  Static call counts are not latency benchmarks and must not be presented as
  such.
- Prefer request-scoped reuse, bounded batch reads, database aggregates where
  they reduce transferred rows, purpose-built read models and authoritative
  mutation reconciliation. Do not hide inefficient work behind persistent
  caching.
- Significant slices follow Grace Explorer -> Knuth Performance -> Parnas
  Structure preflight -> main integrator -> Linus Backend/Ada Frontend on
  non-overlapping files -> Parnas final check -> Turing Review.
- Existing `scripts/check-architecture.mjs` remains the sole file-size policy
  owner. Every touched shrinking-only file must get smaller; no ceiling or
  exception may be raised.

### Continued implementation checkpoint — 2026-08-27

The backend/runtime continuation landed the following bounded slices. “Partial”
means the measured multiplicative path was removed, but a separately named
contract or runtime concern remains; it is not a claim that the whole numbered
slice is complete.

| Slice | Status | Landed evidence |
| --- | --- | --- |
| P-01 | Critical path complete for the current single-runtime topology | System Bot stale `PROCESSING` reclaim, process-wide live-attempt exclusion, generation-fenced finalization, callback-first routing, command scopes, one reusable authorized connection, and non-blocking best-effort typing. |
| P-02 | Complete for proposal confirmation and established bot context | Rates and account/category references are prepared once; a ten-operation confirmation performs no root-Prisma call inside the transaction. Finance Bot user/profile context is one scoped read and downstream handlers reuse it. |
| P-03 | Multiplicative DB work complete; audience/lease follow-up remains | Atomic `SKIP LOCKED` delivery claims, environment/lease-scoped hydration, fail-closed lost-runtime reconciliation, 250-row idempotent enqueue/link pages, grouped broadcast reconciliation, grouped blocked/missing-chat updates, and cancellation-safe orphan cleanup. |
| P-04 | Backend read-write regression addressed; cross-stack collection work remains | Established internal-Finance category readiness is one read and zero writes. Browser “load every page” removal and setup-time ownership remain separate work. |
| P-05/P-06 | Backend hot paths complete; bulk quote UI/API remains | Products/pricing samples and availability inputs are loaded in bounded batches. Pricing preserves requests above 100 channels by processing sequential batches of at most 100, ranks at most 60 posts per channel, and returns only exact nearest/latest snapshot candidates for every required stored product window. Established settings/default reads are write-free; first-use defaults are materialized in one batch and refetched once. |
| P-07 | Duplicate/prior hydration complete; `allTime` contract blocked | Overview uses one current dataset, one prior revenue aggregate and no standalone payment dataset. Selected channel metadata/inventory/latest prices are batched. |
| P-08 | Complete for the characterized dashboard path | Period predicates are pushed into reads, account transfers are grouped, and one request-scoped currency graph is reused. |
| P-12 | Partial | Network financial inputs and daily analytics work are batched. Recurring campaign admission reads at most one predecessor per invite link plus the current sync window; MTProto operation-scoped reuse and remaining lifecycle fan-out are still open. |
| P-13 | Partial | Scheduler unchanged-state work and due-key rearming were reduced without polling; its automatic-eligibility responsibility was extracted and the touched service reduced from 531 to 464 checker lines. Startup DDL and unchanged Telegram presentation reconciliation remain open. |
| P-15 | In progress | Ad Sales was reduced to 5,825 checker lines and admission analytics to 798, removing the latter's transitional allowance; the touched scheduled-task service is now below 500 and every new production helper in this continuation is below 500 lines. |

Static application-issued operation counts after the continuation:

| Characterized path | Before | After |
| --- | ---: | ---: |
| Ad Sales products, 100 channels/four defaults | 903 reads when established; up to 903 reads + 100 writes on first use | 4 whole-path reads when established; 5 reads + 1 batched write on first use |
| Ad Sales availability, 50 channels | 257/258 calls | 10 whole-path reads and zero writes for the established no-network/empty-placement fixture; first use is 11 reads + 1 batched write |
| Ad Sales analytics source, six selected channels | up to 10 full datasets / 30 source statements | populated current dataset + prior aggregate / 3 source statements, excluding authorization and other cards |
| Ad Sales analytics whole six-channel overview | about 119 calls | at most 24 calls for populated, non-`allTime`, no-network input; `allTime` adds two earliest-row reads |
| Operations dashboard, 100 accounts | up to `409 + L + F` calls | about 21-23 calls, independent of account count |
| Finance proposal confirmation, 10 operations | up to 40 root reads + 20 full rate-history loads | `M + 5 + B + G + U` operations: 17 for the category-present, single-rate, no-merchant fixture and at most 36 for `M=10`, plus a possible workspace lookup; zero root-Prisma calls inside the transaction |
| Finance Bot established actor/profile bootstrap | 2 sequential reads plus repeated downstream reads | 1 scoped read; duplicate user/profile/accounts-context reads removed |
| System Bot `/help` | typing + 3 context reads | no typing and no context read |
| Delivery claim of `N` rows | `1 + N` claim operations | 2 claim/hydration operations |
| Greeter normal `ALL_ALIVE` materialize/enqueue/link, 1,000 recipients | 2,022 characterized operations after the earlier partial refactor | 34 operations across four 250-row pages, excluding scheduler/delivery processing; Telegram attempts remain per recipient/retry policy |
| Recurring campaign admission source, 100 campaigns | per-campaign historical snapshot reads | one campaign read + one bounded predecessor read + one current-window read |

These are deterministic test/static counts, not physical SQL or latency claims.
One Prisma relation operation can still issue more than one SQL statement.
For Finance, `M` is the number of proposal operations, `B` is the optional
category batch (`0` or `1`), `G` the distinct current/as-of rate groups and `U`
the merchant-mapping upserts. Category-less or identity-rate input can therefore
be below 17 operations. Availability's network lookup or managed-post hydration
can each add one read outside the characterized empty no-network fixture. The
delivery count is the normal path; a runtime deleted between claim and hydration
adds one fail-closed transaction with three batch writes and no Telegram call.

Evidence-blocked or deliberately deferred work:

- `allTime` analytics still exposes every current placement, alert and inventory
  point. Adding `take` would silently drop public output. Completion requires a
  synchronized aggregate/paginated read contract (P-07/P-09), not an arbitrary
  backend cap. The unbounded previous-period and standalone-payment reads have
  already been removed.
- Greeter audience acquisition still resolves the distinct audience before the
  250-row delivery pages. A true cursor must preserve “first acquisition
  channel” semantics and needs a PostgreSQL integration test. Existing
  five-minute delivery leases also lack an owner token; the new state writes are
  race-guarded, but an already in-flight Telegram request cannot be made
  retractable.
- System Bot live attempts are excluded process-wide and every reclaim/finalize
  is fenced by an exact `updatedAt` generation. This closes the unfinished-live-
  handler race in the current single-runtime topology without a timer or
  heartbeat. Separate OS processes overlapping for more than five minutes can
  still duplicate an external side effect before the losing generation is
  prevented from finalizing. A fully distributed guarantee would require a
  pinned database lock/long transaction, a heartbeat lease or end-to-end
  idempotent side-effect schema, all outside the current cost/safety constraints;
  do not add System Bot replicas without resolving that contract.
- Pricing snapshot rows no longer scale with retained metric history. A request
  for `C` channels uses `ceil(C/100)` sequential SQL batches. In batch `b`,
  `C_b <= 100`, `P_b <= 60C_b`, and `W_b` distinct required stored product
  windows produce at most `P_b(W_b+1)` raw rows. A standard four-window batch is
  therefore at most 30,000 rows; requests above 100 preserve the existing API
  response, and custom windows are included exactly rather than truncated.
- Recurring campaign admission sync hydrates `P + R` snapshots, where `P` is at
  most one predecessor per selected invite link and `R` is the current sync
  range. Initial historical/backfill processing still deliberately reads the
  requested history and remains retention/pagination follow-up work.
- Ten distinct Finance valuation dates can still prepare ten rate-history
  groups outside the transaction, and explicit dashboard `all` mode retains its
  lifetime row/series contract. Bounding either requires a purpose-built latest-
  edge/range contract rather than changing financial or all-time output.
- Bulk placement quote requests, paginated sale-cache membership and hidden-tab
  request gating are cross-stack/frontend P-05/P-09/P-10 work, not backend-only
  changes to infer in this continuation.
- Managed-post read repair/renumber side effects, MTProto operation-scoped
  connection reuse, startup compatibility DDL/presentation reconciliation and
  remaining Ad lifecycle detail hydration remain explicit P1 work.
- No index was added. The new delivery lookup uses the existing
  `(botIntegrationId, idempotencyKey)` unique constraint; due claims use the
  existing `(status, scheduledAt)` index; broadcast reconciliation uses existing
  recipient status/uniqueness indexes. P-14 remains blocked on sanitized,
  production-like `EXPLAIN (ANALYZE, BUFFERS)` evidence and deployed Neon
  configuration access, so speculative write-amplifying indexes were rejected.
- No cache service, worker, timer, polling loop, heartbeat, recurring
  precomputation or telemetry writer was introduced. Idle Neon/Railway work and
  the service topology/resource floor are unchanged or lower.

### Final verification closure and working-tree manifest

The final Parnas structural review, Knuth runtime-cost review and Turing
integration review all pass this continuation with no unresolved current-slice
Critical/High finding. The repository-wide transitional debt below is reported
rather than hidden or widened.

| Check | Result |
| --- | --- |
| `pnpm --filter api test -- --runInBand` | pass: 216 suites, 1,331 tests |
| `pnpm --filter api typecheck` | pass |
| `pnpm --filter api build` | pass |
| `pnpm db:generate` | pass |
| `pnpm --filter api exec prisma validate` | pass with the existing `SetNull` relation warning |
| Focused lint for new/changed production helpers and final performance slices | pass |
| Broad changed-API-file lint (87 TypeScript files) | fail: 1,674 errors and 245 warnings, concentrated in inherited oversized service/spec formatting and unsafe typing/test doubles; no false full-lint pass is claimed |
| `git diff --check` | pass |
| Architecture policy tests | pass: 16/16 |
| `pnpm architecture:check` | repository-wide fail: 26 existing/transitional findings; current slice passes shrinking-only review |
| `ARCHITECTURE_STRICT=1 pnpm architecture:check` | repository-wide fail: 36 existing findings; among touched files only the known 5,825-line Ad Sales legacy service remains a strict size failure |
| Temporary PostgreSQL pricing execution | pass for SQL types, workspace/channel isolation, custom 96h selection, historical cutoff and row bound; transaction rolled back |
| Final read-only integration review | Turing pass; focused rerun 4 suites, 70 tests |

Final production inventory: 852 TypeScript/TSX files; 65 over 500 checker
lines, 27 over 800, 16 over 1,000, seven over 2,000 and five over 3,000. The
Ad Sales shrinking-only ceiling is exact at 5,825. Admission analytics is 798
and its former allowance was removed. The pricing reader is 458, admission
events helper 341, delivery service 493, scheduled-task service 464 and
automatic-eligibility helper 78 checker lines. Static dependency analysis found
six inherited SCCs and zero touching a changed/new file.

The current audit/continuation working tree contains exactly 97 paths: 55
tracked modifications (`M`) and 42 new untracked paths (`A`). This manifest is
the exact hand-off scope; it does not claim that every pre-existing dirty path
was first created in the final continuation turn.

<details>
<summary>Exact 97-path manifest</summary>

```text
M  .codex/agents/backend-architect.toml
M  .codex/agents/codebase-explorer.toml
M  .codex/agents/frontend-architect.toml
M  .codex/agents/integration-reviewer.toml
M  AGENTS.md
M  apps/api/src/common/currency-conversion.service.spec.ts
M  apps/api/src/common/currency-conversion.service.ts
M  apps/api/src/domains/finance/finance-categories/finance-categories.service.spec.ts
M  apps/api/src/domains/finance/finance-categories/finance-categories.service.ts
M  apps/api/src/domains/growth/ad-campaigns/ad-campaign-admission-analytics.service.spec.ts
M  apps/api/src/domains/growth/ad-campaigns/ad-campaign-admission-analytics.service.ts
M  apps/api/src/domains/operations/dashboard/dashboard.module.ts
M  apps/api/src/domains/operations/dashboard/dashboard.service.ts
M  apps/api/src/domains/operations/scheduled-tasks/scheduled-tasks.service.spec.ts
M  apps/api/src/domains/operations/scheduled-tasks/scheduled-tasks.service.ts
M  apps/api/src/domains/telegram/consumer-finance/chat-flows/finance-proposal.service.spec.ts
M  apps/api/src/domains/telegram/consumer-finance/chat-flows/finance-proposal.service.ts
M  apps/api/src/domains/telegram/consumer-finance/identity/finance-context.service.spec.ts
M  apps/api/src/domains/telegram/consumer-finance/identity/finance-context.service.ts
M  apps/api/src/domains/telegram/consumer-finance/ledger/finance-ledger.service.spec.ts
M  apps/api/src/domains/telegram/consumer-finance/ledger/finance-ledger.service.ts
M  apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales-bot-command.service.spec.ts
M  apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales-checkout.service.spec.ts
M  apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.spec.ts
M  apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.ts
M  apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-delivery.service.spec.ts
M  apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-delivery.service.ts
M  apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-users.service.spec.ts
M  apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-users.service.ts
M  apps/api/src/domains/telegram/telegram-bots/finance/finance-bot-chat-responder.service.spec.ts
M  apps/api/src/domains/telegram/telegram-bots/finance/finance-bot-chat-responder.service.ts
M  apps/api/src/domains/telegram/telegram-bots/finance/finance-bot.service.spec.ts
M  apps/api/src/domains/telegram/telegram-bots/finance/finance-bot.service.ts
M  apps/api/src/domains/telegram/telegram-bots/greeter/greeter-broadcast.service.spec.ts
M  apps/api/src/domains/telegram/telegram-bots/greeter/greeter-broadcast.service.ts
M  apps/api/src/domains/telegram/telegram-channel-networks/telegram-channel-networks.service.spec.ts
M  apps/api/src/domains/telegram/telegram-channel-networks/telegram-channel-networks.service.ts
M  apps/api/src/domains/telegram/telegram-channels/dto.spec.ts
M  apps/api/src/domains/telegram/telegram-channels/telegram-channel-financial-read.service.spec.ts
M  apps/api/src/domains/telegram/telegram-channels/telegram-channel-financial-read.service.ts
M  apps/api/src/domains/telegram/telegram-channels/telegram-channels.characterization.spec.ts
M  apps/api/src/domains/telegram/telegram-channels/telegram-managed-post-calendar.service.ts
M  apps/api/src/domains/telegram/telegram-sync/daily-analytics-sync.service.ts
M  apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-ad-sale-flow.service.spec.ts
M  apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-ad-sale-flow.service.ts
M  apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-connections.service.spec.ts
M  apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-connections.service.ts
M  apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-handler.service.spec.ts
M  apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-handler.service.ts
M  apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-option-layout.spec.ts
M  apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-post-preview.spec.ts
M  apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-runtime.service.spec.ts
M  apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-runtime.service.ts
M  docs/refactoring/PROJECT_REFACTOR_EXEC_PLAN.md
M  scripts/check-architecture.mjs
A  .codex/agents/file-size-guardian.toml
A  .codex/agents/performance-optimizer.toml
A  apps/api/src/domains/finance/finance-categories/finance-system-category-readiness.ts
A  apps/api/src/domains/growth/ad-campaigns/ad-campaign-admission-analytics-performance.spec.ts
A  apps/api/src/domains/growth/ad-campaigns/ad-campaign-admission-events.ts
A  apps/api/src/domains/operations/dashboard/dashboard-period.ts
A  apps/api/src/domains/operations/dashboard/dashboard-read.service.spec.ts
A  apps/api/src/domains/operations/dashboard/dashboard-read.service.ts
A  apps/api/src/domains/operations/dashboard/dashboard-trend.spec.ts
A  apps/api/src/domains/operations/dashboard/dashboard-trend.ts
A  apps/api/src/domains/operations/dashboard/dashboard.service.spec.ts
A  apps/api/src/domains/operations/scheduled-tasks/scheduled-task-automatic-eligibility.ts
A  apps/api/src/domains/telegram/consumer-finance/ledger/finance-transaction-valuation.ts
A  apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales-analytics-dataset-reader.spec.ts
A  apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales-analytics-dataset-reader.ts
A  apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales-analytics-inventory-alerts.ts
A  apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales-analytics-summary.ts
A  apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales-analytics-utils.ts
A  apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales-availability-builder.ts
A  apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales-availability-reader.ts
A  apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales-channel-analytics.ts
A  apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales-default-products.spec.ts
A  apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales-default-products.ts
A  apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales-inventory-reader.ts
A  apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales-performance.spec.ts
A  apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales-pricing-reader.ts
A  apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales-workspace-settings.ts
A  apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-delivery-batch-enqueue.spec.ts
A  apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-delivery-batch-enqueue.ts
A  apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-delivery-broadcast-reconciliation.spec.ts
A  apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-delivery-broadcast-reconciliation.ts
A  apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-delivery-claim.spec.ts
A  apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-delivery-claim.ts
A  apps/api/src/domains/telegram/telegram-bots/greeter/greeter-broadcast-batch-link.spec.ts
A  apps/api/src/domains/telegram/telegram-bots/greeter/greeter-broadcast-batch-link.ts
A  apps/api/src/domains/telegram/telegram-channel-networks/telegram-channel-network-presentation.ts
A  apps/api/src/domains/telegram/telegram-channels/telegram-channel-financial-summary-preparation.ts
A  apps/api/src/domains/telegram/telegram-channels/telegram-managed-post-calendar.service.spec.ts
A  apps/api/src/domains/telegram/telegram-sync/daily-analytics-sync.service.spec.ts
A  apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-action-context.ts
A  apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-handler-performance.spec.ts
A  docs/refactoring/PERFORMANCE_AUDIT_2026-08-27.md
```

</details>

### Slice P-00 — characterization and operation-count harnesses

Scope:

- Add test/development-only Prisma-call and API-client counters around the
  selected use case; keep them out of production startup and request paths.
- Capture fixtures for Ad Sales pricing, availability, analytics, sales list
  and calendar; operations dashboard; Finance Bot; System Bot; campaigns;
  networks; and due analytics sync.
- Record response-shape snapshots or explicit contract assertions before
  changing read models.

Acceptance:

- Each P0 path has a deterministic before-count and equivalent-output test.
- Tests distinguish Prisma client operations from physical SQL statements and
  do not claim wall-clock improvement without a representative benchmark.
- The harness creates no production logging, persistence, timer, request or
  environment dependency.

### Slice P-01 — System Bot crash recovery and critical context

Scope:

- Add atomic stale-`PROCESSING` reclaim to the System Bot runtime while keeping
  terminal duplicates idempotent.
- Classify commands by no context, connection-only or workspace membership;
  reuse the authorized connection and remove best-effort typing from fast-path
  serial work.
- Keep callback acknowledgement first.

Acceptance:

- Concurrent fresh/stale/terminal duplicate tests prove exactly one reclaim
  winner and no lost or double-executed command.
- Help performs no workspace reads; workspace-bound commands still reject a
  disabled connection or stale membership.
- Typing failure/latency cannot delay the useful action on a fast command.

### Slice P-02 — Consumer Finance transaction and rate context

Scope:

- Carry `workspaceId` in the Consumer Finance profile context.
- Resolve a bounded current/as-of rate source before opening proposal-confirm
  transactions and reuse it for every operation; batch account/category inputs.
- Keep mutable financial state request-scoped and preserve atomic confirmation.

Acceptance:

- A ten-operation confirmation makes no root-Prisma call inside the transaction
  callback and has a deterministic bounded operation count.
- Historical/current/default/USD values, duplicate confirm, rollback and
  constrained-pool concurrency retain regression coverage.
- Established Finance actor/profile bootstrap and accounts summaries reuse
  resolved profile/workspace/rate context without caching it across updates.

### Slice P-03 — Telegram delivery and Greeter broadcast linearization

Scope:

- Claim a bounded delivery batch atomically using PostgreSQL concurrency
  semantics; preserve leases and runtime ownership.
- Cursor/batch audience materialization and recipient linking.
- Replace per-delivery whole-broadcast scans with grouped counts or atomic
  counters and one reconciliation per touched broadcast/batch.

Acceptance:

- A 1,000-recipient fixture processes O(B), not O(B²), status rows and records
  exact DB/Telegram operation counts.
- Concurrent claim, crash reclaim, cancellation, blocked user, partial failure,
  retry-after and duplicate-audience tests pass.
- Telegram sends remain bounded and one per required recipient; no new worker,
  queue service, heartbeat or polling loop is added.

### Slice P-04 — collection purity and explicit pagination/aggregates

Scope:

- Remove shared serial “load every page” behavior from user-facing list paths;
  keep UI pagination and add purpose-built server aggregates/selectors.
- Move internal Finance system-category provisioning to workspace setup/
  migration and make transaction GETs write-free.
- Add debounce/cancellation propagation to search paths whose current page
  chains can overlap.

Acceptance:

- 1/100/1,000-row fixtures prove bounded route HTTP work; Categories obtains
  equivalent totals without downloading all transactions.
- Established list GETs perform zero writes and legacy workspace initialization
  still owns every required default.
- Pagination/search/sort, abort, empty/error and workspace-isolation tests pass.

### Slice P-05 — Ad Sales pricing, bulk quotes and read purity

Scope:

- Load channels/products/bounded pricing posts/required metric snapshots once
  and derive every product/placement window in memory.
- Replace per-placement serialized quote POSTs with one keyed bulk preview and
  explicitly decide when an auditable price snapshot is persisted.
- Move default-product/settings materialization out of GET paths.

Acceptance:

- Product calls are bounded at 1/10/50/100 channels; quote HTTP count is one at
  1/100/500 placements with partial-failure and stale-response coverage.
- Established reads perform zero writes; accepted snapshot/audit semantics and
  first-time defaults remain equivalent.
- 24h/48h/72h/7d, missing samples, currency/price and workspace tests pass; the
  Ad Sales god service shrinks without a new exception.

### Slice P-06 — Ad Sales availability use case

Scope:

- Resolve membership/settings/timezone once; batch policies, products,
  placements, posts and pricing; group rows before channel/day/slot loops.
- Keep the existing response cache only as a duplicate-read shield.

Acceptance:

- Cache-miss Prisma calls are bounded at 1/10/50 channels and GET performs no
  upsert/write.
- 93-day, timezone/DST, inherited policy, network, collision, managed metrics
  and cache-equivalence tests pass; no cache service or refresh task is added.

### Slice P-07 — Ad Sales analytics shared source data

Scope:

- Resolve authorization/range once, load current/prior/inventory/pricing source
  data once where semantics match, then derive all overview cards/rollups.
- Prefer smaller specialized aggregates when they transfer fewer rows; do not
  force one giant SQL query.

Acceptance:

- Current range is loaded once for a normal and six-channel overview.
- Empty/current/prior/all-time/mixed-currency output remains equivalent, and
  all-time rows/series are deliberately bounded or aggregated without silent
  truncation.

### Slice P-08 — operations dashboard and currency graph reuse

Scope:

- Push requested date predicates/aggregates into PostgreSQL; batch all account
  transfer totals; build one request-scoped rate graph; bound series density.

Acceptance:

- Calls do not scale as four per account at 1/100 accounts; a 30-day request
  does not hydrate lifetime finance/growth rows.
- Totals, signs, transfers, invite selection, all-time points, stale/missing
  rates and mixed currencies retain regression coverage.

### Slice P-09 — Ad Sales list/calendar contracts

Scope:

- Define synchronized compact sales-row and date/channel-bounded calendar
  contracts; keep rich detail authoritative.
- Preserve compact placement/payment/member/icon summaries so the browser does
  not perform row joins; move complete-history search to the server.

Acceptance:

- Backend/shared/frontend compile against one contract; more than 100 sales and
  search beyond page one remain visible when in scope.
- Payload tests exclude heavy collection fields and retain all detail behavior;
  no per-row HTTP request appears.

### Slice P-10 — frontend request lifecycle and cache precision

Scope:

- Fix sale cache membership: updates touch only containing pages; creates enter
  only provably matching page-one scopes.
- Build an Ad Sales mutation/staleness matrix and gate inactive tabs/modals in
  Campaigns, Channels/detail, Posts, networks/accounts and dashboard surfaces.
- Measure persisted query bytes and exclude heavy families only when doing so
  does not increase duplicate backend requests.

Acceptance:

- Page-one/page-two/filter cache tests, exact invalidation tests and workspace
  switches pass; settings/rates are untouched by ordinary sale mutations.
- Cold-route API counters prove hidden views do not fetch until visible and no
  duplicate request appears within the freshness contract.
- Analytics channel selection is explicit; bounded login/broadcast polling
  remains terminal-state gated and no idle polling is added.

### Slice P-11 — managed-post read purity and bounded read models

Scope:

- Move auto-repair/reconciliation/number normalization to existing due/event
  ownership; check calendar cache before source reads.
- Add bounded collection/calendar/group read models and remove calendar-driven
  self-refetch when exact cache reconciliation is possible.

Acceptance:

- Managed-post/calendar GET and cache-hit tests prove zero writes/MTProto and
  bounded DB/payload work.
- Due publish/delete, drift repair, numbering/group ordering and month navigation
  converge with no lost state or added scheduler.

### Slice P-12 — networks, campaigns, sync, MTProto and Ad lifecycle fan-out

Scope:

- Batch union network sources and campaign invite/baseline observations.
- Batch sync admin links and use existing bounded concurrency.
- Reuse MTProto clients only within one account/channel operation, honor explicit
  history selectors, and return compact Ad lifecycle/deletion outcomes with
  bounded nearest metric snapshots.

Acceptance:

- 1/100 network and 100-channel sync/connection-count tests are bounded; no
  admin-link N+1 or posts/invites overfetch remains.
- Campaign fingerprints/attribution/fallback and changed-only writes pass.
- Twenty deletions/100 lifecycle rows avoid full detail/all-snapshot hydration
  while preserving remote/local compensation, leases and flood-wait behavior.

### Slice P-13 — startup and scheduler no-work cost

Scope:

- Make migrations the schema owner and reduce runtime compatibility DDL to the
  minimum explicitly supported check.
- Version-gate unchanged bot presentation and keep per-user menu reconciliation
  off the health-critical path using existing ownership.
- Materialize task defaults explicitly, page due ticks/retention and rearm only
  affected due keys.
- Measure existing persisted slow-warning cardinality; retain errors/actionable
  events and bound noisy successful-path persistence without adding telemetry.

Acceptance:

- Deployment/predeploy/start/health tests cover supported migration states;
  unchanged presentation makes zero Telegram calls.
- Scheduler startup/list has no unchanged writes, due work cannot be missed,
  and a tick does not refresh unrelated families.
- Log tests preserve redaction/errors while proving any sampling is bounded and
  creates no new recurring aggregate/write path.
- No always-on process, new job, heartbeat, recurring log or higher service
  resource is introduced.

### Slice P-14 — index and Neon query-plan verification

Scope:

- Capture `EXPLAIN (ANALYZE, BUFFERS)` on sanitized production-like
  distributions after request/read-model work; accept only plan-proven indexes.
- Update Prisma schema and migration together; manually verify the deployed URL
  is the intended Neon pooled endpoint without exposing it.

Acceptance:

- Every index cites predicate/order and before/after plan; duplicates and write
  amplification are assessed.
- Prisma generation/validation, affected tests/build/typecheck pass; Neon
  scale-to-zero/minimum compute and Railway tier/service count do not change.

### Slice P-15 — cohesive decomposition and final integration

Scope:

- Decompose in characterized runtime-risk order: Ad Sales use cases/UI,
  dashboard/collections, campaigns, managed Posts/pages, Channel pages and the
  MTProto facade last; split UI primitives by cohesive family behind a barrel.
- Lower/remove every touched shrinking-only ceiling; never normalize growth.

Acceptance:

- New files satisfy limits, touched god files shrink, pages trend below 300
  lines, imports stay within product boundaries and no cycle appears.
- Parnas final and Knuth count checks pass; Turing finds no contract/workspace/
  idempotency regression.
- Relevant typecheck, lint delta, tests/builds, architecture and manual QA are
  recorded with honest pre-existing failures.

## 2026-08-28 Frontend, Read-Model, and Final Performance Closure

This continuation completed the cross-stack P0 route work identified by the
final Knuth audit. The exact 269-path working-tree scope is recorded in
`docs/refactoring/PERFORMANCE_FINAL_MANIFEST_2026-08-28.md`; it includes earlier
program changes already present in the dirty working tree.

### Closed route and cache findings

| Surface | Before | Final contract/evidence |
| --- | --- | --- |
| Ad Sales quote preview | `C × D` serialized HTTP calls in the original flow; the first batch revision accepted only 200 rows and ran pricing SQL once per date | One ordered POST for up to 10,000 placements; 9,300-row UI fixture makes one HTTP call; current/future/no-date rows share one pricing-source call; exact historical work is capped at 31 cutoffs; zero snapshot writes; stale requests abort and a same-key failure has one bounded retry. |
| Ad Sales sales search | Browser filtered only the current 25-row page | Workspace-scoped server predicate is shared by `findMany` and `count`; page/search are in the query key, old requests receive an AbortSignal, and a page-two regression is covered. |
| Ad Sales analytics scope | Selected channel IDs were silently sliced to six | One shared six-channel contract drives the selector and backend; the selector blocks a seventh and direct API/service callers receive an explicit 400 before workspace or analytics reads. |
| Managed-post collection cache | Visible pages stored `PaginatedResponse`, while mutations/deep links/due refresh read or wrote a phantom raw-array prefix | Separate list/detail key families and one paginated reconciliation helper update every cached page containing the entity; create narrowly invalidates lists; reorder snapshots/rollback use real pages; due refresh also checks/refetches exact deep-link detail and stops on terminal state. |
| Managed import/deletion validation | Only page 1 / 100 posts was inspected | One workspace/channel-scoped lookup accepts at most 1,000 IDs and returns request-ordered compact 10-field summaries plus missing IDs. It uses channel + one post read + at most one icon read, with zero Telegram/MTProto/writes. |
| Managed post groups | Route and modals followed every 100-row page serially | One read-only channel summary request returns at most 1,000 compact groups; `take=1001` fails explicitly above the bound, status counts are aggregated without per-post arrays, and the path performs no ensure/normalize/DDL writes. |
| Campaigns / hypotheses / promos | Active route and hypothesis form used generic serial load-all helpers | Active view makes one 50-row server page request; server owns search/date/sort/count; hidden datasets stay disabled; campaign options paginate while retaining selected IDs; rich edit/preview and off-page promo deep links use detail endpoints. Obsolete load-all wrappers were removed. |
| Finance categories | Browser downloaded every transaction page (`P`, up to 100 HTTP requests for 1,000 rows) | One category-statistics aggregate request after authorization; no transaction-page chain. |
| Workspace switch | Workspace-scoped React Query data could survive the selected-workspace transition | Registered workspace-scoped query families are cleared on switch before the next workspace renders. |

### Read models and payloads

- Ad Sales collections use `TelegramAdSaleListItem`; payment histories, full
  advertiser detail and rich managed-post bodies remain detail-only while the
  compact placement/payment/member/icon and remote-status presentation stays
  in the row, avoiding client N+1 joins.
- Availability carries existing-placement summaries instead of bootstrapping
  the first 100 sale details for the calendar.
- Campaign, hypothesis and promo list readers use explicit compact selects;
  forms and previews hydrate their separate detail contracts.
- Managed lookup excludes text, media, buttons, planner state, relations,
  revisions and Telegram engagement rows. Its shared request/item/response
  contract and limits live in `packages/shared`.
- Finance category statistics and latest currency rates have purpose-built
  aggregate/latest contracts rather than client-side all-history reduction.

### Structural closure

No threshold or exception was raised. Normal architecture passes across 906
production TS/TSX files. Transitional baselines fell from 28 to 23 during the
program; the final slice additionally lowered Channels `3314 → 3059`, Campaigns
page `2482 → 2464`, Ad Sales page `1016 → 1004`, API facade `763 → 760`, and
Hypotheses service `905 → 903`. Earlier cohesive reductions remain: Posts page
`8564 → 7973`, Ad Sales service `7543 → 5723`, channel detail `4170 → 3867`,
MTProto facade `3603 → 3433`, primitives `2194 → 1747`, Ad Sale modal
`1343 → 555`, and sale details `1174 → 704`. New production helpers top out at
494 lines; no new production file exceeds 500.

Strict architecture intentionally remains red on the 23 exact inherited
transitional owners (seven backend services, nine App Router pages, six
frontend components, and the API facade). This is visible shrinking-only debt,
not a widened allowance.

### Verification

| Gate | Result |
| --- | --- |
| API tests | pass: 228 suites, 1,375 tests |
| Web tests | pass: 129 files, 576 tests |
| Root TypeScript | pass for shared, API, and web |
| Production build | pass; 31 web pages generated |
| Shared typecheck/build | pass |
| Prisma generate/validate | pass; existing required-field `SetNull` warning remains |
| Deployment contract | pass: 11 tests and Railway artifact check |
| Normal architecture | pass: 16/16 policy tests, 906 production files |
| Strict architecture | expected fail: 23 inherited exact-baseline owners |
| `git diff --check` | pass |
| Full lint | inherited red: API 6,112 errors / 581 warnings; web 164 errors / 254 warnings; shared passes. New focused helpers pass targeted lint; no false repository-wide lint pass is claimed. |

### Explicit P1/P2 backlog

- P-07: all-time Ad Sales placement/inventory/alert output still needs a
  synchronized aggregate/paginated contract; silently capping it would change
  correct totals.
- P-11/P-13: established Finance category reads are write-free, but first-use
  default provisioning and remaining runtime schema compatibility/startup DDL
  still need setup/migration ownership.
- P-12: daily analytics still performs 100 bounded but sequential channel sync
  calls at 100 channels; MTProto still creates several clients during a full
  channel sync; Ad lifecycle/deletion compact outcomes remain follow-up.
- Hypothesis summaries still hydrate nested linked-campaign inputs needed by
  the current calculation. Replacing them requires a purpose-built aggregate
  equivalence contract, not a payload-only deletion.
- Greeter owner-token/audience cursor semantics and System Bot cross-process
  exactly-once remain the documented correctness backlog; no heartbeat or new
  service was introduced to disguise them.
- P-14 production-like `EXPLAIN (ANALYZE, BUFFERS)`, deployed pooled-Neon URL,
  scale-to-zero/minimum compute, payload-byte capture, and browser latency remain
  manual production verification. No percentage latency claim is made.

### Neon/Railway cost gate

The final tree adds no worker, Railway service, polling loop, heartbeat,
keep-warm request, recurring precomputation, persistent cache, telemetry writer,
schema migration, retention increase, higher resource floor, or scale-to-zero
change. Optimized paths perform equal or fewer HTTP/DB calls and writes; all
100-channel/10,000-quote/1,000-ID behaviors above have explicit bounds.

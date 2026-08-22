# Product and application boundaries

## Purpose

Telegram System hosts an internal operations product, low-level Telegram
platform capabilities, and independently evolving consumer applications. A
shared repository and deployment do not make those products one domain.

The architecture optimizes for explicit ownership. Technical infrastructure
may be reused; product implementations may not be reused merely because they
are nearby or have similar names.

## Current products and platform

| Boundary                   | Backend ownership                                                        | Frontend ownership                                                                           |
| -------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Internal Finance           | `apps/api/src/domains/finance/*`                                         | internal Finance routes and non-consumer Finance feature modules                             |
| Consumer Finance           | `domains/telegram/consumer-finance/*`; `telegram-bots/finance/*` adapter | `(consumer-finance)`, `consumer-finance/*`, its provider, API client, state and localization |
| Greeter                    | `apps/api/src/domains/telegram/telegram-bots/greeter/*`                  | Greeter management UI; future consumer surfaces remain Greeter-owned                         |
| Telegram bot platform      | `telegram-bots/core/*` and the bot composition root                      | shared management shell and low-level integration presentation only                          |
| Telegram protocol adapters | `apps/api/src/telegram/shared/*`                                         | hydrated contracts such as `ResolvedEmoji`, never protocol clients                           |
| Stable cross-app contracts | `packages/shared`                                                        | serializable contracts and pure dependency-free helpers only                                 |

Internal Finance and consumer Finance are separate products. Similar money,
date, account, or transaction concepts do not authorize implementation imports
between them. A helper becomes neutral shared code only when at least two real
use cases have identical semantics and neither product owns the policy.

## Consumer application rule

A consumer application owns its business behavior, use cases and API,
presentation and UI, state/query layer, localization, and Telegram-specific
presentation behavior. Its browser Web App, Telegram Mini App, bot chat, and
future surfaces may share code inside that application's boundary.

An application connects to Telegram System through stable platform ports,
contracts, and low-level adapters. The platform may dispatch an application or
deliver its payload, but it must not import the application's presenters,
localization, menu construction, services, hooks, cache behavior, or UI.

Consumer Finance business and HTTP code lives under
`apps/api/src/domains/telegram/consumer-finance`. Its
`telegram-bots/finance` directory is a thin Telegram update/presentation
adapter, not a home for ledger, identity, billing, analytics, AI, or HTTP
business logic. The adapter depends inward on the Finance product and outward
on stable bot-platform ports; bot core never imports either Finance layer.

`telegram-bots.module.ts` is the composition root and may wire platform and
product providers. Composition permission does not make product internals
platform APIs. Do not create a generic application framework until Finance and
Greeter demonstrate the same concrete platform behavior; extract only that
behavior and keep product policy in the product.

## Dependency direction

```text
consumer application implementation
        |            |
        v            v
stable contracts   platform ports/facades
                         |
                         v
             Telegram adapters / common infrastructure
```

Allowed technical reuse includes Prisma infrastructure, authentication,
logging, security/encryption, generic HTTP utilities, low-level Telegram
adapters, stable serializable contracts, and genuinely generic pure helpers.

Forbidden without an explicit documented deviation:

- Finance importing Greeter implementation or the reverse;
- bot platform/core importing a product implementation;
- internal Finance importing consumer Finance implementation or the reverse;
- one product importing another product's UI, state, hooks, localization,
  presenters, API clients, cache behavior, or business services;
- direct GramJS/Telegram protocol imports outside `telegram/shared`;
- moving product rules into `common`, `core`, `shared`, or a generic framework
  simply to make an import legal.

## Presentation, database, and configuration boundaries

- App Router `page.tsx` reads params/search params and renders a feature
  container. Queries, mutations, API access, forms, tables, and modals live in
  feature modules.
- Controllers handle auth/context, DTO validation, one use-case/service call,
  and response mapping. They do not inject `PrismaService`.
- Application/domain services own business and Prisma orchestration. Extract a
  repository only for repeated, complex, or transactional persistence.
- React/Next details do not enter API domain/application logic; controller/DTO
  details do not enter pure business rules.
- Deployment secrets and topology are read through explicit configuration
  boundaries. Product constants remain code or persisted product settings, not
  environment variables added for convenience.

## Frontend network boundary

- One base client owns ordinary internal API transport; a distinct consumer
  authentication boundary may own a purpose-specific client.
- Consumer Finance owns its concrete controls, surfaces, modal, states,
  icon/avatar presentation, toast, query client, and visual tokens. It may use
  neutral HTTP and static emoji-data foundations, but it does not import the
  Telegram System product UI, provider state, API facade, or internal Finance
  helpers.
- Query keys come from the owning domain/application factory and invalidation
  stays as narrow as the changed read models.
- No idle polling, unjustified `refetchInterval`, per-row detail joins, N+1 HTTP,
  or new client wrappers. User-triggered bounded polling must name its active
  condition and stop condition in the architecture exception.
- Broad invalidation and N+1 behavior remain mandatory review checks when a
  reliable low-noise static rule cannot prove them.

## Static enforcement and deviations

`pnpm architecture:check` runs focused policy tests and then scans production
TypeScript/TSX without DB, network, or production startup. It enforces:

- file-size policies and exact shrinking-only legacy ceilings;
- product/platform import direction and consumer UI ownership;
- the two-Finance separation;
- framework-free shared contracts and backend domain/application logic;
- low-level Telegram SDK placement;
- no new Prisma-backed controllers;
- no new scattered `process.env`, frontend polling, or page-level query/API
  orchestration;
- no new frontend HTTP client constructor outside the approved transport
  boundary.

Legacy exceptions live beside the checker as exact source/target edges or
path/rule occurrence ceilings. Each carries a reason and removal slice. A
violation may shrink only: when its count decreases, the stale ceiling itself
fails until it is lowered or removed. New exceptions require a documented
architecture deviation and are not normal feature work. Finance-related
import exceptions were removed by the Consumer Finance boundary refactor; new
Finance edges must satisfy the product rules directly.

The checker intentionally does not act as a TypeScript compiler. Workspace
isolation, transaction preservation, broad invalidation, per-row requests,
circular dependency behavior, and semantic shared-code quality still require
tests and integration review. The source scan targets conventional ESM
imports and direct hook/config spellings used by this repository; aliases,
CommonJS `require`, and import-like text in comments remain review concerns
rather than reasons to grow the checker into a custom parser.

## Runtime cost

Architecture enforcement is development/build/CI-only. It adds no timers,
cron, polling, database queries or writes, external calls, services,
connections, or production logging. Idle Neon and Railway behavior must remain
unchanged after architecture-only work.

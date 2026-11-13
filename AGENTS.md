# AGENTS

## Project map

- `apps/api`: NestJS API composition host. Internal business modules live under `src/domains/{finance,growth,identity,operations,telegram,workspace}`; cross-domain infrastructure remains in `src/common`, `src/prisma`, and `src/telegram/shared`.
- `apps/web`: Next.js App Router composition host. URL-preserving route groups live under `src/app/(domain)`; internal domain UI and clients live under `src/components/features` and `src/lib/features`; shared providers, UI primitives, and app-wide utilities remain at their top-level locations.
- `products/finance`: the independent consumer Finance product. Its API use cases live in `api/*`, its thin Telegram runtime adapter in `bot/*`, and its product-owned UI, state, localization, and clients in `web/*`.
- Legacy `SimpleFinance*` Prisma records are retained as a non-runtime data layer
  until an approved data-retention migration; they are distinct from both
  consumer Finance and `apps/api/src/domains/finance`.
- `packages/shared`: shared TypeScript contracts used across API and web. Put stable cross-app response types here when both sides consume them.
- `apps/api/prisma/schema.prisma` and `apps/api/prisma/migrations`: database contract and migrations. Schema/API changes are incomplete until both are updated.
- Telegram adapters: `apps/api/src/telegram/shared/*` is the single integration layer for MTProto/Bot API details, parsing, entity resolution, and Telegram-specific helpers.
- Domain services: feature modules in `apps/api/src/domains/*/*` own business rules and Prisma orchestration. Reuse helpers before adding parallel logic paths.
- Telegram bots: `apps/api/src/domains/telegram/telegram-bots/core` is platform runtime infrastructure; `telegram-bots.module.ts` is the single Nest composition root that wires product adapters without making their implementation platform code.
- Frontend providers/components/lib: providers own app-wide state and feedback; `components/features/*` own domain UI; `lib/features/*` own domain clients and helpers; shared client behavior stays directly under `lib`.

## Global agent policy

- This root file is the single source of repository-wide agent guidance.
- Do not create `AGENTS.md` files inside `products/*` or product subfolders.
- The development-only scoped agents `finance-product`, `support-platform`, and
  `partner-platform` in `.codex/agents/` are permitted product/platform routing.
  They must read this workflow and the product-boundary document, stay within
  their declared scope, and never become production runtime services. Do not
  add other product-specific agents without an explicit architecture decision.
- Existing `apps/api/AGENTS.md`, `apps/web/AGENTS.md`, and
  `packages/shared/AGENTS.md` describe their technical hosts only; they do not
  define product agents or override this global policy.

## Architecture workflow

- For features touching frontend and backend, the main Codex agent acts as tech lead/integrator.
- First define the end-to-end flow and API contract, then split implementation by non-overlapping files.
- Backend and frontend agents must not independently invent different request/response shapes.
- Parallel write agents must never edit the same files.
- Significant refactors use `docs/refactoring/PROJECT_REFACTOR_EXEC_PLAN.md` and update progress as work lands.
- After implementation, the tech lead verifies integration, workspace isolation, query invalidation, tests and docs.
- Architecture-foundation/refactor tasks start with Grace Explorer read-only analysis and finish with Turing Review read-only integration review. The main agent owns final boundary decisions.
- Significant performance/refactor work follows this read/write lifecycle: Grace Explorer maps actual runtime paths; Knuth Performance audits cost and scaling; Parnas Structure checks existing file-size boundaries before edits; the main integrator fixes contracts and assigns non-overlapping backend/frontend files to Linus Backend and Ada Frontend; Parnas reruns the structural check; Turing Review performs the final read-only integration review.
- Grace, Knuth, Parnas and Turing are development-only, read-only agents. They must not become application processes, add production telemetry, or create Neon/Railway work. Knuth recommendations remain subject to `docs/runtime-cost-efficiency.md` and `docs/frontend-cache-efficiency.md`; Parnas uses `scripts/check-architecture.mjs` and never raises a threshold or shrinking-only baseline.

## Product boundaries

- Read `docs/architecture/PRODUCT_BOUNDARIES.md` before adding or moving a product, consumer application, bot application, cross-product import, shared abstraction, configuration access, or architecture exception.
- A consumer application owns its behavior, API/use cases, UI/presentation, state/query layer, localization, and Telegram-specific presentation. Its surfaces may share code inside that application boundary.
- `telegram-bots/core` is platform infrastructure and must not import consumer-product implementation. `telegram-bots.module.ts` may compose products through stable providers/ports.
- Internal Finance and consumer Finance are separate products. Do not share their implementation paths automatically because their concepts or names overlap.
- Product-to-product UI, services, hooks, state, presenters, query behavior, localization, and business-rule imports are forbidden. Reuse stable contracts and technical infrastructure; extract a neutral helper only after two real use cases prove identical semantics.
- Do not add architecture exceptions as ordinary feature work. Existing exact exceptions are shrinking-only and name their reason/removal slice; the completed Consumer Finance boundary has no import exceptions.

## Reuse before creation

Before adding a selector, picker, modal, table, form field, metric card, chart wrapper, page header, query hook or API type, search for existing implementations:

- `rg "function .*Select|const .*Select|MultiSelect|CustomSelect" apps/web/src`
- `rg "DateInput|DateRangeInput|Picker|Modal|Table|PageHeader|Metric" apps/web/src`
- `rg "queryKey:|invalidateQueries|useQuery|useMutation" apps/web/src`
- `rg "export type|export interface" packages/shared/src apps/web/src/lib apps/api/src`
- `rg "PrismaService|workspaceId|WorkspaceService" apps/api/src`

Prefer existing primitives, `apps/web/src/lib/query-keys.ts`, shared contracts and Telegram adapters over local duplicates, except where a documented consumer product owns its visual and query layer.

## Code knowledge graph

- For unfamiliar modules, architecture questions, callers, or cross-file flows, query the local Graphify MCP graph before tracing manually. Use ordinary code search for simple, local tasks.
- Before substantial refactors, check graph dependencies and downstream impact. Treat graph results as navigation evidence, not proof of runtime behavior; verify relevant source and tests.
- The source graph is in ignored `graphify-out/`. Build/update it with `pnpm graph build` or `pnpm graph update`. For continuous updates during a coding session, start `pnpm graph watch` in a terminal; it refreshes Graphify's `graph.json`, `graph.html`, and report for code changes. Stop it with Ctrl+C when finished.
- Open Graphify's built-in visualization by opening `graphify-out/graph.html`, or run `pnpm graph serve` and visit `http://localhost:8000`.
- The project-local Graphify MCP server reads `graphify-out/graph.json`; reload trusted project configuration in Codex after the initial graph build so its tools become available. Do not add the graph, watcher, or MCP server to API/web runtime services.

## Required reading

- Frontend tasks: `apps/web/AGENTS.md`, `docs/design-system/BRAND_GUIDE.md`, `docs/design-system/SERVICE_DESIGN_RULES.md`, `docs/design-system/COMPONENT_CATALOG.md`, `docs/frontend-cache-efficiency.md`.
- Backend tasks: `apps/api/AGENTS.md`, the relevant domain module, Prisma schema and existing tests.
- Shared contract tasks: `packages/shared/AGENTS.md`, backend DTO/controller and frontend API client usage.
- Cross-stack tasks: shared contracts, frontend API client, controller/DTO, relevant query keys and invalidation paths.
- Any production implementation that can create runtime work: `docs/runtime-cost-efficiency.md`.
- Product/application boundaries or architecture checks: `docs/architecture/PRODUCT_BOUNDARIES.md` and `docs/refactoring/PROJECT_REFACTOR_EXEC_PLAN.md`.

## Runtime cost efficiency

- Read and apply `docs/runtime-cost-efficiency.md` before adding production timers, cron jobs, polling, logging, persistence, external calls, or frontend refetching.
- Before hand-off, explicitly check idle polling, unchanged-state writes, 100-channel behavior, batching/N+1, retention, Neon sleep impact, and Railway CPU/RAM/network baseline.

## Before changing code

### Secret handling — mandatory

- Never print secrets, database connection strings with credentials, tokens, or complete environment/configuration files. Report only variable names, redacted metadata, status codes, or comparison results.
- Never place passwords or credential-bearing URLs in command-line arguments, shell interpolation, tool-call text, process listings, screenshots, logs, patches, commits, or generated reports. Do not use `ps` with command arguments when a process may carry secrets.
- Read credentials inside the executing process from approved environment/configuration sources. For database tools, use a private credential file or supported environment input; never a password-bearing `--dbname` argument.
- Capture and redact third-party tool responses before displaying them. Rotation tools may return passwords: keep these in memory and transfer them through a protected channel without displaying plaintext.
- Before credential rotation, inventory consumers; update their secrets, deploy/restart as required, verify new authentication and rejection of the old credential, and check application health. Rotating access does not require copying or replacing business data.
- Secret-bearing local files must be ignored by Git and restricted to the current user. Remove temporary secret material after verification. Never claim that historical chat/tool output was deleted unless deletion was actually verified.

1. Read neighboring files before editing.
2. Find usages with `rg`.
3. Check existing tests around the behavior.
4. Check whether a shared abstraction already exists in `packages/shared`, `apps/api/src/telegram/shared`, `apps/web/src/lib`, or `apps/web/src/providers`.
5. Review `git status` and relevant `git diff`.
6. Never destroy or overwrite the user's uncommitted changes. Changes are allowed when contracts and tests are updated with them.
7. If you temporarily start local dev servers or background processes for verification, stop them before handoff and mention that they were stopped.

## Change classification

### Local UI fix

- Read the page, nearby component, and shared primitive/provider it depends on.
- Run: `pnpm --filter web lint`, `pnpm --filter web typecheck`.
- Add or update a component test when behavior is user-visible.

### Domain feature

- Read controller, service, Prisma usage, and shared types.
- Add happy path, failure path, and regression coverage.
- Run: `pnpm --filter api test -- --runInBand`, `pnpm --filter api build`.

### Schema/API change

- Update Prisma schema, migration, API types, and shared contracts together.
- Remove the old path after migration instead of keeping two long-lived contracts.
- Run: `pnpm db:generate`, API tests/build, and web typecheck if the response shape is consumed there.

### Cross-cutting frontend behavior

- Implement in one shared layer, not page-by-page.
- Prefer `src/providers`, `src/lib`, or reusable `src/components`.
- Add a contract/component test and repo-wide search for the old pattern.

### Telegram integration

- Change Telegram-specific behavior in `apps/api/src/telegram/shared` or one shared service layer.
- Do not duplicate entity-resolution or parsing logic per operation.
- Add realistic failure coverage, not only happy path.

### Financial calculation

- Keep formulas centralized and observable.
- Add boundary tests and at least one regression test for the bug being fixed.

### Migration/refactor

- Refactors are allowed when contracts stay explicit and duplicate paths are removed.
- Do not mix unrelated cleanup into the same change.
- Run repo-wide usage search before and after.

## Cross-cutting rule

If behavior must work "across the site", do not patch multiple pages separately.

1. Find the shared layer.
2. Implement behavior there.
3. Remove local duplicates.
4. Add contract/component tests.
5. Run repo-wide search for the old pattern and clean it up.

## Workspace-local modal drafts

- Browser-local modal/form drafts use the canonical `useWorkspaceModalDrafts`
  session, `workspace-modal-drafts` storage codec, and `ModalDraftPicker`.
- Feature code supplies only its stable namespace, value/seed, normalization,
  meaningfulness, preview metadata, restore mapping, and successful-submit
  cleanup. It must not implement its own localStorage draft lifecycle.
- Before adding modal drafts, search for the canonical hook and picker. Multiple
  drafts, Continue/Delete/Create new, autosave, and workspace isolation must
  retain the shared UX semantics. See
  `docs/design-system/MODAL_DRAFTS.md` for the integration contract.

## System Bot website post import

- Website-driven System Bot post capture always uses the canonical shared post-import API and `useTelegramSystemBotPostFlow` with mode `single` or `multiple`.
- Feature-specific System Bot post-import endpoints, workflow kinds, transport adapters, and preview URLs are forbidden unless a separate architecture decision proves different capture semantics.
- Consumer features own only what happens after capture: draft placement, channels, slots, scheduling, validation, and domain persistence. See `docs/external-integrations/system-bot-post-import.md`.

## Emoji and icon architecture

- Display emoji/icons through the shared `ResolvedEmoji` contract and frontend `IconAvatar`.
- Backend entity responses must include resolved display data (`iconPresentation` or `avatarPresentation`) whenever the frontend needs to render an icon/avatar.
- Frontend lists, cards, tables and headers must not make `/icons/:id` requests only to render an existing entity. See `docs/emoji-architecture.md`.

## API read models

- Prisma models are not API contracts. Collection/read endpoints should use explicit purpose-built selects or mappers instead of returning full nested Prisma relations by convenience.
- List and detail endpoints may use different read models. Use compact relation summaries for nested display data, and keep heavy media/config/technical fields out of collections unless the use case needs them.
- Do not remove useful nested display data only to create frontend HTTP joins or N+1 requests. Response shaping must preserve workspace isolation, required presentation fields, and DB query performance.

## Tests required

- Every new feature needs a happy path.
- Add at least one realistic failure path.
- Add a regression test for the reported bug.
- Cover boundary cases.
- Do not create fixtures tied to one hardcoded user input, title, invite hash, or ID.
- Prefer observable behavior over only asserting that a mock was called.

## Definition of done

A change is not done until:

- backend/frontend/shared contracts are synchronized where relevant;
- loading/error/empty states are handled for user-visible UI;
- query invalidation uses shared key factories where possible;
- authorization and workspace isolation are checked;
- tests exist;
- relevant lint/typecheck/build commands are run and results are reported;
- usages were checked;
- shared types are updated where needed;
- error paths are handled;
- duplicate implementations are removed;
- documentation is updated when a new pattern appears;
- runtime-cost impact is assessed for production work, including idle behavior, recurring work, retention and the 100-channel estimate;
- manual QA steps are written in the final handoff.

## File-size policy

- Do not create new god files.
- Target handwritten production files at 100-400 lines.
- `pnpm architecture:check` warns above 500 lines and enforces hard policy above 800 lines.
- App Router `page.tsx` files must trend below 300 lines and should only read params/search params and render feature containers.
- API compatibility facades must trend below 400 lines; type barrels/index files below 250 lines; UI barrels below 150 lines.
- Existing files above these limits are transitional debt only. They are tracked in `scripts/check-architecture.mjs` as shrinking-only baseline entries and must never grow.
- Legacy ceilings must equal the current violation size. When debt shrinks, lower or remove the stale ceiling in the same change; the checker fails stale allowances so files cannot silently regrow.
- `ARCHITECTURE_STRICT=1 pnpm architecture:check` is the final gate: no transitional baseline, no god-file exceptions.
- Significant refactors must reduce or remove transitional baseline entries instead of adding new ones.
- When touching a file over the limit, consider a local cohesive extraction, but do not mix unrelated mass refactors into small features.
- Run `pnpm architecture:check` after architecture-sensitive changes.

## No overengineering

- Do not add an abstraction for one trivial use.
- Do not build a generic framework without at least two real use cases.
- Do not run unrelated refactors while implementing a feature.
- Do extract a shared layer when behavior is already duplicated or clearly cross-cutting.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

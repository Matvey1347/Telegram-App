# AI Sales CRM release readiness — stage 11

Local audit completed,2026-11-01 Europe/Warsaw. No production deployment, migration, paid AI request, real customer message or live source collection is authorized. Mock evidence is separate from staging/device/provider evidence.

## Integration dependency map (before fixes)

| Stage | Actual owner/runtime path | Depends on / produces |
| --- | --- | --- |
|1 Realtime |API `domains/telegram/telegram-crm` runtime/session lease → shared MTProto normalizer → batch store/writer → post-commit EventHub; web `lib/features/growth/use-crm-inbox-realtime.ts` |Account/workspace/session permission → canonical peer/conversation/message → visible SSE/cache reconciliation |
|2 Inbox |`telegram-crm-inbox-conversations.service.ts`, shared CRM read models; web `crm-inbox`, `use-crm-thread`, neutral `components/chat` |Cursor dialog/history contracts; exact account/peer; narrow query keys |
|3 Notifications |Incoming/internal projectors → `domains/operations/notifications`; PWA worker |Current recipient/visibility, opt-in, current nondeleted message/task → bounded delivery and deep-link |
|4 Sales |CRM sales workflow/package/purchase context → canonical advertiser/tasks/deals |Manual sales status/DNC and message facts remain distinct; follow-up uses existing due scheduler |
|5 AI infrastructure |`domains/operations/ai` Gateway/admission/reservation/ledger/usage |Permissions/config/master/category/grants/budget → provider receipt/token and cost accounting; UNKNOWN cost held |
|6 Copilot |CRM context/drafts/send guard → existing manual send |Permitted current conversation/purchase/product context → explicit Generate/Edit/Approve → current guard → manual Send |
|7 Discovery |CRM `lead-discovery` source/transport/ingest/monitor/retention |Explicit source eligibility/coverage → observed evidence/classification/contacts/candidate; shared account runtime |
|8 Qualification |Lead qualification/preparation context/candidate drafts |Reviewed evidence/link/source eligibility + AI Gateway → explicit qualify/decision/draft/approval/fresh Copy |
|9 Instagram |Canonical advertiser/contact/activity/task + manual workflow |Human identity linking, permitted candidate draft Copy/manual report; no fake Telegram/Direct conversation |
|10 Chat actions |Shared MTProto `chatActions`; CRM action/media/receipts/store + neutral UI adapter |Real original IDs/current permissions → durable UNKNOWN claim → provider → canonical store/tombstones/SSE; lazy bounded media |

Cross-stage invariants to verify: workspace/account identity; current own/any and source-processing grants; DNC/pricing/approval freshness immediately before external side effects; canonical message/task/client stores; no new idle polling; UNKNOWN receipts survive ambiguity; no private media/prompt/session leakage; independent transport capabilities for mock Support.

The audit findings, gates and decision below separate executed local checks from missing production/staging evidence.

## Final decision

**NO-GO for production rollout.** Local integration/build blockers were fixed, the representative forward migration passed and mock/browser gates are useful, but the empty bootstrap chain, global failures, lease lifecycle/capacity conditions and unexecuted real staging/provider/device acceptance remain. No production deployment, real migration or real customer send was performed.

[Final QA](../qa/ai-sales-crm-final/README.md), [release checklist](../qa/ai-sales-crm-final/release-checklist.md), [full flag catalog](../qa/ai-sales-crm-final/feature-flags.md), [performance/AI evidence](../qa/ai-sales-crm-final/performance-audit.md), [failure classification](../qa/ai-sales-crm-final/failure-classification.md), [migration execution](../qa/ai-sales-crm-final/migrations/README.md), [stage file manifest](../qa/ai-sales-crm-final/changed-files.txt).

## Stage status and compatibility

| Stage | Local status | Production acceptance still required |
| --- | --- | --- |
|1 Realtime |Canonical batch/SSE path integrated; current membership/owner gate added |Controlled MTProto reconnect, account lease/failover and multi-instance browser routing |
|2 Inbox |Cursor/read models, narrow cache and neutral UI tests pass |Representative volume/latency and actual-device navigation |
|3 Notifications/PWA |Current recipient/nondeleted-message/task policy and mock push navigation covered |Real opt-in/device/VAPID/iPhone acceptance; candidate-qualified notification remains reserved |
|4 Sales/follow-up |DNC/status/task/package/purchase contracts covered; merge rechecks locked owners |Actual due delivery/recipient changes and PostgreSQL transaction contention |
|5 AI Gateway/Usage |Budget/ledger/UNKNOWN/source contracts and offline tests pass |Account-specific model access, approved paid receipts/token/pricing and quality review |
|6 Copilot |Fresh send/approval/context gates, retained unresolved drafts and compact mobile UI covered |Real model human-scored proposals and permitted controlled send |
|7 Discovery |Grants, bounded ingest/coverage/dedup/review tests covered |Authorized source access, real recovery and retained-volume SQL/storage measurements |
|8 Qualification |Human decision/fresh Copy, source eligibility and UNKNOWN parent retention covered |Human-labeled risk/relevance calibration and first-offer quality/cost |
|9 Instagram manual |Canonical identity/activity/follow-up/AI Copy covered |Manager staging acceptance; no personal Direct integration exists |
|10 Actions/media |Real transport methods behind default-off flags; mock mutations and authorized lazy media covered |Consenting test peers, native restrictions, unknown outcomes, actual codec/device behavior |

Shared Chat UI remains transport-neutral; mock Support adapter demonstrates capability differences without importing CRM DNC, prices, leads, session state or runtime. No Bot Support product/runtime/ticket database was added.

## Blockers fixed in this stage

- Five API TypeScript errors: validated runtime selection now uses the Prisma enum; channel import raw rows have an explicit typed read model. No `as any`/ignore was introduced and business policy was preserved. [Branding regression](../../apps/api/src/domains/telegram/telegram-bots/core/system-bot-branding-startup.service.spec.ts), [account import regression](../../apps/api/src/domains/telegram/telegram-user-accounts/telegram-user-accounts-import-regression.spec.ts).
- Three CRM fixture failures: import settings mocks and sales-summary expected projection now match actual canonical contracts. [Dialog writer fixture](../../apps/api/src/domains/telegram/telegram-crm/telegram-crm-dialog-batch-writer.service.spec.ts), [sales summary](../../apps/api/src/domains/telegram/telegram-crm/telegram-crm-contact-sales-summary.spec.ts).
- Full Jest reporting: development drain test no longer installs an actual forced exit; fake timers/injected callback/cleanup preserve production shutdown. [Drain tests](../../apps/api/src/common/http/development-connection-drain.spec.ts).
- Fresh role/ownership boundaries: manual send refreshes immediately before claim/transport; merge refreshes after row locks; stream rechecks membership and current resource owner before bounded event delivery. [Manual send](../../apps/api/src/domains/telegram/telegram-crm/telegram-crm-manual-send.service.ts), [stream access](../../apps/api/src/domains/telegram/telegram-crm/telegram-crm-stream-access.service.ts), [merge](../../apps/api/src/domains/telegram/telegram-crm/telegram-crm-contact-merge.service.ts).
- Sensitive CRM and legacy Sales responses bypass the server response cache, including manual contacts. This avoids returning cached data before current authorization. Client query keys still bound workspace reads; no per-row polling was added. [Cache interceptor/tests](../../apps/api/src/common/response-cache.interceptor.spec.ts).
- UNKNOWN lifecycle: expired Copilot drafts and parent candidates of unresolved qualification/draft claims are protected against cleanup/cascade deletion. Financial holds remain separate and unchanged. [Copilot retention](../../apps/api/src/domains/telegram/telegram-crm/telegram-crm-ai-draft-retention.service.ts), [lead retention](../../apps/api/src/domains/telegram/telegram-crm/lead-discovery/lead-retention.service.ts).
- Frontend integration: updated old retry fixtures to distinguish definitive4xx from UNKNOWN, guarded imperative resends, included AI query family in workspace reset/cancel, and compacted mobile AI Usage cards. [Thread hook](../../apps/web/src/components/features/growth/ad-sales/crm/use-crm-thread.ts), [query provider](../../apps/web/src/providers/query-provider.tsx), [dashboard](../../apps/web/src/components/features/operations/ai/ai-dashboard.tsx).
- Web test runner ownership: Vitest now collects product web tests, while existing API Jest continues owning product API/bot tests. Backend suites are not deleted or hidden; full API failures remain reported. [Vitest configuration](../../apps/web/vitest.config.ts).

## Migrations and existing data

Nine new migrations in order: `20261031080000_crm_notification_preferences` → `20261031110000_crm_sales_workflow` → `20261031150000_internal_ai_infrastructure` → `20261031180000_crm_ai_sales_copilot` → `20261101010000_telegram_lead_discovery` → `20261101100000_ai_lead_qualification` → `20261101120000_crm_instagram_contact_type` → `20261101120100_crm_instagram_manual_contacts` → `20261101130000_telegram_chat_actions`.

A new Unix-socket-only local PostgreSQL17 cluster executed all196 migrations for a synthetic existing-schema fixture, including those nine; final schema drift was zero. Real PostgreSQL probes rejected cross-workspace/duplicate/pending-target conflicts and verified partial indexes, cascade and preservation of a legacy OTHER Instagram method. Separate enum commit/order is preserved. The script stopped and removed its cluster. [Reproduction/evidence](../qa/ai-sales-crm-final/migrations/README.md).

The genuinely empty clean chain failed at historical `20260814000001_enable_finance_for_business_workspace`, which assumes a hardcoded Workspace exists and raises23503. The representative fixture explicitly satisfies that historical precondition; it does not make clean bootstrap pass. Production/sanitized snapshot compatibility, duplicates, populated-table locks/index build time and restore rehearsal remain NOT EXECUTED. Historical SQL was not rewritten or marked applied on a real database. NO-GO until bootstrap policy is repaired/reviewed and target history is validated separately.

## Security and race boundaries

New regression coverage checks revoked permission after runtime wait, changed owner after merge lock wait, stale stream event ownership/membership and pending authorization overflow/unsubscribe. Stream batches have current authorization reads but are not a global atomic authorization+network-delivery transaction; revocation after the last read cannot retract bytes already delivered. Existing local EventHub does not guarantee cross-instance routing. The new guard adds event-driven read cost, explicitly modeled in performance evidence.

DNC/pricing/budget/source grants/current identity remain authoritative; no cache was introduced to weaken freshness. AI requests have no tools/send ability, strict schema and explicit source processing gates. Browser projections contain no StringSession/API secret/private prompt transcript; media references remain same-account server-side. Unknown outcomes remain held rather than refunded/retried or represented as delivered/read. Merge refresh uses a second ordinary authorization read while the transaction owns contact locks; actual pool/lock contention needs staging testing.

No P0 was found locally; that is not a proof of absence. No unresolved known newly introduced production P1/P2 remained after independent Turing review and root fixture corrections. Existing contract/test failures and external acceptance conditions remain release blockers; exact severities below and in failure classification.

## Neon, Railway and AI validation

All actual versus estimated values are separated in [performance evidence](../qa/ai-sales-crm-final/performance-audit.md). No Neon p50/p95, EXPLAIN/BUFFERS, live connection count, production storage or Railway CPU/RSS/egress was measured. Local migration probes are not representative load measurements.

Existing runtime lease renews once/30s (~2,880 writes/day) at zero events and currently survives stopping the final account until restart. Discovery10k/day/workspace can outrun20k/day global cleanup at three saturated workspaces; automatic recovery is only20 sources/account/pass. Source analytics can scan large retained evidence despite paginated results. No speculative Redis/cache/query rewrite was added without measured evidence.

Offline validation covered48 Copilot and60 qualification scenarios and six harness safety tests. Published registry model IDs/standard unit rates were checked against official documentation, but deployment access/actual receipt USD, quality, token averages, naturalness and unsupported-claim rate are NOT RUN. No paid benchmark/budget was authorized. The comparison table deliberately contains NOT RUN rather than fabricated quality scores.

## Remaining severity register

| Severity | Remaining issue / acceptance condition | Disposition |
| --- | --- | --- |
|P0 |None identified by local audit |Not a security certification |
|P1 release gate |Full API/web checks still have unchanged global failures, including financial-rate/markup assertions that need owner triage |NO-GO; exact failing cases/classification retained |
|P1 bootstrap |Empty clean migration chain requires historical hardcoded Workspace |Repair/review bootstrap separately; never seed invented data into production to force passage |
|P1 external acceptance |No approved real Telegram/Push/provider/device/sanitized snapshot acceptance |Requires separately authorized staging and actual hardware |
|P2 runtime |Last stopped CRM account leaves lease renewal active |Disable/drain/restart mitigation; serialized lifecycle fix still needed |
|P2 capacity |Global retention headroom,20-source recovery, analytics scans, pool/fanout contention unmeasured |Restrict planned pilot; measure before broad enablement |
|P2 architecture |22 normal/28 strict inherited violations; global lint debt remains |Existing gate remains red, no allowance raised |
|P2 verification environment |Node24.18.0 full Jest can crash inside native V8 GC without summary; pinned20.19.0 and22.22.2 return complete red summaries |Record crashes separately; align and verify dev/CI/production on a supported runtime |
|P1 release prerequisite |Repository pin Node20 is EOL; compatibility tests pass but lifecycle support is expired |Review supported LTS selection and rerun aligned gates before production; [official release schedule](https://nodejs.org/en/about/previous-releases) |
|P2 lifecycle |UNKNOWN domain/financial claims retained; some recovery requires verified operator action |Do not delete evidence to enable retry; review pending growth |
|P3 UX/quality |Physical keyboard/voice/push behavior and real AI tone/risk calibration unapproved |Manual device/rubric acceptance; fixture screenshots are not proof |

## Rollout and rollback instructions

Do not deploy from this audit. Once NO-GO items are closed, use the staged [checklist](../qa/ai-sales-crm-final/release-checklist.md): validate target migration history/backup/restore and grants; deploy API/shared/web together with gates off; test core CRM first; then opt-in notifications, actions/media, AI budgets/Gateway, Copilot, sources, qualification and optional manual Instagram one at a time. Use one reviewed pilot workspace, at most20 monitored sources/account and limited visible clients until actual capacity evidence exists; all other grants remain absent. Real sends/provider evaluation require explicit approval and test identities/budget.

Rollback stops new admissions/outreach via existing account/deployment/category/grant gates, drains active bounded operations and restarts after all CRM accounts are disabled if releasing the persistent lease is needed. Keep additive schema, canonical sales/payment history, DNC, tombstones and UNKNOWN/TEXT/financial receipts. Reconcile ambiguous paid/remote outcomes from verified receipts, never an inferred zero. Do not blindly drop enums, restore unsafe cached reads or old retry behavior. Destructive schema/data reversal needs a separately reviewed export/restore plan.

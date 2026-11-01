# Release acceptance checklist

Current decision: **NO-GO**. Checked boxes below are local evidence only; unchecked external acceptance is not PASSED. No production deployment or production migration is authorized by this document.

## Executed locally

- [x] Stages1–10 integration map and actual API/Prisma/UI/runtime ownership audited.
- [x] Five original API TypeScript blockers and three CRM fixture failures fixed with regressions.
- [x] Development drain tests no longer force-exit Jest; production shutdown unchanged; full API returns a final summary and exit1 for real remaining failures.
- [x] Fresh manual-send/merge/stream authorization and server cache bypass tested.
- [x] UNKNOWN domain retention/cascade guards tested; financial holds not refunded or erased.
- [x] API/shared/web typecheck/build executed; scoped tests/lint and normal/strict architecture executed; red global gates remain reported.
- [x] Disposable local PostgreSQL17 forward migration and zero drift verified; FK/unique/partial/cascade/preserved legacy identity probes executed.
- [x] Empty clean bootstrap attempted and genuinely FAILED; no historical migration rewritten to conceal it.
- [x] Offline48/60-scenario harness validation and six guard tests executed; no generated-output quality or paid cost invented.
- [x] Mock browser QA35/35 at320/360/390/768/1024/1440;25 screenshots; physical iPhone remains untested.
- [x] Native PostgreSQL test server stopped/removed and browsers closed; existing localhost server left untouched.

- [x] Exact pinned Node20.19.0 checksum-verified temporary runtime: API typecheck/build and web build passed; full API returned the same complete red summary as Node22. Temporary runtime removed.

## Close release blockers before enabling a pilot

- [ ] Select and align a supported Node LTS across dev/CI/production and rerun release gates; current Node20 pin is EOL ([official schedule](https://nodejs.org/en/about/previous-releases)). Local compatibility does not establish ongoing runtime support.
- [ ] Resolve/approve historical bootstrap precondition with migration owners; rerun genuine empty clean chain and representative forward chain. Never insert the synthetic hardcoded Workspace into production just to force passage.
- [ ] Triage every remaining API/web failing case, distinguishing stale fixtures from actual business defects; financial-rate and parser fidelity cases need explicit owner conclusions. Restore green applicable release gates or obtain a documented risk decision; do not relabel red as PASS.
- [ ] Address normal/strict architecture and global lint gate disposition without raising shrinking-only ceilings.
- [ ] Implement/test serialized last-account lease release, or explicitly accept the documented drain+restart operational mitigation for a narrowly controlled pilot. Never remove active-session exclusivity.
- [ ] Approve exact target staging environment, test Telegram accounts/peers, Web Push device and synthetic/permitted source identities. Do not use real customer recipients.
- [ ] Approve finite AI budgets, operation limits, data-processing grants and any paid benchmark separately. No API key/provider call is required for offline harness mode.
- [ ] Capture representative SQL plans/counts/BUFFERS/p50/p95, pool/locks, storage/backlog and24h idle CPU/RSS/socket/SSE baseline. One local synthetic migration is not a load benchmark.
- [ ] Start with one reviewed workspace, ≤20 monitored sources/account and limited visible clients; keep other grants absent. Ensure aggregate evidence arrival remains below global retention capacity and monitor pending UNKNOWN growth.

## Database readiness — separately authorized staging

- [ ] Confirm target environment identity and backup/restore rehearsal; inspect `_prisma_migrations` actual checksums/status and existing-data compatibility. Do not automatically reuse a developer's current DATABASE_URL.
- [ ] Validate ordered nine-stage migration inventory, separate Instagram enum commit, populated-table lock/index build duration and uniqueness conflicts.
- [ ] Preserve canonical clients/messages/tasks/deals, legacy OTHER contacts, financial attribution, workspace composite FKs and UNKNOWN receipts.
- [ ] Test actual concurrent unique operation claims, budget advisory locks, ownership changes while row locks wait, delete-before-HTTP persistence and retention/claim races.
- [ ] Deploy schema then synchronized shared/API/web, all risky gates off; verify old manual text and rollback-compatible readers.

## Controlled end-to-end A–G — real staging, NOT RUN

- [ ] A Telegram: connect consenting account; inbound→canonical store→Inbox/SSE/unread→opt-in notification→history; reply once; lost response/reconnect without duplicate; permission/owner revocation while stream and send wait.
- [ ] B Actions: native reply linkage; own/foreign/expired edits; delete me/everyone and unknown revoke; allowed/premium/custom reaction failures; protected/same-account forward; rich Unicode; lazy authorized image/file/audio; Ogg/Opus versus explicit fallback; cancel/timeout/DB failure; duplicate-key and new-key UNKNOWN protections.
- [ ] C Sales: NEEDS_REPLY→manual answer→WAITING_FOR_CLIENT; scheduled/snoozed/cancelled/completed follow-up; current recipient/deep-link; purchases/currencies/packages; DNC/CLOSED/archive; current-owner merge and unchanged financial history.
- [ ] D Discovery: approved source/channel access distinct from processing grant; import/capture/classify/extract/dedup/human review/link; source export; access loss/revocation/edit/delete; gaps/overflow/recovery; NO_ADS_30D only with proven coverage.
- [ ] E Qualification: explicit qualify with literal evidence; explainable scores/risks; independent human decision/high-risk acknowledgement; explicit first offer/edit/approve/fresh Copy; expired/stale/DNC/source/pricing blocks.
- [ ] F Copilot: reviewed bounded conversation/notes/products; explicit generation and actual receipt; budget exhaustion/held UNKNOWN; Save/Approve/current-context check/manual Send; Usage reconciles exactly without exposing prompts or another workspace.
- [ ] G Instagram: Instagram-only and combined client; human identity confirmation/rename/stale state/conflict; safe profile open; approved draft Copy; manual offer/contact/reply facts; peerless follow-up; no fake Direct/unread/delivery.
- [ ] For every flow test view-only, own-only, any, unauthorized workspace/account and grants revoked during already-started work. Record current safety boundary; bytes already sent cannot be revoked.

## Physical iPhone / PWA — REQUIRES MANUAL QA

- [ ] Record device/iOS/Safari version, test origin/build and installed Home Screen mode; use approved test account.
- [ ] Verify standalone launch, sign-in/workspace switch and secure-origin service worker lifecycle. Private chat/AI data must not appear from a previous user/workspace cache.
- [ ] Explicit notification permission/opt-in, subscribe/unsubscribe, app background/closed, Web Push received once and exact authorized deep-link; deny permission and show actionable disabled state.
- [ ] Open Inbox at320/360/390-equivalent widths; chat switch/Browser Back/details drawer restore focus and scroll. Collapse/expand Copilot; ordinary answer stays reachable.
- [ ] Open virtual keyboard in reply/edit/normal composer; safe area and Send remain visible, no background scroll trap/overlapping controls; IME composition does not send accidentally.
- [ ] File picker/camera permissions, preview, explicit Send, cancel and reconnect; no eager gallery download or automatic upload.
- [ ] Microphone allow/deny/pending-cancel, late stream cleanup, native supported voice preview/playback, explicit file fallback when Ogg/Opus unsupported. Do not label a WebM blob as Telegram voice.
- [ ] Offline/unavailable state retains local draft but does not queue automatic commercial sends. Resume foreground reconnect reconciles narrowly; unknown outcomes remain unknown until established.
- [ ] Remove/revoke role or workspace while app is backgrounded; resume must not expose new private content or execute stale Send/Copy.

## AI paid evaluation — separately approved, NOT RUN

- [ ] Confirm model IDs/account access and actual provider-reported model/tier/usage. Verify standard rates, cache dimensions and billing region from current official documentation/receipts.
- [ ] Approve budget and fixture mapping, then use guarded staging harness with a small serial limit; stop on FAILED/UNKNOWN/unpriced. No Telegram send is part of model evaluation.
- [ ] Human-score accuracy, naturalness, personalization, business relevance and unsupported claims; measure average actual tokens/USD per category. Do not approve from mocked schema tests alone.
- [ ] Exercise budget races, provider timeout, DB-after-provider failure and verified reconciliation without inferred free usage or automatic paid retries.

## Staged enable order and rollback

- [ ] Stage1 database+build readiness, Stage2 core CRM, Stage3 internal notifications then device opt-in, Stage4 Telegram actions then media, Stage5 AI budgets/Gateway, Stage6 Copilot, Stage7 Discovery, Stage8 qualification, Stage9 optional manual Instagram, Stage10 final signed acceptance.
- [ ] At each step record build/migration/permission/grant/config version, actual baseline/current metrics, test identities, results and rollback owner. Do not enable every flag together.
- [ ] On failure disable new admissions/sends/source grants; let active bounded work settle; drain/restart after disabling all CRM accounts to release the persistent lease safely.
- [ ] Retain additive tables/enums, DNC, financial history, deleted identities and UNKNOWN/TEXT/paid receipts. Reconcile ambiguous outcomes from independently verified receipts; do not clear claims merely to retry.
- [ ] Any destructive schema/data rollback requires separate reviewed export/restore. This checklist itself authorizes no production action.

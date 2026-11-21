# Production acceptance · Nexeloq and Groshly

**2026-11-21 UTC · BLOCKED before release.** Working tree on
`codex/channel-avatar-custom-emoji` at
`8363f61db2b96484b2561162f5ff4f715931cb1d`.
GitHub `Matvey1347/Telegram-App` main was observed at
`8ad8b3ec33b44a5530ba71758c3f4f08f91937ca`. The working diff remains open
and the release candidate is unsealed. No production service was changed.

## Actual deployments and rollback targets

Railway project **ALL API** and the Vercel production aliases were checked
through their deployment metadata. Retain the currently served artifacts as
the code rollback targets for the next release. Credentials and the Finance
webhook's full URL are omitted.

| Service | Active artifact on 2026-11-21 | Origin |
| --- | --- | --- |
| Railway **Nexeloq API** and consumer bot runtime | `a6d5b019-7aae-488d-94af-9ad62c7cc557`, SUCCESS, image `sha256:7e0a191ee25662b179f6f6bd4f399230656e95af6570ede7fba4295e6a64a47f`. The prior release record maps this source-upload deployment to `b7f481b1`. | `https://api.nexeloq.com` |
| Vercel **nexeloq** | `dpl_7HZbkrNdamQ1tcUffsPqkNHykBd3`, READY. The prior release record maps this source-upload deployment to `b7f481b1`. | `https://nexeloq.com`, `https://www.nexeloq.com` |
| Vercel **finance_web** | `dpl_BFinvK9mEUhUULezLD8v9hAXJ6BY`, READY, GitHub `main` at `471abd3c742da2f09585926abb191a06bbf66656`. More recent production attempts were cancelled. | `https://groshly.nexeloq.com` |
| Railway **Finance API** | `88835616-ddd7-431e-b83a-df487bdc2c14`, SUCCESS, GitHub `main` at `471abd3c742da2f09585926abb191a06bbf66656`, image `sha256:e5599dbbbac32952925adc48057e43cc786d47a36fce2b52452d915787fbdfa8`. Independent analytics host. | `https://api.groshly.nexeloq.com` |

Release evidence is the Railway active deployment and image metadata plus
Vercel production alias inspection. The source-upload attribution is recorded
in [the previous production release](../telegram/CHANNEL_RESCHEDULING.md).
Current artifacts were not replaced.

## Verification and gate state

| Category | Result |
| --- | --- |
| LOCAL_TEST | Node 20.19.0 and pnpm 9.0.0. Frozen install, i18n, typechecks, application builds and artifact verification passed. Deployment checks passed 61 tests, Nexeloq web passed 2,107, standalone Finance API passed 53, and Groshly web passed 418 including consumer product coverage. Nexeloq API billing, web lint and strict architecture retain failures. |
| LOCAL_DB | Both Prisma migration trains applied to separate disposable PostgreSQL databases. The compatibility schema diff reported no difference. 14 operator and send-journal tests passed with real PostgreSQL and controlled Telegram I/O. Both disposable databases were removed. |
| LIVE_API | API health responses were 200. The operator transport version route was 404. A read-only inventory found none of the three `20261121` migrations on the production compatibility target. Groshly web and Nexeloq API returned the same bot context and HTTP 200 for the unauthenticated consumer session route. Standalone Finance API returned a different bot context and HTTP 404 for that route. Railway returned three INFO entries and no WARN/ERROR entries for the active Nexeloq deployment between 09:48 and 09:51 UTC. |
| LIVE_UI | Headless Chrome opened `www.nexeloq.com/login` and `groshly.nexeloq.com/login` at 09:49 UTC. Both loaded with HTTP 200. The observed network window had zero HTTP errors, failed requests, page errors and console errors. Authenticated flows remain pending. |
| LIVE_TELEGRAM | Compatibility DB records one Finance PRODUCTION runtime as ACTIVE/CONFIGURED with webhook host `api.nexeloq.com`. Telegram `getWebhookInfo` returned 401 with the protected token from that runtime. Current Telegram ownership could not be confirmed. No Telegram mutation or business acceptance was performed. |

`pnpm ai:sync`, `pnpm ai:sync --execute` and the AI check in
`pnpm release:check` found zero pending receipts and inserted no rows. No
paid provider call was made. The release check then stopped at architecture.
The strict gate fails on this workspace and on a clean archive of `8363f61d`.
No hooks, baselines or limits were widened.

The root and standalone Finance Railway Dockerfiles built locally on ARM64
after installing native build tools for the frozen dependency install.
The image manifest lists are `sha256:8a925f991b7640999d999eeb281ee316d9a5bbfd8b4f2cfc8c231c98fc10ffa6`
and `sha256:025954d330a28111c396a215b9deba472eef2f739a4becf7bb9c138db492e209`.
These builds validate the Dockerfile paths on intermediate snapshots of the
working diff. The latest application builds are separate local checks.

The strict architecture run reported 31 violations. These include inherited
file-size violations, a growing route import allowance and a Finance
environment access violation. The full Nexeloq API run finished with
4,341 passed, 3 failed and 34 skipped. All three failures are in
`bot-billing.service.spec.ts`. Its overview fixture lacks the current
`aiUsageEvent` delegate, and the billing service ignores the explicit
environment on the overview and user listing. The targeted publication
regressions passed 162 tests. Another 14 tests in that selection require
PostgreSQL and passed in the separate LOCAL_DB run. Web lint reported
138 errors and 171 warnings.

Redacted local evidence is recorded in
`/tmp/recovery4-{browser-public,finance-route,webhook-read,prod-db-read,local-pg}.log`
on the verification machine. The browser instance was closed and the
development ports 3000, 3001, 4000, 4001, 4002 and 4100 had no listeners.

## Release order after gates pass

1. Seal and record the tested candidate commit and artifact digest for each
   runtime. Use the pinned toolchain and immutable lockfile. Version and
   snapshot the current rollback artifacts listed above.
2. Through the existing Nexeloq Railway predeploy migration process apply
   `20261121120000_campaign_invite_window_attempt`,
   `20261121121000_invite_counter_observations`, and
   `20261121122000_operator_send_receipts`. Drain snapshot readers that
   cannot read null observations before enabling the new writer. Check
   migration status, schema compatibility and the Railway transport v1
   contract before starting an operator. The operator does not run migrations.
3. Use the Railway bootstrap API and the sealed local operator candidate with
   one private fixture. Verify payload, ACK, IDs and DB projection. Then
   deploy the tested Nexeloq product API and web and the Groshly web artifact
   against that compatible API. Keep standalone Finance API off the consumer
   path. Do not copy user data or run production Finance extraction.
4. Verify protected settings by name. Nexeloq API uses `DATABASE_URL`,
   `BOT_TOKEN_ENCRYPTION_KEY`, `JWT_SECRET`, `TELEGRAM_BOT_RUNTIME_ENVIRONMENT`,
   `FRONTEND_URL` and `API_PUBLIC_URL`. Groshly web uses
   `NEXT_PUBLIC_FINANCE_API_URL` and `FINANCE_API_PROXY_URL`. The standalone
   API uses its own `FINANCE_DATABASE_URL`. Keep Finance production token
   provisioning in the protected runtime workflow and confirm one webhook
   owner by querying Telegram. Keep a secure prior configuration snapshot.
5. Verify the live artifact IDs after cutover. Roll back code or aliases to a
   verified compatible artifact when indicated. Preserve additive data and
   Telegram effects, and reconcile every ambiguous send before another attempt.

## Pending product acceptance

- Finance login via the production Telegram bot, reload, logout/login and
  existing profile/history. Open its Mini App, issue `/start` and the agreed
  read-only command. Add, reread and undo one ledger entry in the approved
  test account.
- Nexeloq login and the previously transferred channel. Check the canonical
  ID, per-stage rights, history, invites, pending requests, campaign and VP
  observations. Keep unknown observations unknown.
- Separate approved fixtures for local operator publication, deployed
  publisher and Ad Sales. Verify one message per fixture, exact journal and
  DB outcome, Telegram content/IDs, and UI reload. Reconcile an existing
  publication without resending. Schedule, move and cancel a fourth future
  fixture while preserving the protected queue.
- Check the browser network and console, a bounded API/worker log window,
  and local process cleanup. Record UTC, confirmed identities and redacted
  evidence for the exact paths that complete.

Before live mutations, provision a valid credential for the intended
production Finance bot through the protected runtime workflow and confirm
its current webhook in Telegram. Acceptance requires the approved Finance
test profile/account, the already transferred channel and its workspace,
three distinct publish fixtures including the Ad Sales sale/placement IDs,
and a separate future fixture with approved message content.

## Local architecture and tooling follow-up

The local refactor closed all 31 original strict diagnostics. The mandatory
strict and normal architecture checks now pass. The latest release check
passed AI receipt reconciliation, Prisma generation, architecture and i18n,
then stopped at lint. The web lint step reported 110 errors and 139 warnings.
A separate API lint run also failed. No release candidate was promoted.
The production deployment identifiers and live acceptance status above
still refer to the served versions. Follow the same bootstrap and scoped
fixture sequence once the mandatory release checks pass.

Local follow-up tests passed with 4,344 Nexeloq API tests, 2,110 Nexeloq
web tests, 53 standalone Finance API tests, and 419 Groshly web tests.
Fourteen publication tests passed separately on disposable PostgreSQL.
The source archive was unpacked and passed the frozen install, offline
tooling, deployment checks, strict architecture, and Nexeloq builds.

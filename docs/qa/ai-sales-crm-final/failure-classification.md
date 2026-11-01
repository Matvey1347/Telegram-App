# Failure classification

Final pinned Node20.19.0 and Node22.22.2 pnpm API runs (same results):504 passed /13 failed suites;3300 passed /23 failed tests. All13 failing test files are unchanged against the stage11 before-hash manifest. This establishes attribution, not that the underlying behavior is correct. Full API returned exit1 with a trustworthy summary. [Machine evidence](api-failures.json).

No unresolved stage11 regression is being relabeled baseline. The new Copilot authorization mock and Clients custom-selector fixture drift were fixed and retested. Later Node24 full-suite attempts (including sequential) crashed inside native V8 GC without a summary: ENVIRONMENT_ERROR, cause unestablished, never counted as passes. An alternate direct-Jest run also exposed two module-resolution errors caused by bypassing the pnpm shim; that invocation is INVALID_TEST_CONFIGURATION, superseded by the normal pnpm-script invocation on installed Node22.22.2. See runtime-diagnostics.json. The original forced process.exit test issue was fixed in test infrastructure only.

|API file|Classification|Failed cases|Disposition|
|---|---|---:|---|
|[telegram-channels.characterization.spec.ts](../../../apps/api/src/domains/telegram/telegram-channels/telegram-channels.characterization.spec.ts)|INVALID_TEST_CONFIGURATION|1|P2, inherited; owner triage required|
|[telegram-system-bot-handler-layout.spec.ts](../../../apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-handler-layout.spec.ts)|OLD_TECHNICAL_DEBT|1|P2, inherited; owner triage required|
|[telegram-unified-import.service.spec.ts](../../../apps/api/src/domains/telegram/telegram-channels/telegram-unified-import.service.spec.ts)|OLD_TECHNICAL_DEBT|1|P2, inherited; owner triage required|
|[managed-post-scheduling-identity.spec.ts](../../../apps/api/src/domains/telegram/telegram-channels/managed-post-scheduling-identity.spec.ts)|INVALID_TEST_CONFIGURATION|4|P2, inherited; owner triage required|
|[bot-billing.service.spec.ts](../../../apps/api/src/domains/telegram/bot-billing/bot-billing.service.spec.ts)|INVALID_TEST_CONFIGURATION|3|P2, inherited; owner triage required|
|[telegram-system-bot-post-flow-groups.spec.ts](../../../apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-post-flow-groups.spec.ts)|OLD_TECHNICAL_DEBT|1|P2, inherited; owner triage required|
|[telegram-system-bot-posts-routing.spec.ts](../../../apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-posts-routing.spec.ts)|OLD_TECHNICAL_DEBT|1|P2, inherited; owner triage required|
|[telegram-channel-networks.service.spec.ts](../../../apps/api/src/domains/telegram/telegram-channel-networks/telegram-channel-networks.service.spec.ts)|OLD_TECHNICAL_DEBT|3|P2, inherited; owner triage required|
|[finance-ledger.service.spec.ts](../../../products/finance/api/ledger/finance-ledger.service.spec.ts)|BUSINESS_LOGIC|2|P1, inherited; owner triage required|
|[telegram-system-bot-finance.service.spec.ts](../../../apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-finance.service.spec.ts)|OLD_TECHNICAL_DEBT|2|P2, inherited; owner triage required|
|[account-locale.service.spec.ts](../../../apps/api/src/domains/identity/account/account-locale.service.spec.ts)|INVALID_TEST_CONFIGURATION|1|P2, inherited; owner triage required|
|[telegram-system-bot-forwarded-content.parser.spec.ts](../../../apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-forwarded-content.parser.spec.ts)|BUSINESS_LOGIC|2|P2, inherited; owner triage required|
|[finance-import-rates.spec.ts](../../../products/finance/api/portability/finance-import-rates.spec.ts)|OLD_TECHNICAL_DEBT|1|P2, inherited; owner triage required|

## Individual API cases

### apps/api/src/domains/telegram/telegram-channels/telegram-channels.characterization.spec.ts

Inherited missing/incomplete mock contract; production intent still needs owner acceptance.

- TelegramChannelsService characterization seams treats missing revision storage as a supported no-op

### apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-handler-layout.spec.ts

Inherited API/UI expectation mismatch; no claim that changing assertions alone is safe.

- Telegram System Bot handler option layouts packs workspace choices into two columns

### apps/api/src/domains/telegram/telegram-channels/telegram-unified-import.service.spec.ts

Inherited API/UI expectation mismatch; no claim that changing assertions alone is safe.

- TelegramUnifiedImportService describes changed fields for update operations

### apps/api/src/domains/telegram/telegram-channels/managed-post-scheduling-identity.spec.ts

Inherited missing/incomplete mock contract; production intent still needs owner acceptance.

- Telegram managed post scheduled identity stores scheduled ids separately and exposes no public permalink
- Telegram managed post scheduled identity deletes old scheduled ids when updating a scheduled post
- Telegram managed post scheduled identity does not report success when Telegram returns no scheduled message id
- Telegram managed post scheduled identity rejects local scheduling before persistence when this runtime has no bot token

### apps/api/src/domains/telegram/bot-billing/bot-billing.service.spec.ts

Inherited missing/incomplete mock contract; production intent still needs owner acceptance.

- BotBillingService overview calculates metrics from all live subscriptions, not the 200-row list
- BotBillingService overview keeps local runtime data out of production analytics
- BotBillingService user support lists free and paid users from only the selected runtime

### apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-post-flow-groups.spec.ts

Inherited API/UI expectation mismatch; no claim that changing assertions alone is safe.

- TelegramSystemBotPostFlowService groups defaults a selected channel to the System Bot posts group

### apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-posts-routing.spec.ts

Inherited API/UI expectation mismatch; no claim that changing assertions alone is safe.

- TelegramSystemBot Posts routing starts Add new and routes list navigation with its control message id

### apps/api/src/domains/telegram/telegram-channel-networks/telegram-channel-networks.service.spec.ts

Inherited API/UI expectation mismatch; no claim that changing assertions alone is safe.

- TelegramChannelNetworksService icons builds one aggregate traffic detail for a network instead of reading each member separately
- TelegramChannelNetworksService system All network places All first and counts it in paginated workspace results
- TelegramChannelNetworksService financial source batching loads overlapping system/custom sources once while preserving archived membership and each network currency

### products/finance/api/ledger/finance-ledger.service.spec.ts

Inherited observable rate/formatting assertion failure; root cause and intended behavior remain untriaged by owning product.

- FinanceLedgerService tenant and money rules rejects a stale rate for a current write even when occurredAt is provided
- FinanceLedgerService tenant and money rules uses a dated historical rate for a transaction before today

### apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-finance.service.spec.ts

Inherited API/UI expectation mismatch; no claim that changing assertions alone is safe.

- TelegramSystemBotFinanceService requires account and category choices even when only one option exists
- TelegramSystemBotFinanceService atomically rejects Finance while a website or legacy batch import owns the interaction slot

### apps/api/src/domains/identity/account/account-locale.service.spec.ts

Inherited missing/incomplete mock contract; production intent still needs owner acceptance.

- AccountService locale preference persists a supported locale and returns the normalized preference

### apps/api/src/domains/telegram/telegram-system-bot/telegram-system-bot-forwarded-content.parser.spec.ts

Inherited observable rate/formatting assertion failure; root cause and intended behavior remain untriaged by owning product.

- parseTelegramSystemBotForwardedContent round-trips multiline links, nested formatting, spoilers, emoji offsets, and literal markup
- parseTelegramSystemBotForwardedContent does not interpret literal managed-markup characters in an unformatted forwarded post

### products/finance/api/portability/finance-import-rates.spec.ts

Inherited API/UI expectation mismatch; no claim that changing assertions alone is safe.

- prepareFinanceImportRates backfills a missing PLN to USD rate and reloads the prepared sources

## Test-runner correction

Vitest previously tried75 product backend suites under jsdom. They remain in API Jest and were actually executed; [ownership evidence](runner-ownership.json). Restricting Vitest to product web tests is INVALID_TEST_CONFIGURATION repaired, not deleting coverage. Actual frontend assertions remain red and are listed below.

## Frontend final cases

Final corrected web runner:357 passed /19 failed files;1809 passed /29 failed tests. All remaining failed test files are unchanged against the stage11 baseline. These are inherited observable assertions, not declared safe business behavior. UI expectations/fixtures versus actual behavior need owner triage; unavailable labels/layout/formatting and timers are not automatically dismissed as environment errors. [Machine cases](web-failures.json).

|File|Classification|Failing case|
|---|---|---|
|[app-navigation.test.tsx](../../../apps/web/src/components/layout/app-navigation.test.tsx)|OLD_TECHNICAL_DEBT|AppNavigation permissions > renders posts directly when it is the only accessible page|
|[finance-account-editor.test.tsx](../../../products/finance/web/components/accounts/finance-account-editor.test.tsx)|OLD_TECHNICAL_DEBT|FinanceAccountEditor > preserves a hydrated image icon when only name/type are updated|
|[finance-accounts.test.tsx](../../../products/finance/web/components/accounts/finance-accounts.test.tsx)|OLD_TECHNICAL_DEBT|FinanceAccounts list > archives only after typed confirmation|
|[consumer-finance-app.test.tsx](../../../products/finance/web/components/app/consumer-finance-app.test.tsx)|OLD_TECHNICAL_DEBT|ConsumerFinanceApp bootstrap > opens Finance from an existing browser session|
|[consumer-finance-app.test.tsx](../../../products/finance/web/components/app/consumer-finance-app.test.tsx)|OLD_TECHNICAL_DEBT|ConsumerFinanceApp bootstrap > pushes an editor URL and explicit Back restores the accounts entry|
|[finance-transaction-editor.test.tsx](../../../products/finance/web/components/ledger/finance-transaction-editor.test.tsx)|OLD_TECHNICAL_DEBT|FinanceTransactionEditor > creates a shared expense and one debt per participant|
|[finance-transactions.test.tsx](../../../products/finance/web/components/ledger/finance-transactions.test.tsx)|OLD_TECHNICAL_DEBT|FinanceTransactions receipt detail > localizes filters and portals the calendar above the modal|
|[finance-portability-history.test.tsx](../../../products/finance/web/components/portability/finance-portability-history.test.tsx)|OLD_TECHNICAL_DEBT|FinancePortabilityHistory > shows both import and export history and rolls an import back after confirmation|
|[ad-sale-placement-lifecycle-preview.test.tsx](../../../apps/web/src/components/features/growth/ad-sales/ad-sale-placement-lifecycle-preview.test.tsx)|OLD_TECHNICAL_DEBT|AdSalePlacementLifecyclePreview > animates pending and shows observed publication confirmation for three seconds before the post timer|
|[telegram-bot-card.test.tsx](../../../apps/web/src/components/features/telegram/telegram-bots/telegram-bot-card.test.tsx)|OLD_TECHNICAL_DEBT|TelegramBotCard > renders the selected runtime avatar pulled from Telegram|
|[dashboard-page.test.tsx](../../../apps/web/src/components/features/operations/dashboard/dashboard-page.test.tsx)|OLD_TECHNICAL_DEBT|dashboard > shows one success metric and the three essential cash flows|
|[channel-settings-completion.test.ts](../../../apps/web/src/components/features/telegram/telegram/channel-settings-completion.test.ts)|OLD_TECHNICAL_DEBT|getOverallChannelSettingsCompletion > includes the publication schedule in the same setup percentage used by cards|
|[channel-settings-completion.test.ts](../../../apps/web/src/components/features/telegram/telegram/channel-settings-completion.test.ts)|OLD_TECHNICAL_DEBT|getOverallChannelSettingsCompletion > excludes bot setup for channels where bot management is unavailable|
|[channel-settings-completion.test.ts](../../../apps/web/src/components/features/telegram/telegram/channel-settings-completion.test.ts)|OLD_TECHNICAL_DEBT|getOverallChannelSettingsCompletion > does not count Appearance until every required field is configured|
|[channel-settings-completion.test.ts](../../../apps/web/src/components/features/telegram/telegram/channel-settings-completion.test.ts)|OLD_TECHNICAL_DEBT|getOverallChannelSettingsCompletion > includes newsletter and audience-transfer links in setup progress|
|[channel-settings-modal.test.tsx](../../../apps/web/src/components/features/telegram/telegram/channel-settings-modal.test.tsx)|OLD_TECHNICAL_DEBT|ChannelSettingsModal > groups channel configuration into icon-labelled tabs and shows the channel avatar|
|[telegram-account-panels.test.tsx](../../../apps/web/src/components/features/telegram/telegram/telegram-account-panels.test.tsx)|OLD_TECHNICAL_DEBT|MtprotoAccountsPanel QR recovery > opens QR recovery for a revoked account without starting phone login|
|[telegram-account-panels.test.tsx](../../../apps/web/src/components/features/telegram/telegram/telegram-account-panels.test.tsx)|OLD_TECHNICAL_DEBT|MtprotoAccountsPanel QR recovery > closes QR recovery before opening the existing 2FA modal|
|[telegram-account-panels.test.tsx](../../../apps/web/src/components/features/telegram/telegram/telegram-account-panels.test.tsx)|OLD_TECHNICAL_DEBT|MtprotoAccountsPanel QR recovery > aborts QR recovery when the active workspace changes|
|[telegram-channel-message-templates-modal.test.tsx](../../../apps/web/src/components/features/telegram/telegram/telegram-channel-message-templates-modal.test.tsx)|OLD_TECHNICAL_DEBT|TelegramChannelMessageTemplatesModal > shows the standard pencil action for a local draft|
|[telegram-channel-message-templates-modal.test.tsx](../../../apps/web/src/components/features/telegram/telegram/telegram-channel-message-templates-modal.test.tsx)|OLD_TECHNICAL_DEBT|TelegramChannelMessageTemplatesModal > shows the template emoji and standard actions, including direct send|
|[telegram-channel-message-templates-modal.test.tsx](../../../apps/web/src/components/features/telegram/telegram/telegram-channel-message-templates-modal.test.tsx)|OLD_TECHNICAL_DEBT|TelegramChannelMessageTemplatesModal > opens a duplicate as a new editable template|
|[telegram-channel-message-templates-modal.test.tsx](../../../apps/web/src/components/features/telegram/telegram/telegram-channel-message-templates-modal.test.tsx)|OLD_TECHNICAL_DEBT|TelegramChannelMessageTemplatesModal > shows only a preview skeleton and never creates a draft while editing a saved template|
|[telegram-channel-message-templates-modal.test.tsx](../../../apps/web/src/components/features/telegram/telegram/telegram-channel-message-templates-modal.test.tsx)|OLD_TECHNICAL_DEBT|TelegramChannelMessageTemplatesModal > requires the shared destructive confirmation before deleting a template|
|[roles-workspace.test.tsx](../../../apps/web/src/components/features/workspace/roles/roles-workspace.test.tsx)|OLD_TECHNICAL_DEBT|RolesWorkspace assignments > uses navigation and permission icons without generated access prose|
|[route.test.ts](../../../apps/web/src/app/(consumer-finance)/finance/[botId]/manifest.webmanifest/route.test.ts)|OLD_TECHNICAL_DEBT|Finance PWA manifest > keeps Finance separately installable and scoped to its bot|
|[mutual-promotion-folder-detail-modal.test.tsx](../../../apps/web/src/components/features/growth/ad-campaigns/mutual-promotion/mutual-promotion-folder-detail-modal.test.tsx)|OLD_TECHNICAL_DEBT|MutualPromotionFolderDetailModal > offers invite-link editing for an active folder|
|[mutual-promotion-folder-detail-skeleton-modal.test.tsx](../../../apps/web/src/components/features/growth/ad-campaigns/mutual-promotion/mutual-promotion-folder-detail-skeleton-modal.test.tsx)|OLD_TECHNICAL_DEBT|MutualPromotionFolderDetailSkeletonModal > uses the full detail-dialog layout and remains dismissible|
|[mutual-promotion-saved-post-card.test.tsx](../../../apps/web/src/components/features/growth/ad-campaigns/mutual-promotion/mutual-promotion-saved-post-card.test.tsx)|OLD_TECHNICAL_DEBT|MutualPromotionSavedPostCard > keeps the list compact and edits content and schedule from the pencil|

## Other remaining gates

- Clean empty migration: OLD_TECHNICAL_DEBT/historical data precondition; SQLSTATE23503, BLOCKED. Representative forward fixture passes separately.
- Full lint and architecture: OLD_TECHNICAL_DEBT, unchanged violations; no threshold raised.
- Real Telegram/provider/Push/iPhone and production-like performance: NOT RUN / REQUIRES MANUAL QA, not green and not a synthetic measured result.
- No separately identified environment/credential failure was used to excuse an actual deterministic test assertion. Financial-rate and markup fidelity business assertions remain blockers until owned triage.

# Finance Bot product rules

## Product intent

Finance Bot serves people who may have never tracked personal finances before.

- Start simple: use everyday language and explain unfamiliar financial concepts.
- Keep common actions short. Chat is for quick actions; the Mini App is for viewing,
  analysis, settings, and more involved editing.
- Do not send a person to the Mini App for a task that can be completed in a few
  clear Telegram steps.

## Money correctness

- Every profile has a main/default currency and every account has its own currency.
- Users never enter exchange rates manually; conversion is automatic.
- Never silently corrupt monetary data.
- Historical analysis must remain correct if the user changes their base currency.

### Cash movement versus economic meaning

- An account balance follows the full cash movement (`amount`). Income, expense,
  and budget analytics follow only the user's economic share (`economicAmount`).
- Ordinary income and expense default to the full amount. Reimbursements,
  pass-through receipts, and debt repayments have zero economic impact and must
  never inflate income or expense analytics.
- A shared payment is one atomic operation: create the full account expense,
  record only the payer's own share as economic expense, and create one
  receivable per participant. The own share plus all receivables must exactly
  equal the cash payment in the account currency.
- A transaction that originated linked shared-expense debts cannot be edited or
  deleted independently while those debts exist. This preserves the allocation
  invariant instead of silently desynchronizing cash, analytics, and obligations.
- Investment contributions and returns are reported separately from spendable
  cash and ordinary expense/income. Current investment value may contribute to
  net worth, but never to the available account balance.
- Expense necessity is `REQUIRED`, `DISCRETIONARY`, or `UNSPECIFIED`. A recurring
  payment passes its necessity to each generated expense so analytics can use the
  classification without guessing from a category name.

### AI write safety

- AI input is always a proposal, never a ledger write. Text, receipt images, and
  voice are parsed into a reviewable batch and require explicit confirmation.
- Assistant proposal previews reuse the consumer Finance transaction row and
  editor. Editing changes only the pending proposal; ledger writes happen only
  on confirmation. An explicitly named category resolves to an existing,
  selectable leaf category or remains unassigned for the user's review.
- Stream progress reports completed backend stages only. Provider execution is
  opaque: show an indeterminate activity indicator while it runs, never invent
  an ETA or a steadily increasing percentage. Stopping an in-flight request
  aborts provider work and must not start a second hidden fallback request.
- Web users may preview and submit up to five receipt images as one bounded batch
  (8 MB per file, 16 MB total). Audio remains a single-file input and is never
  mixed with receipt images. Selecting an unavailable voice capability explains
  the plan limit inline instead of navigating away from the assistant.
- Confirmation is idempotent and scoped to the authenticated Finance profile and
  exact bot integration. A cancelled or expired proposal cannot be committed.
- The assistant must state uncertainty and ask for missing financial meaning; it
  must not silently reinterpret a reimbursement, pass-through payment, debt, or
  investment as ordinary income or expense.
- The assistant is the primary natural-language entry point. One message router
  decides whether to answer, ask one focused clarification, prepare a reviewable
  ledger proposal, or recommend the dedicated Finance screen for a transfer,
  debt, recurring payment, saving, investment, account, category, budget, or
  reminder. The user must not have to classify the request before sending it.
- Groshly Web and Mini App use the same streaming assistant endpoint as the
  Finance assistant. A quoted message stays separate from the new request.
  Financial context is selected for the authenticated profile on demand and
  covers account balances, period analytics, recent ledger activity, transfers,
  categories, debts, regular payments, goals, investments, limits, and reminders.
  The model receives bounded data and must say when it lacks the requested facts.
  Plain greetings use the model without loading financial records.
- Groshly AI stores named conversations per authenticated Finance profile.
  The first send creates a General chat, uses the first message or attachment
  name as its initial title, and keeps the selected chat in the URL. A retried
  creation uses the same chat ID. The sidebar supports renaming, moving a chat
  to the archive, restoring it, and deleting it.
  General and transaction chats can prepare proposals for review. Advice chats
  accept text and cannot prepare operations. The model gets up to four recent
  completed turns from the current conversation, with each message bounded to
  1,200 characters. The transcript can load earlier pages. A stopped response
  may keep its visible fragment in the transcript. Retries reuse the same turn.
  Chat history is retained until the user deletes the chat or the underlying
  profile. Chat deletion cascades to its turns. There is no cleanup timer or
  historical aggregation, and opening an idle chat does not write.
- The Finance Bot dashboard reads the selected bot runtime. Its monthly AI
  usage uses recorded provider tokens and the pricing snapshot, and shows
  unpriced requests separately. Older receipts with an owned profile and no
  runtime ID are grouped by that profile's Telegram runtime. The Users page
  reads one usage aggregate for the displayed page alongside the subscriptions.
- Balance investigations use bounded, profile-scoped expected account balances
  and recent ledger entries. When the user supplies the real balance, the
  assistant may calculate the difference and identify possible candidates, but
  must label uncertainty and never invent the missing operation.

### Valuation migration and rate history

- New transactions retain their legacy default-currency fields as a snapshot of
  the profile default at write time and separately store an immutable USD
  valuation snapshot. API consumers must use the explicit valuation snapshot,
  never relabel legacy default fields as USD.
- Rows created before the valuation migration have no recorded historical base
  currency. They remain visible to analytics as a legacy-fallback count and
  source-currency-grouped native amounts, but are excluded from currency totals
  rather than being guessed as USD or summed across currencies. This is the
  one-time known-base limitation of the old schema.
- Automatic exchange-rate sync stores one observation per workspace/base/target
  UTC day. This makes repeated daily syncs idempotent and bounds growth. Rates
  are retained while historical entries can use dated conversion; any retention
  change must first preserve supported entry dates and immutable snapshots.

### Portable data imports

- Import instructions teach semantic migration, not field renaming: own-account
  movements become transfers; reimbursements and pass-through receipts have zero
  economic impact; shared purchases preserve the user's share and debts;
  subscriptions, savings and investments use their dedicated models.
- `ADD` preserves existing Finance records and remains fingerprint-idempotent.
  `REPLACE` atomically clears only profile-scoped ledger and planning data before
  writing the validated file. It never deletes identity, authentication, billing,
  bot configuration, AI credentials or assistant preferences.
- A replacement is never short-circuited by an earlier import receipt because its
  purpose is to make the current dataset match the file again after later edits.
- Every successful import and export is recorded in the profile-scoped portability
  history. Export history contains metadata only; exported files are not retained.
- Before an import writes data, it records a compressed snapshot of the complete
  active Finance dataset in the same transaction. A rollback replaces the current
  dataset with that snapshot atomically and creates its own recovery point.
- Recovery payloads are retained for the five newest import/rollback operations;
  older history remains visible without a rollback action. Export metadata is
  bounded separately. History is fetched on demand and must not introduce polling.
- Regular payments use a calendar-aware recurrence unit plus a positive interval
  count. Daily, weekly, monthly and yearly units support schedules such as every
  90 days or every two weeks without cron expressions or a separate scheduler.
- Import normalization preserves investment event timestamps and safely expands
  each investment's start/closing boundaries to contain all of its imported cash
  flows and valuations. Every automatic boundary adjustment is returned as an
  import warning; malformed dates and unresolved references remain hard errors.

## Localization

Finance Bot is multilingual from the start. Every user-facing feature supports
`uk`, `ru`, and `en`.

- Telegram language provides the initial default.
- A user setting explicitly overrides that default.
- A deterministic fallback is required.
- Do not add incidental hardcoded user-facing text. A Finance feature is incomplete
  when any supported language is missing.

## Guided onboarding

- First-run onboarding is an interactive tour of the real Finance screens, not a
  static description. It must keep the Overview, Transactions, Analytics and
  Jarvis route guidance current, and offer the optional detailed route for
  accounts, categories and transfers.
- Any change to a consumer Finance navigation item, primary action, onboarding
  destination, or the user-facing purpose of one of these screens must update
  `finance-onboarding-tour.tsx`, all three locale copies, and its behavioural
  tests in the same change. Review this requirement before merging the change.
- Jarvis is always the final tour step and must state that it prepares a
  reviewable proposal rather than writing a financial operation without user
  confirmation.

## Paywalls

Every paid/Pro message must give the user a next action: a button, Mini App link,
or checkout action. Never leave a message that merely says a capability is paid.

## Mini App boundary

Finance Mini App is a consumer application, not the internal Telegram System
dashboard.

The Finance Web App and Telegram Mini App are separate surfaces, not
interchangeable status labels. A configured browser Web App can be available
while the selected BotFather runtime has no Mini App/menu-button configuration
(or points at a different URL). Product and management UI must describe those
states independently for the selected `LOCAL` or `PRODUCTION` runtime.

- Telegram Mini App `initData` is a bootstrap credential only: validate it server-side
  against the exact runtime token, then issue the scoped Finance consumer session.
- Subsequent consumer requests authenticate with the secure, HttpOnly Finance consumer
  session cookie. This session is separate from internal dashboard JWT authentication.
- Consumer sessions are bot-scoped: the signing key is derived from the encrypted-token
  master key and the exact `botIntegrationId`, while the TTL is stored on that
  `TelegramBotIntegration`. Do not add one environment secret or TTL variable per bot.
- Browser authentication must use a server-validated Telegram identity flow and resolve
  the same logical `FinanceProfile` as the Mini App; never trust a browser user id/query
  parameter directly.
- Keep route-level providers, layout, loading, and error states separate from internal
  JWT authentication and dashboard infrastructure.
- Keep Telegram chat as the quick-action surface and use the Mini App for the workflows
  where a richer interface genuinely helps.

## Groshly AI dictation

- The microphone in the Groshly AI web chat uses browser speech recognition in
  the selected app language. Live results appear in the draft, alongside a
  waveform sampled from the microphone when a local audio meter is available.
- Send or Enter ends dictation and submits the resulting text after the browser
  finishes recognition. Keeping the result in the draft allows edits before
  sending. Discard restores the draft from before dictation.
- Browser support and microphone permission are required. The browser's
  recognition service may process the audio remotely. The waveform stays
  local, and the Groshly assistant receives text.
- Hiding the tab or leaving the chat releases the microphone and cancels any
  queued submission. The file attachment control accepts audio independently.

## Brand assets

Groshly icons are owned by `products/finance/assets`. The 512 px PNG files
`groshly-icon.png`, `groshly-dev-icon.png`, `groshly-dark-icon.png`, and
`groshly-dev-dark-icon.png` are the deployment sources. The first two have an
opaque white canvas for browser favicons, PWA icons, and Telegram photos. The
brighter green dark variants are used for logos inside dark UI. The higher
resolution `groshly-white.png`, `groshly-dev-white.png`, `groshly-dark-ui.png`,
and `groshly-dev-dark-ui.png` are editable source renditions.

`node scripts/build/assets/sync-finance-brand-assets.mjs` copies the deployment icons to
both web hosts before their builds. The standalone web host also keeps the
192 px PWA variants in this folder. When replacing an icon, update its 192 px
variant, then run the sync script. Finance bot profile photos are reconciled
once on API startup. A SHA-256 hash in the runtime record avoids Telegram API
calls and database writes when the asset has not changed. The Finance bot
profile form edits the name and description only; image uploads are not part
of that contract.

The environment-managed Telegram System bot uses the existing
`apps/web/public/brand/telegram-system.png` and `telegram-system-dev.png`
assets. Its selected runtime also reconciles its white-backed Telegram photo
at API startup, with a stored asset hash to avoid repeat calls. The bot
management forms contain name and description controls, with no logo uploader.

Older uploaded-image columns in the platform database are retained only for
historical data. Brand rendering and startup reconciliation never read them;
removing those columns requires a separate data-retention decision.

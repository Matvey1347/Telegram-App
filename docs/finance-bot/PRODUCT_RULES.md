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

## Localization

Finance Bot is multilingual from the start. Every user-facing feature supports
`uk`, `ru`, and `en`.

- Telegram language provides the initial default.
- A user setting explicitly overrides that default.
- A deterministic fallback is required.
- Do not add incidental hardcoded user-facing text. A Finance feature is incomplete
  when any supported language is missing.

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

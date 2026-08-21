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

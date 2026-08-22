# Telegram bots layout

- `core`: bot CRUD, application registry/dispatch, webhook runtime, users, and delivery.
- `greeter`: Greeter configuration, automation, enrollment, broadcasts, analytics, and controllers.
- `finance`: Finance Bot runtime, entitlement checks, AI, ledger, proposals, limits, and consumer API.

`telegram-bots.module.ts` is the single composition root. Product folders are not separate Nest modules because their runtime handlers share the same bot registry and delivery pipeline.

## Delivery boundary

- Replies produced while handling a live Finance update use `TelegramBotInteractiveReplyService` and call the Bot API immediately. They do not create delivery rows or scheduler work.
- Payment success and genuinely asynchronous notifications use `TelegramBotDeliveryService` for persisted retry. Finance proposal/flow confirmations produced for the current live update reply immediately and rely on mutation idempotency rather than creating queue work.
- Reminders, Greeter sequences, broadcasts, and other scheduled/retry-sensitive work always remain on durable delivery.
- Both paths use `telegramBotMessagePayload`; do not add a second reply-markup formatter.

## LOCAL development lifecycle

- `pnpm dev:bots` passes a random per-process control secret to the API. Its
  shutdown request is rejected outside the `LOCAL` runtime and without that
  secret.
- A changed Cloudflare Quick Tunnel URL refreshes Finance reply keyboards once at bootstrap.
  Unchanged watch restarts send no messages.
- Explicit dev shutdown removes LOCAL reply keyboards, menu links, and
  webhooks, then marks only LOCAL runtime rows disabled. It never scans or
  mutates PRODUCTION runtimes.

## Finance consumer authentication

- Mini Apps read the bot-scoped cookie session before validating `initData`.
  This prevents a hot reload or a long-lived Telegram WebView from rejecting an
  already authenticated user because its original launch data aged out.
- Standalone browser login uses a five-minute `t.me/<bot>?start=finlogin_*`
  challenge approved by that same Finance bot. It does not use Telegram's
  domain-bound Login Widget, so Cloudflare Quick Tunnel hostnames can rotate.
- Browser approval polling starts only after the user opens Telegram, stops on
  approval/expiry, and performs indexed reads without timers or polling in the
  API process. Expired challenge rows are pruned by the next user-triggered
  challenge creation.

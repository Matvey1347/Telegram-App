# Telegram bots layout

- `core`: bot CRUD, application registry/dispatch, webhook runtime, users, and delivery.
- `greeter`: Greeter configuration, automation, enrollment, broadcasts, analytics, and controllers.
- `finance`: Finance Bot runtime, entitlement checks, AI, ledger, proposals, limits, and consumer API.

`telegram-bots.module.ts` is the single composition root. Product folders are not separate Nest modules because their runtime handlers share the same bot registry and delivery pipeline.

## Delivery boundary

- Replies produced while handling a live Finance update use `TelegramBotInteractiveReplyService` and call the Bot API immediately. They do not create delivery rows or scheduler work.
- Messages whose loss after a committed mutation would be misleading—payment success and saved Finance mutation confirmations—use `TelegramBotDeliveryService` for persisted retry.
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

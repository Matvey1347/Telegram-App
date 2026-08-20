# Telegram bots layout

- `core`: bot CRUD, application registry/dispatch, webhook runtime, users, and delivery.
- `greeter`: Greeter configuration, automation, enrollment, broadcasts, analytics, and controllers.
- `finance`: Finance Bot runtime, entitlement checks, AI, ledger, proposals, limits, and consumer API.

`telegram-bots.module.ts` is the single composition root. Product folders are not separate Nest modules because their runtime handlers share the same bot registry and delivery pipeline.

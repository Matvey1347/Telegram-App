# Telegram Support

Nexeloq and Groshly each use a dedicated Telegram bot for support. The Nexeloq
API owns both webhook routes and stores the conversations in its workspace
database. Operators with the owner or admin role open **Telegram Bots →
Support**. A ticket shows its source app and Telegram sender. An operator reply
is sent through the same app's support bot.

## Configuration

Set `TELEGRAM_SYSTEM_BOT_SUPPORT_TOKEN` and
`TELEGRAM_SYSTEM_BOT_SUPPORT_USERNAME` in root `.env` for local Nexeloq.
Set `FINANCE_BOT_SUPPORT_TOKEN` and `FINANCE_BOT_SUPPORT_USERNAME` in
`products/finance/.env.local` for local Groshly. The local launcher loads the
Groshly support credentials into the Nexeloq API only. For deployment, set
both pairs in the Nexeloq API's environment.

`TELEGRAM_SYSTEM_BOT_SUPPORT_WEBHOOK_SECRET` and
`FINANCE_BOT_SUPPORT_WEBHOOK_SECRET` are optional. If absent, the API derives
a stable secret from the corresponding token. A support bot token must differ
from all primary bot tokens.

Tickets are routed to the owner workspace configured for each app through
`TELEGRAM_SYSTEM_BOT_DASHBOARD_WORKSPACE_ID` and
`FINANCE_BOT_DASHBOARD_WORKSPACE_ID`. If the latter is blank, Groshly uses the
Nexeloq dashboard workspace. Without an assigned workspace, the bot is inactive.

Apply the support migration before starting the API. For local Telegram
delivery, start `pnpm dev:all:tunnel`. The HTTPS endpoint registers the webhook
on startup. If the token already has a different webhook owner, startup
preserves that owner. Use separate development bots to keep live deliveries
on the production host. `TELEGRAM_SUPPORT_WEBHOOK_OWNER=off` disables webhook
registration in a non-owning API process.

The main Groshly local bot reads its token and username from
`products/finance/.env.local`. The launcher synchronizes its local runtime and
activates its webhook when a tunnel is available. On the production API,
`FINANCE_BOT_PRODUCTION_TOKEN` and `FINANCE_BOT_PRODUCTION_USERNAME` provision
the runtime for the existing Groshly integration when
`TELEGRAM_BOT_RUNTIME_ENVIRONMENT=PRODUCTION` and its workspace is configured.
An active runtime or a webhook owned by another API is preserved.

## Behaviour and verification

- Send `/start` to each bot, then a help message. Verify the correct app,
  ticket count, and unread indicator. A follow-up joins the open conversation.
- Reply from the inbox. After Telegram confirms delivery, the ticket stays
  open and drops out of the needs-reply count. Close it and verify it appears
  under **Closed**. A new inbound message then creates a new ticket.
- A Telegram update retry cannot add the same message twice. A reply with
  uncertain delivery is recorded and is not automatically resent.
- Text and captions are stored. The inbox shows a placeholder for other
  attachments. Existing ticket records are retained, with pagination in the
  list and conversation. Avoid sending passwords or payment card details to
  support.
- The inbox uses a workspace-scoped event stream while visible. It re-reads
  state on focus, and the live indicator assumes the webhook and stream reach
  the same API process. There are no periodic jobs, idle queries, or per-channel
  requests. Startup does one ownership check and at most three Telegram calls
  per enabled support bot. Each incoming update does one short transaction.

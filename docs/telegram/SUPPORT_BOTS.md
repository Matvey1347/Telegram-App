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
`products/finance/.env.local` for local Groshly. The local Nexeloq API reads
these settings for the dashboard even when no Telegram bot runtime is selected.
For deployment, set both pairs in the Nexeloq API's environment.

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
preserves that owner. A local launch can replace an expired Cloudflare Quick Tunnel for the same support route after DNS confirms it no longer exists, without clearing queued updates. Use separate development bots to keep live deliveries
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

- In **Telegram Bots → Bots**, select **Support** on the Nexeloq or Groshly
  card. Check the support name, configured Telegram handle and branded
  avatar. Switch back to **Production** or **Local** to see that bot's profile.
  The support avatars are bundled in `apps/web/public/brand` and can also be
  uploaded to the corresponding Telegram profiles.
- Send `/start` to each bot. Verify the Ukrainian greeting in Telegram and its
  **Automatic reply** entry under **Support → Open**. It leaves the ticket
  awaiting an administrator. A follow-up joins the open conversation.
- Reply using the shared CRM editor. Check formatting in both Telegram and
  the ticket. After Telegram confirms the administrator's reply, the ticket
  stays open and drops out of the needs-reply count. Close it and verify it appears
  under **Closed**. Use **Reopen ticket** or send a new inbound message to reopen
  the conversation. Earlier tickets for the same workspace, bot and chat are
  visible in its message history, and repeated `/start` commands do not resend a
  greeting already recorded in that chat.
- For a new conversation message, **Reply** uses Telegram’s native reply and
  preserves the quoted message in the inbox. Edit an outgoing message from its
  menu and verify the edited text in Telegram. Delete a recent message and
  verify the tombstone after Telegram confirms. These actions require a stored
  Telegram message ID. Existing messages without that ID stay readable, and
  Telegram limits deletion to messages younger than 48 hours.
- The send button is visible on an empty draft, and delivery status appears in
  the message. Profile photos are requested on demand through the ticket’s
  support bot. Private or unavailable photos fall back to initials or branding.
- The webhook subscribes to `message_reaction` and applies additions and
  removals to known message IDs. Telegram restricts delivery of these events
  through the Bot API, so native reactions in private bot chats may be unavailable.
- The header shows the last incoming message time. The Telegram Bot API does not
  provide private chat history retrieval or user presence. Historical greetings
  recovered from old webhook records are labelled **Automatic reply · archived**.
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
  A distinct `/start` additionally sends one Telegram message and updates its
  delivery state. The greeting uses the existing paginated message history.

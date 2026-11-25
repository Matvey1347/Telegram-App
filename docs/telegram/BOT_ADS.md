# Bot advertising

Finance Bot opens its dashboard at
`/telegram-bots/:botId/finance/:section` with `overview`, `ads`, `monetization`,
`users`, and `integrations`. The old Finance dashboard URL opens
Overview. Each section keeps the selected `LOCAL` or `PRODUCTION` runtime.

The Ads management API is shared by bot applications. Workspace owners and
admins manage promos and links within one bot runtime. Placements use active,
owned Telegram channels from the workspace. Eligible workspace channels include test channels. The picker and placement cards label them as Test. The Finance update adapter uses the common bot user service to record
incoming attribution. Other bot applications can use the same update path and
record payments through the existing bot billing ledger.

## Promos and placements

- Create a promo using the standard Telegram post editor or import it by forwarding
  a post to the System Bot. Active and archived promos retain their placement
  history.
- In **Placements**, choose an active promo, direct channels or networks,
  and a planned date and time. Overlapping networks produce one draft per
  eligible channel, up to 25 channels. The shared calendar picker shows common
  advertising slots in the time zone displayed in the form. Unfinished forms
  can be resumed from the workspace-scoped draft picker.
- Each link records the campaign, date, channel and promo. Drafts and links
  save together. The post replaces text links, button destinations and legacy
  placeholders with the channel's tracking URL. Posts without a link get one
  appended automatically. Media URLs are preserved.
- Publish the draft immediately or schedule it. The scheduling dialog starts with the campaign time. The existing managed post
  publication path handles transport, due delivery and reconciliation. The
  placement keeps the originally requested publication time across retries.
- Use **New link** on a placement for another test on the same channel.
  Previous posts and paid conversions retain the original links. Standalone
  links can also be created without a promo.

## Metric definitions

- **Views and reactions** use the linked Telegram post's stored metrics.
  Missing metrics appear as a dash. Campaign totals sum the available metrics.
- **Link opens** count requests to the public redirect before Telegram opens.
  Known preview requests and HEAD requests are excluded. Repeat opens are
  counted. The redirect uses a public HTTPS `API_PUBLIC_URL`. When the API is only local, new links use
  the direct Telegram deep link and display link opens as unavailable.
- **Bot starts** count unique Telegram accounts using a tracked `/start`.
  The first tracked link for an account and runtime keeps attribution. An
  existing bot user can enter a campaign with their first tracked start.
- **First action** counts a private bot interaction or verified Finance Mini App
  launch after the tracked start. **Returned after 30 days** counts an observed
  action at least 30 days after that start. A payment receipt alone does not
  count as activity. Historical return events without stored evidence are unavailable.
- **Paid** counts attributed users with a positive successful subscription
  payment after the start. Stripe test and live events are scoped to the
  LOCAL and PRODUCTION dashboard respectively. Stars receipts carry the runtime
  that received them. Complimentary access and historical Stars events without
  a runtime are excluded.

## Runtime cost and QA

Ads adds no polling, scheduled analytics jobs, extra Telegram reads, or idle
writes. One aggregate counter increments per tracked redirect. The first
attributed start, first action and 30-day return can each write once. Ordinary
unattributed bot activity uses the existing user read and writes only through
existing business paths. Campaign statistics use the existing payment ledger,
publication records, and compact batched funnel reads. With 100 placements
the main list loads two 50-row pages; campaign totals include all 100 without
per-placement queries. Network lookup and slot availability only run on demand. Links and attribution remain for historical comparison
and follow bot runtime and user deletion. The attribution row count is bounded
by users per runtime. These workloads are event-driven, and no new recurring
Neon wakeup or Railway service is required.

For QA, apply the migration in the test environment. Select the Finance bot and
open Ads. Create a promo, place it in an authorized test channel, and publish
or schedule it. Open the published link and press Start from a test Telegram
account; refresh analytics and check the click and start. Start through a
second link from the same account and check that the original link retains
credit. Interact with the bot after starting and verify the first-action counter. The
PostgreSQL integration test exercises the 30-day boundary. Complete a test
subscription payment using the selected runtime. Refresh analytics and check
the placement and campaign totals.

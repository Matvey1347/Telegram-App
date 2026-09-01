# Contact-centered Telegram CRM architecture

## Scope

This document defines the Stage 1 persistence, contract, authorization, and
rollout-safety foundation, the Stage 2 multi-account MTProto CRM runtime and
Inbox use cases, and the Stage 3 Contact-centered web application. It does not
add customer-message automation runners, a durable queue, or a PWA.

The existing Ad Sales product remains intact. `TelegramAdvertiser` is the
physical backing record for a CRM Contact, and `TelegramAdSale` remains the
only Deal. Placements, payments, pricing, availability, calendar, and analytics
continue to use the existing Ad Sales models and use cases.

```text
Workspace
├── Members (WorkspaceMember)
├── MTProto Accounts (TelegramUserAccountIntegration)
└── CRM
    ├── Contacts (backed by TelegramAdvertiser)
    │   ├── Deals (TelegramAdSale)
    │   ├── Tasks / Activities / Notes
    │   └── Conversations
    ├── Telegram Peers (TelegramCrmPeer)
    └── Conversations
        └── Messages
```

Member ownership of a Contact and administrative assignment of an MTProto
account are independent. Multiple Members may use the same account when RBAC
allows it. A Conversation always keeps the account with which it was created.

## Domain and dependency boundaries

`apps/api/src/domains/telegram/telegram-crm` owns Contact-centered use cases,
Telegram peer identity, Conversation/Message persistence, CRM settings, account
capability policy, and customer-automation eligibility policy.

Ad Sales owns Deal creation and mutation. CRM reads compact Deal summaries
directly through workspace-scoped Prisma projections and never injects the
large `TelegramAdSalesService`. Ad Sales may call narrow CRM Contact providers;
CRM does not import Ad Sales implementation. Telegram protocol behavior stays
under `apps/api/src/telegram/shared`.

Legacy `/telegram-ad-sales/advertisers*` and CRM task routes remain compatible,
but a focused facade applies the same Contact view-own/view-any and
edit-own/edit-any policy before delegating to the existing Ad Sales use cases.

## Contact-centered web application

`/ad-sales` is the CRM Contacts entry point while the existing Sales, Calendar,
and Analytics routes continue to render their established Ad Sales use cases.
`/ad-sales/clients` remains a compatible Contacts alias. Contact and
account-specific Conversation identifiers are encoded in stable nested routes,
so a reload never merges account threads or loses the selected context.

The web read path uses compact Contact, Inbox, Conversation, unread, and
cursor-paginated Message models. Full Message history is never embedded in a
Contact or collection response. Contact detail collections stay bounded and
the existing Ad Sales endpoints remain authoritative for full Deal, placement,
payment, pricing, availability, publication, calendar, and analytics behavior.

CRM React Query state uses its own workspace-scoped, non-persisted key family.
Realtime events patch the affected Message, Conversation, Contact, Inbox, or
unread cache; there is no API polling or root-wide CRM invalidation. After a
bounded stream reconnect, only the active surface is revalidated.

Manual Message composition is independent of customer automation. It replies
through the Conversation's fixed MTProto account, uses an idempotency key for
optimistic reconciliation and retry, and becomes read-only when permission or
account capability is missing. Starting a new Conversation is the only place
where the workspace default CRM sender may be consulted.

Automation controls display migrated Contacts as off and migrated Deals as
protected. Contact enablement and Deal eligibility require separate explicit
user actions guarded by automation-management permission. Inbox promotion,
stage changes, Deal/payment/publication actions, CRM Sync, and CRM Send never
enable customer automation.

## Contact and stage

There is no second Contact table. `TelegramAdvertiser` remains the persistence
entity while new API contracts use `CrmContact` naming.

The single authoritative Contact stage is:

```text
NEW → LEAD → QUALIFIED → FOLLOW_UP → CUSTOMER
                                  ↘ LOST
Any stage                         → ARCHIVED
```

An active Deal is not a Contact stage. It is derived from `TelegramAdSale`.
Legacy advertiser `status` and `lifecycleStage` response fields may be produced
as compatibility projections, but they are not persisted and legacy mutations
must translate to the one Contact stage.

The migration deterministically maps archived, lost/blocked/churned, customer,
qualified, reactivation/inactive, contacted/active, and remaining records to
the new stage before removing the two legacy columns.

## Telegram identity

`TelegramCrmPeer` is a pre-Contact identity and may exist without a Contact.
Its unique identity is `(workspaceId, telegramUserId)`. Username and profile
fields are mutable attributes; a username change updates the same Peer.

Existing stable Telegram user IDs are backfilled. If one ID is already linked
to multiple legacy Contacts, the Peer is left unattached rather than silently
merging customer records. Username-only legacy records do not create Peers.

One Peer may have Conversations through multiple MTProto accounts. The unique
Conversation key is `(workspaceId, telegramCrmPeerId, mtprotoAccountId)`.

## Conversation and Message foundation

A Conversation stores its fixed MTProto account, private Telegram dialog
identifier, optional Contact, last inbound/outbound/message timestamps, unread
and read checkpoints, active/archive state, and incremental/recovery metadata.
The default CRM sender is consulted only when creating a new Conversation.

A Message stores the Telegram message ID, fixed Conversation/account identity,
direction, origin, optional Member/automation attribution, text and minimal
content metadata, timestamps, and read/delivery state. Historical messages
found outside CRM use `TELEGRAM_SYNC` with no invented Member. Raw Telegram
update payloads are not persisted.

Automation attribution is valid only for an `AUTOMATION` origin. Its execution
must belong to both the Message workspace and the Contact linked to the
Conversation; the workspace relationship is also enforced by a composite
foreign key.

Messages are unique by `(conversationId, telegramMessageId)` and ordered with
the `(conversationId, sentAt, id)` index. Conversation collections never include
unbounded Message history.

## MTProto account capabilities and sync state

Each `TelegramUserAccountIntegration` has independent capabilities:

- `crmSyncEnabled`: private dialog/message synchronization;
- `crmSendEnabled`: manual or eligible CRM message sending;
- `mtprotoPublishingEnabled`: channel publication through MTProto.

CRM flags default to false. Existing MTProto publication behavior is preserved
with `mtprotoPublishingEnabled=true`. System Bot and all Bot API advertising
publication paths are independent and do not consult these flags.

`defaultCrmSenderAccountId` is workspace CRM configuration. It must resolve to
an account in the same workspace that is active, connected, session-backed,
and CRM-send enabled. Existing Conversations never switch to that account.

Sync state is one optional row per account. A missing row means `NOT_STARTED`.
Initial import, incremental checkpoint, recovery checkpoint, current error/state,
and last meaningful sync timestamp are stored without heartbeat state. A future
sync implementation must update a checkpoint only when it advances and suppress
unchanged profile, success, and checkpoint writes.

## Authorization

The `adSales.crm` feature preserves `view` as CRM access and adds explicit
view-own, view-any, manual-send, and automation-management permissions. Edit-own
and edit-any continue to scope mutations by `TelegramAdvertiser.ownerMemberId`.
The backend is authoritative; frontend permission checks are presentation only.
The rule also covers the legacy advertiser, contact-detail, activity/note, and
CRM task endpoints; requested Contact owners are validated in the workspace.

Deal/payment authorization remains in the existing Ad Sales permissions.

## AUTOMATION ROLLOUT SAFETY

Deployment alone must send zero customer Telegram messages.

The fail-closed gates are cumulative. A customer automation is eligible only
when all are true:

1. workspace customer Telegram automations were explicitly enabled;
2. the Contact explicitly enabled automated messages;
3. the machine-identified automation type is enabled;
4. the Deal is not disabled;
5. the Deal has an explicit immutable eligibility timestamp;
6. the event is not historical and occurs after both rollout cutovers;
7. a non-empty idempotency key identifies the business event.

Migration safety invariants:

- every existing and new Contact defaults to `automatedMessagesEnabled=false`;
- every existing Deal is backfilled with `customerAutomationOverride=DISABLED`;
- every existing Deal has no automation eligibility timestamp;
- workspace and all per-type switches default to false;
- migration creates zero customer automation executions, Messages, due events,
  Conversations, or account sync-state rows;
- historical placements/publications cannot become customer automation events;
- enabling only the workspace does not enable an existing Contact;
- manual CRM messaging is governed by manual-send permission and account send
  capability, not by customer-automation switches.

The existing `TelegramAdvertiserAutomationRule` and execution tables describe
internal task creation. They are not customer-message consent or delivery
records. Customer-message idempotency uses the separately named CRM execution
model.

## Multi-account MTProto runtime

There is no process-wide master Telegram account. Every active, connected,
session-backed account with `crmSyncEnabled=true` may own exactly one live
client in one API process. A Conversation retains its fixed account for sync,
read state, history, and sending; the workspace default is used only to create
a new Conversation.

The process manager performs one bounded startup query. Thereafter it reacts to
in-process wake notifications from capability, account, login, and removal
changes. It performs no database or Telegram polling, cron, or heartbeat and
stops a client when the account becomes ineligible. Reconnect uses bounded
backoff, and every account has a serialized update queue so overlapping GramJS
callbacks cannot reorder checkpoint work. A send-only client created for an
account with sync disabled is transient and is closed after the request.

The process-local ownership model assumes one API replica. More replicas would
require an explicit ownership/lease design; the Stage 2 runtime does not wake
Neon with advisory-lock polling.

## Import, incremental sync, and recovery

Initial import is an explicit, bounded command. It scans Telegram dialogs in
bounded pages and accepts only private human-user dialogs. Groups, channels,
bots, self, deleted users, Telegram support/system identities, and service
messages are excluded. Import creates or updates the canonical workspace Peer
and the account-specific Conversation, but never promotes a Peer to Contact.
The initial window and lazy history pages have hard limits and persist a cursor
instead of loading unbounded history.

Telegram access hashes are account-scoped and therefore live on Conversation,
not on the workspace Peer. Numeric Telegram message IDs are stored beside the
wire identifier for ordering and read ranges. New messages, edits, read updates,
new dialogs, and peer metadata flow through one normalized adapter and a batch
store. A replay creates no duplicate Messages, does not increment unread twice,
and does not downgrade a manually sent Message to sync attribution.

GramJS `catchUp()` is not used as a recovery guarantee. The runtime explicitly
runs bounded `updates.GetDifference` slices from the stored account checkpoint.
A checkpoint advances only after its database batch succeeds, and unchanged
profiles, status, and checkpoints do not produce writes.
`DifferenceTooLong` clears the incremental checkpoint and resets the bounded
initial-import cursor; recovery then requires the same explicit initial-sync
command instead of silently treating an incomplete slice as current.

## Inbox, promotion, and merge

The Inbox is a compact workspace-scoped read model over private Conversations
and Peers. It supports Lead, Qualified, Follow-up, Customer, Ignore, and Archive
actions without requiring a Contact at import time, and orders Peers by their
latest Conversation activity. Promoting a Peer atomically claims one Contact,
initializes its compact message signals, and attaches every Conversation for
that canonical Peer.

Manual Contact merge is one transaction. It moves Telegram Peers,
Conversations, Deals, tasks, activities, notes, tags, contact methods,
preferences, and automation references before removing the source Contact.
Conflicts are resolved explicitly and customer automation remains fail-closed;
merge must not discard customer history or silently broaden consent.

## Manual messages, read state, and realtime events

Manual CRM sending requires the manual-send permission, a fixed Conversation
account that is active, connected, session-backed, and `crmSendEnabled`, plus a
non-empty client idempotency key. The key reserves one Message per Conversation
and derives the stable MTProto `randomId`, so retries and a simultaneous live
echo converge on one manually attributed Message. Customer-automation flags do
not block manual sends and this stage never executes an automation.

Mark-read uses the Conversation's fixed account and numeric Telegram message
range. Conversation unread state and compact Contact last-inbound/last-outbound
signals are updated with the same persisted batch.

The event stream is authenticated, workspace-scoped, and process-local. Events
are emitted only after commit and use the stable names `message.received`,
`message.sent`, `conversation.unreadChanged`, `readChanged`, `contact.updated`,
and `inbox.updated`. There is no event table, replay log, heartbeat, or polling;
clients refetch authoritative read models after reconnect.

## Runtime cost and scaling

Stage 1 added no recurring runtime work. Stage 2 adds one persistent GramJS
client only for each eligible sync account, one bounded startup query, and
event-driven account rechecks. Idle database reads/writes remain zero after
startup. There is no per-Contact or per-Conversation worker, queue service,
Redis, telemetry writer, cron, or heartbeat.

GramJS itself maintains each live connection with an approximately nine-second
ping and a state request about every 30 minutes. That is roughly 9,600 pings and
at most 48 state requests per account/day: about 96,000/480 for 10 accounts and
960,000/4,800 for 100 accounts. This is Telegram network traffic and Railway
socket/CPU/RAM load, not Neon activity. Connect and difference recovery have
global concurrency caps, queues are bounded, and overflow is surfaced instead
of silently dropping accounts or updates.

Peers grow with stable Telegram identities, Conversations with actual
peer/account pairs, and Messages only with imported or sent product history.
Dialog/history/difference pages and database batches are bounded; each touched
Conversation is updated once per batch and each account checkpoint only when it
changes. Stored rows never imply recurring work, and raw Telegram payloads or
process-local events are not retained.

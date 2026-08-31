# Contact-centered Telegram CRM architecture

## Scope

This document defines the Stage 1 persistence, contract, authorization, and
rollout-safety foundation. It does not add realtime MTProto synchronization, a
full CRM frontend, customer-message runners, background workers, or a PWA.

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

## Runtime cost and scaling

Stage 1 adds no cron, polling, heartbeat, startup workspace scan, per-Contact or
per-Conversation worker, queue, Redis, persistent MTProto connection, telemetry
writer, or Railway service. Idle Neon queries/writes and Railway CPU/RAM/network
remain unchanged.

Peers grow with stable Telegram identities, Conversations with actual
peer/account pairs, Messages with imported or sent product history, and sync
state with explicitly started accounts. Future sync must batch identity reads,
insert Messages idempotently, update each touched Conversation once per batch,
and advance one account checkpoint only when changed. Stored rows never imply
recurring work.

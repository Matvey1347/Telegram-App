# CRM Instagram Contacts and Manual Outreach — Prompt №9

Local implementation,2026-11-01 Europe/Warsaw. This stage supports a personal Instagram account through human actions only. No Instagram credentials, login/session, private API, browser messaging automation, webhook simulation, DM synchronization or send endpoint is implemented. No production migration, real authorization, model call or message was performed. This is not a final release or production-readiness claim.

## Audit and product boundary

`TelegramAdvertiser` remains the only CRM client. Canonical `TelegramAdvertiserContact` already stores original/normalized values and workspace identity uniqueness; older Instagram entries use OTHER+label Instagram. Existing advertiser activities/tasks and Operations Notifications already support contacts without a Telegram peer. Existing Sales Workflow has client-owned sticky status; conversation unread/message facts remain Telegram-only. Shared Chat UI is capability-driven and remains free of Instagram/CRM business logic.

The implementation adds a typed INSTAGRAM contact method, explicit human identity handling, compact channel-specific manual facts and a manual workflow in Clients. It does not add Instagram entries to Telegram's conversation list. Existing purchases, notes, lead sources, evidence and sales keep their canonical records.

Grace mapped reuse and identified two existing UI hazards: contact creation on mount and unsafe raw OTHER links. Both are addressed in the shared CRM contact-channel surface. Parnas/Knuth reviewed structure/cost, backend/frontend writes are separate, and Turing performs final read-only integration review. Existing unrelated uncommitted work remains intact.

## Identity and verification semantics

`normalizeInstagramProfile` is a pure shared parser used by API/UI. It accepts a username, @username or supported HTTPS profile URL; normalizes ASCII case, strips tracking query/fragment from the canonical link and preserves the original input. Canonical links target only `https://www.instagram.com/<username>/`. Credentials/ports, non-HTTPS schemes, non-Instagram hosts, nested content/Direct/story routes, reserved route names, control characters, invalid username punctuation/length and encoded-path tricks are rejected. No request checks whether a profile exists.

The canonical method stores raw `value`, normalized username, `identityState` ACTIVE/STALE and separate `ownershipConfirmedAt`/actor. Response `profileVerification` is always UNVERIFIED. Human confirmation says the manager linked this business identity; it does not assert Meta verification, existence, delivery or ownership proved by a platform API. Generic legacy `isVerified` cannot turn an Instagram method into a verified profile.

Workspace/type/normalized-identity uniqueness prevents silently assigning one profile to another client. Similar names, avatars and nearby handles do not merge clients. Add/link is an explicit manager action; an exact conflict requires human resolution under current permissions. Typed Instagram normalization also applies to legacy contact write routes, not just the new screen.

Changing a username invalidates prior ownership confirmation and records compact old/new identity history. Stale methods remain visible for correction. Legacy OTHER entries are not bulk-promoted by a database migration: a manager explicitly reviews/converts/adds the typed profile. There is no automatic lookup or claim that an old username still belongs to the same advertiser. Existing contact merge moves canonical methods/tasks/activities/source candidates, preserves DNC and combines manual timestamps monotonically.

## Manual communication workflow

Client manual status reuses existing `manualSalesStatus`: Interested, Closed, DNC and explicit reset. Waiting/Needs reply/Follow-up due are derived from channel-specific manual facts and the canonical next task. No competing persisted Instagram sales state machine exists.

Manual actions are CONTACTED, WAITING_FOR_REPLY, REPLIED, INTERESTED, CLOSED, DO_NOT_CONTACT, RESET_STATUS and OFFER_SENT. They append compact `TelegramAdvertiserActivity` metadata with `kind=MANUAL_ACTIVITY`, `channel=INSTAGRAM`, action, responsible actor, human-reported time and optional short note. They are not Instagram messages and have no fake message ID, unread count, delivery/read receipt or synchronized transcript.

Only `manualInstagramContactAt` and `manualInstagramReplyAt` plus monotonic general `lastContactAt` change for reported communication. Telegram conversation and advertiser inbound/outbound message facts remain unchanged. A reported reply does not clear DNC. Commercial contacted/waiting/offer and reminder creation respect current DNC/CLOSED/archive state and own/any permissions. Explicit reset is the only way to clear a sticky business decision through this workflow.

Date-prefixed operation IDs, server request fingerprints, workspace uniqueness and current contact locks make command retries idempotent. Reusing a key with another payload/actor/target conflicts; unchanged actions avoid business/audit writes. An expired dated key cannot become a fresh command after receipt retention. Textarea edits stay local until explicit submission; notes are short manual context, not full DM copies.

## API and UX

Base `/telegram-crm/manual-contacts`; shared contracts `crm-instagram-contacts.ts`.

| Endpoint | Behavior |
| --- | --- |
| GET base | Search/status/cursor page, max50 contacts, batch contact methods/manual facts |
| POST base | Explicit real CRM client with typed profile; never merges by display name |
| GET `:id/workflow` | Authoritative methods, manual status/facts, canonical next follow-up and up to20 manual activities/cursor |
| POST `:id/instagram`, PATCH `:id/instagram/:methodId` | Validated explicit method add/update/confirmation/state |
| POST `:id/activities` | Idempotent manual report/status action; optional current candidate/draft references |
| POST `:id/follow-up` | Idempotent canonical task creation without a conversation |
| PATCH `:id/follow-up/:taskId` | Existing reschedule/snooze/complete/cancel semantics |

Clients exposes a compact manual-contacts mode (`?manual=1`), rather than a new fake Inbox channel. Desktop provides list/detail work; mobile uses list→full details/back, not three columns. Profile opening is a safe explicit external action and promises no DM deep-link. Clients/details retain lazy purchases, notes and AI acquisition/preparation. No per-client detail/AI HTTP joins are added to the list.

Contact-channel rendering no longer creates a detected Telegram method on mount. OTHER entries cannot execute javascript/data URLs. Legacy Instagram values are visibly unverified and require an explicit reviewed typed method action. Loading, empty, error, denied, stale identity, collision and pending states are explicit. Controls use existing Nexeloq components, keyboard labels/focus, bounded scrolling and40–44px touch targets. Browser QA covers320/360/390/768/1024/1440px.

Mutation responses reconcile the exact workspace/contact workflow; only affected lists/derived values invalidate. Request keys remain stable across an uncertain HTTP retry. No polling, background synchronization indicator, localStorage transcript or textarea DB write exists.

## AI Leads and Copilot

Instagram public business contacts already appear in Discovery extraction. The strong-identity/linker and candidate preparation gates now accept a normalized Instagram profile only with current literal evidence, advertiser/sales role and human confirmation. Agency/destination links still do not prove the advertiser. Existing Telegram+Instagram identities can belong to one proven client; ambiguity requires review.

Qualified candidates reuse candidate-scoped SALES_FIRST_DRAFT and existing Gateway budgets/receipts. Opening a profile/card never runs AI. Copy re-reads current server approval/freshness, permissions, source basis and DNC. Reporting OFFER_SENT with an AI reference additionally checks current linked client, actor, draft/revision and approved Instagram identity. It records a human report only, not provider SENT/delivery/read state, and does not mutate the original draft's financial/provenance record into a transport receipt.

An Instagram-only client without permitted advertising evidence is not given a fabricated conversation to invoke conversation Copilot. The UI guides the manager through the existing explicit permitted-material Discovery→human candidate link→qualification/draft workflow. Private Instagram correspondence is never assumed synchronized or silently disclosed. Existing general CRM notes remain available; this stage does not automatically add manual activity notes to model input. Prices/purchases and linked-client authorization remain the existing Copilot/Package Sales Context contracts.

## Follow-up and notifications

Follow-up uses `TelegramAdvertiserTask`, existing contact/member/DNC validation, due scheduling, reminders and Operations Notifications. Manual-origin request identity is stored on the task so a retry after a partial response cannot create another reminder. It does not require a peer or conversation. Reminder navigation uses the real CRM client route `/ad-sales/clients/:id`, with current workspace/role/contact visibility at delivery; it never points to an invented chat. Existing task changes retire obsolete reminder occurrences. No Instagram message is sent by a reminder.

No separate reminder store, cron, full-client scan, push transport or stream is added. The existing due scheduler is the only runtime that processes these tasks.

## Schema, retention and costs

Two ordered additive migrations: `20261101120000_crm_instagram_contact_type` adds the enum value and commits it separately; `20261101120100_crm_instagram_manual_contacts` adds contact state/ownership fields, two compact advertiser dates, indexed manual activity/task request receipts and retention/attribution indexes. No new client/message/conversation table, credential column or automatic legacy conversion is introduced.

Manual reports and compact Instagram identity-change audit events are retained for365 days from creation. Existing daily `operational_history.cleanup` adds one bounded delete (20,000 rows globally, SKIP LOCKED) over the indexed manual Instagram subset. Financial/source-attribution activities are preserved. Compact current facts survive history cleanup. This is one additional empty maintenance query/day, not a new wake, worker or zero-cost claim. Existing task/audit retention remains unchanged. At sustained20k new manual reports/day, cleanup has no headroom; multiple workspaces require aggregate capacity review. Sales-linked activity can remain longer for attribution.

At idle there is no new DB read/write, provider/Instagram/Telegram request, connection, worker, deployment or per-channel timer from manual functionality. Costs follow explicit list/detail/actions and existing due tasks. One hundred or1,000 stored contacts/channels do not add recurring work. Full client details/purchases/preparations remain lazy; lists and histories are cursor-bounded and batch relation reads. Source-level data-call estimates below include the returned authoritative workflow and exclude authorization membership/role graph loads, transaction protocol, existing workspace resolution and Prisma physical relation expansion:

| Action | Logical calls | Business row writes |
| --- | ---: | ---: |
| Manual contact list page (max50, batched methods) | 1 | 0 |
| Workflow detail/history/next task | 4 | 0 |
| Create client + profile + audit | 7, plus optional owner-member validation | 3 rows (two Prisma write calls) |
| Add profile | 9, plus optional primary reset | 2, plus changed primary rows |
| Change/confirm/stale profile | 10, plus optional primary reset | 2, plus changed primary rows |
| Unchanged profile Save | 8 | 0 |
| Contacted / Waiting manual report | 11 | 2 |
| Replied / changed sticky status | 10 | 2 |
| Exact activity replay / unchanged status | 8 | 0 |
| Historical report older than compact dates | 9–10 depending action | 1 activity; no unchanged compact write |
| Approved AI offer manual report, selected-product linked context | approximately23 | 2; no provider request |
| Exact manual follow-up receipt replay | approximately10 | 0 |

Manual follow-up creation adds three wrapper contact guards, four authoritative-view reads and two receipt lock/lookup calls above the existing canonical task path. Canonical task creation/notifications/reminder reconciliation retain their existing reads/writes and may depend on recipients/preferences; these are not a claim of constant physical SQL. New dated receipts are indexed; replay occurs before writes. Copy uses the existing server preparation/freshness read (about11 logical reads for a linked selected-product context), no new provider call or Instagram ledger. Open profile is a pure explicit navigation, with no tracking write.

For0/100/1,000 user report actions/day, the Contacted path adds approximately0/1,100/11,000 logical data calls and0/200/2,000 row writes. One hundred/1,000 stored contacts at idle add0 recurring feature calls; interactive pages scale with opened pages/actions. Cleanup adds one bounded query during the existing daily wake regardless of contact count. These estimates are not throughput limits or SaaS-wide capacity promises. Remaining logical read/write evidence is recorded in QA; these are source-level estimates, not Neon bills or Railway RSS/CPU savings. Actual Prisma SQL expansion/query plans, retention lag and due-task load require staging measurement.

## Future official Instagram adapter — documentation only

Checked2026-11-01 against Meta's official material. Direct developers.facebook.com pages returned HTTP429; verified fallback is [Meta's Postman collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api) and its [fbsamples source](https://github.com/fbsamples/messenger-platform-samples/blob/main/postman/instagram-platform-api.postman_collection.json). Reverify chosen API version, access review and permission grants before implementing a connector.

Professional Business/Creator accounts are the supported scope. Instagram Login uses `instagram_business_basic` and `instagram_business_manage_messages`; the Facebook Login path instead depends on a linked Page. The token must come from an authorized account manager. Standard/Advanced access differs for owned versus other managed accounts. The recipient must initiate a supported conversation; a stored profile is not cold-DM authorization. [Meta collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api).

The standard reply window is24h. Approved HUMAN_AGENT permits a human response up to7 days for unresolved user inquiries, not automated/promotional follow-up. App field subscription and professional-account subscription are both required. The collection documents scoped account/user/conversation IDs, reactions/unreactions, seen and inbound edit events; receiving an edit does not prove outbound edit/delete support. Requests inactive30 days may be absent. [Official source](https://github.com/fbsamples/messenger-platform-samples/blob/main/postman/instagram-platform-api.postman_collection.json).

Future implementation decisions, not capabilities promised now:

- Use the selected official OAuth/login product, approved callback URLs, explicit workspace/account ownership, encrypted scoped tokens/revocation and required App Review/access verification. Never ask for a personal Instagram password. Confirm exact Business Verification requirements for the selected app/product before activation.
- Authenticate/verify callback setup and signatures using the selected Meta webhook contract; deduplicate events by real remote identity, recheck current account/workspace and handle revocation. No polling substitute or forged webhook.
- Map account-scoped Instagram IDs and real conversation/message IDs to a future transport adapter. A mutable username/current profile URL is a contact alias, not a platform user ID or conversation primary key. Link to the existing CRM client only with proven identity/human review.
- Reuse `components/chat/types.ts` neutral capabilities. Today all Instagram chat capabilities are unavailable because no transport exists. Future `canSend/canReply/canReact` require proven API scope, conversation initiation/window and current user permission. Keep `canEdit/canDelete/canForward/canUpload/canSendVoice/canFormatText` false until each exact operation is documented and tested; an inbound event is not an outbound capability.
- Show delivery/read facts only from supported official receipts and their real IDs. Preserve unsupported/unknown states, bounded event recovery and retention; do not promise complete personal-history sync or DM deep-links. Keep CRM pricing, qualification, DNC, source processing and human approval outside Shared Chat UI and any future Support product.

No OAuth, webhook endpoint, connector account table, send adapter or universal messaging platform is implemented in this stage.

## Rollout, rollback and limitations

Apply prerequisites and both migrations only to staging through the normal release process, then deploy API/shared/web together. Separate the enum commit before any typed value writes. Inspect existing OTHER entries and conflicts; convert only through explicit human action. Test an Instagram-only and a combined Telegram/Instagram client, own/any roles, DNC, retries, merge, purchases, candidate Copy/manual report and peerless reminder navigation. Resolve the five known global API build errors before claiming a deployable release.

Rollback first stops manual writes/UI entry through deployment controls; retain enum/additive data and current DNC. Prefer forward-compatible application rollback that still understands typed methods and safe links. Do not restore the old unsafe raw-link/mount-write behavior or blindly remove a PostgreSQL enum value. A separately authorized destructive reversal needs data export/conflict review, lossless legacy mapping and receipt/attribution preservation; no automatic down migration is supplied.

Known limits: profile existence/ownership changes cannot be detected without human review; manual reports prove neither sent/delivered/read state nor DM content. Existing candidate UNKNOWN-recovery and collection-projection limits remain as documented in Prompt№8. Future official connectivity requires a Professional account and a separate reviewed implementation; personal-account synchronization remains unsupported.

[QA, screenshots, exact files, commands and manual acceptance](../qa/crm-instagram-contacts/README.md).
